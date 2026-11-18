import { AdapterRegistry } from '../adapters/registry';
import { SecretVault } from '../storage/secretVault';
import { HubDatabase } from '../storage/database';
import { CircuitBreaker } from './circuitBreaker';
import { ContextTrimmer } from './contextTrimmer';
import { ChatCompletionRequest, ChatCompletionResponse, StreamChunk } from '../types/chat';
import { HubError, HubErrorCode } from '../types/errors';
import { FallbackConfig } from '../types/ipc';

export interface DispatchExecutionResult {
    response?: ChatCompletionResponse;
    stream?: AsyncIterable<StreamChunk>;
    fallbackOccurred: boolean;
    originalProviderId: string;
    resolvedProviderId: string;
    resolvedModelId: string;
}

export class FallbackEngine {
    private registry: AdapterRegistry;
    private vault: SecretVault;
    private db: HubDatabase;
    private circuitBreaker: CircuitBreaker;

    constructor(registry: AdapterRegistry, vault: SecretVault, db: HubDatabase) {
        this.registry = registry;
        this.vault = vault;
        this.db = db;
        const config = db.getFallbackConfig();
        this.circuitBreaker = new CircuitBreaker(
            config.circuitBreakerThreshold,
            config.circuitBreakerCooldownMs
        );
    }

    public updateConfig(config: FallbackConfig): void {
        this.circuitBreaker.updateConfig(
            config.circuitBreakerThreshold,
            config.circuitBreakerCooldownMs
        );
    }

    public isCircuitOpen(providerId: string): boolean {
        return this.circuitBreaker.isOpen(providerId);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Executes non-streaming chat with automated fallback and retry.
     */
    public async dispatchChat(
        request: ChatCompletionRequest,
        abortSignal?: AbortSignal
    ): Promise<DispatchExecutionResult> {
        const fallbackConfig = this.db.getFallbackConfig();
        const initialProviderId = request.providerId;
        const candidateProviders = [initialProviderId];

        if (fallbackConfig.enabled) {
            for (const pid of fallbackConfig.priorityOrder) {
                if (!candidateProviders.includes(pid)) {
                    candidateProviders.push(pid);
                }
            }
        }

        let lastError: any = null;

        for (let i = 0; i < candidateProviders.length; i++) {
            const currentProviderId = candidateProviders[i];
            const isFallbackAttempt = i > 0;

            // 1. Check circuit breaker
            if (this.circuitBreaker.isOpen(currentProviderId)) {
                this.db.logAudit('ERROR', currentProviderId, 'Skipping: Circuit breaker is OPEN', request.modelId);
                continue;
            }

            // 2. Check API key
            const apiKey = await this.vault.getKey(currentProviderId);
            if (!apiKey) {
                if (!isFallbackAttempt) {
                    throw new HubError({
                        code: HubErrorCode.NO_KEY_CONFIGURED,
                        message: `No API key configured for ${currentProviderId}.`,
                        userFacingMessage: `Please configure an API key for ${currentProviderId} in the Provider Manager.`,
                        isRetryable: false,
                        providerId: currentProviderId
                    });
                }
                continue; // Skip fallback provider if user hasn't added key
            }

            // 3. Find adapter
            const adapter = this.registry.getAdapter(currentProviderId);
            if (!adapter) continue;

            // 4. Resolve candidate models for this provider (only usable chat/reasoning models)
            const availableModels = this.db.getModels().filter(m => {
                if (m.providerId !== currentProviderId || !m.isEnabled) return false;
                if (!m.isCustom && (
                    m.id.includes('embedding') ||
                    m.id.includes('aqa') ||
                    m.id.includes('imagen') ||
                    m.id.includes('whisper') ||
                    m.id.includes('bison') ||
                    (m.providerId === 'google-gemini' && m.id.includes('gemma'))
                )) {
                    return false;
                }
                return true;
            });
            if (availableModels.length === 0) continue;

            const modelsToAttempt: string[] = [];
            if (!isFallbackAttempt) {
                modelsToAttempt.push(request.modelId);
                // Also add other models for this provider as alternate model fallbacks
                if (fallbackConfig.enabled) {
                    availableModels.forEach(m => {
                        if (m.id !== request.modelId && !modelsToAttempt.includes(m.id)) {
                            modelsToAttempt.push(m.id);
                        }
                    });
                }
            } else {
                availableModels.forEach(m => modelsToAttempt.push(m.id));
            }

            for (let mIdx = 0; mIdx < modelsToAttempt.length; mIdx++) {
                const targetModelId = modelsToAttempt[mIdx];
                const isModelFallback = isFallbackAttempt || mIdx > 0;
                const targetModel = this.db.getModel(targetModelId);

                let activeRequest = { ...request, providerId: currentProviderId, modelId: targetModelId };
                if (targetModel) {
                    const { trimmedRequest } = ContextTrimmer.trimForModel(activeRequest, targetModel);
                    activeRequest = trimmedRequest;
                }

                // 5. Attempt request with retry on 429/5xx
                let attempt = 0;
                const maxRetries = fallbackConfig.maxRetriesPerProvider;

                while (attempt <= maxRetries) {
                    if (abortSignal?.aborted) {
                        throw new Error('Request aborted by user');
                    }

                    try {
                        const response = await adapter.sendChatCompletion(apiKey, activeRequest, abortSignal);
                        this.circuitBreaker.recordSuccess(currentProviderId);

                        if (isModelFallback) {
                            this.db.logAudit(
                                'FALLBACK',
                                currentProviderId,
                                `Successfully resolved via fallback to ${currentProviderId} (${targetModelId})`,
                                targetModelId
                            );
                        }

                        return {
                            response,
                            fallbackOccurred: isModelFallback,
                            originalProviderId: initialProviderId,
                            resolvedProviderId: currentProviderId,
                            resolvedModelId: targetModelId
                        };
                    } catch (err: any) {
                        lastError = err;
                        const hubError: HubError = err instanceof HubError ? err : (err as any);
                        const errMsg = (hubError?.details?.message || String(err)).toLowerCase();
                        const isRetryable = hubError?.details?.isRetryable;

                        // Daily quota limits and exhausted credits cannot be resolved by 3-second retries
                        const isExhaustedQuota = errMsg.includes('quota') ||
                                                errMsg.includes('resource_exhausted') ||
                                                errMsg.includes('free_tier_requests') ||
                                                errMsg.includes('daily') ||
                                                errMsg.includes('per day') ||
                                                errMsg.includes('limit exceeded') ||
                                                errMsg.includes('insufficient');

                        if (!isRetryable || isExhaustedQuota) {
                            // Non-retryable or permanent quota error -> record failure and immediately switch to next model/provider
                            this.circuitBreaker.recordFailure(currentProviderId);
                            this.db.logAudit(
                                'ERROR',
                                currentProviderId,
                                isExhaustedQuota
                                    ? `Quota exceeded for ${targetModelId}. Immediately switching to alternate model/provider: ${hubError?.details?.message || String(err)}`
                                    : (hubError?.details?.message || String(err)),
                                targetModelId
                            );
                            break; // try next candidate model or provider immediately
                        }

                        // Short-term rate limit or server hiccup: handle 429 / 503 backoff
                        attempt++;
                        this.circuitBreaker.recordFailure(currentProviderId);

                        if (attempt <= maxRetries) {
                            const delaySec = hubError.details?.retryAfterSeconds || Math.min(2 ** attempt, 6);
                            this.db.logAudit(
                                'RETRY',
                                currentProviderId,
                                `Retrying after ${delaySec}s (attempt ${attempt}/${maxRetries}): ${hubError.details?.message}`,
                                targetModelId
                            );
                            await this.sleep(delaySec * 1000);
                        } else {
                            this.db.logAudit(
                                'ERROR',
                                currentProviderId,
                                `Max retries reached for ${targetModelId}. Moving to fallback model/provider.`,
                                targetModelId
                            );
                            break; // try next model
                        }
                    }
                }
            }
        }

        throw (
            lastError ||
            new HubError({
                code: HubErrorCode.UNKNOWN,
                message: 'All available providers in the fallback chain failed.',
                userFacingMessage: 'Unable to complete request. All configured providers failed or were unavailable.',
                isRetryable: false
            })
        );
    }
}
