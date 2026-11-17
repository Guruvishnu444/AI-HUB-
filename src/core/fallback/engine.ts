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

            // 4. Resolve target model
            let targetModelId = request.modelId;
            if (isFallbackAttempt) {
                const availableModels = this.db.getModels().filter(m => m.providerId === currentProviderId && m.isEnabled);
                if (availableModels.length === 0) continue;
                targetModelId = availableModels[0].id;
            }

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

                    if (isFallbackAttempt) {
                        this.db.logAudit(
                            'FALLBACK',
                            currentProviderId,
                            `Successfully fell back from ${initialProviderId} to ${currentProviderId} (${targetModelId})`,
                            targetModelId
                        );
                    }

                    return {
                        response,
                        fallbackOccurred: isFallbackAttempt,
                        originalProviderId: initialProviderId,
                        resolvedProviderId: currentProviderId,
                        resolvedModelId: targetModelId
                    };
                } catch (err: any) {
                    lastError = err;
                    const hubError: HubError = err instanceof HubError ? err : (err as any);
                    const isRetryable = hubError?.details?.isRetryable;

                    if (!isRetryable) {
                        // Non-retryable error (e.g. 401 Auth Failed or Insufficient Balance) -> trip or halt
                        this.circuitBreaker.recordFailure(currentProviderId);
                        this.db.logAudit('ERROR', currentProviderId, hubError.details?.message || String(err), targetModelId);
                        if (!fallbackConfig.enabled || isFallbackAttempt) {
                            throw hubError;
                        }
                        // Break out of retry loop to try next candidate in fallback chain
                        break;
                    }

                    // Retryable error: handle 429 Retry-After or exponential backoff
                    attempt++;
                    this.circuitBreaker.recordFailure(currentProviderId);

                    if (attempt <= maxRetries) {
                        const delaySec = hubError.details?.retryAfterSeconds || Math.min(2 ** attempt, 8);
                        this.db.logAudit(
                            'RETRY',
                            currentProviderId,
                            `Retrying after ${delaySec}s (attempt ${attempt}/${maxRetries}): ${hubError.details?.message}`,
                            targetModelId
                        );
                        await this.sleep(delaySec * 1000);
                    } else {
                        // Max retries exceeded on this provider
                        this.db.logAudit(
                            'ERROR',
                            currentProviderId,
                            `Max retries exceeded for ${currentProviderId}. Moving to fallback.`,
                            targetModelId
                        );
                        break;
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
