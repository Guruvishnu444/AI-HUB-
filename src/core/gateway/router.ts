import * as vscode from 'vscode';
import { SecretVault } from '../storage/secretVault';
import { HubDatabase } from '../storage/database';
import { AdapterRegistry } from '../adapters/registry';
import { FallbackEngine } from '../fallback/engine';
import { WebviewToHostMessage, HostToWebviewMessage, ProviderSummary } from '../types/ipc';
import { ChatMessage, ChatCompletionRequest } from '../types/chat';
import { HubError } from '../types/errors';

export class GatewayRouter {
    private vault: SecretVault;
    private db: HubDatabase;
    private registry: AdapterRegistry;
    private fallbackEngine: FallbackEngine;
    private messages: ChatMessage[] = [];
    private activeProviderId = 'google-gemini';
    private activeModelId = 'gemini-2.5-flash';
    private activeAbortControllers: Map<string, AbortController> = new Map();

    constructor(vault: SecretVault, db: HubDatabase, registry: AdapterRegistry) {
        this.vault = vault;
        this.db = db;
        this.registry = registry;
        this.fallbackEngine = new FallbackEngine(registry, vault, db);
    }

    public async handleWebviewMessage(
        msg: WebviewToHostMessage,
        postMessage: (out: HostToWebviewMessage) => void
    ): Promise<void> {
        switch (msg.type) {
            case 'INIT_STATE': {
                await this.syncState(postMessage);
                break;
            }

            case 'SAVE_KEY': {
                try {
                    await this.vault.saveKey(msg.providerId, msg.apiKey);
                    this.db.logAudit('KEY_CHANGE', msg.providerId, 'API key securely saved to Windows Credential Store');
                    postMessage({ type: 'KEY_SAVED', providerId: msg.providerId, success: true });
                    postMessage({
                        type: 'SHOW_NOTIFICATION',
                        message: `API Key saved securely in Windows Credential Store for ${msg.providerId}.`,
                        severity: 'info'
                    });
                    await this.syncState(postMessage);
                } catch (err: any) {
                    postMessage({
                        type: 'SHOW_NOTIFICATION',
                        message: `Failed to save key: ${err?.message || err}`,
                        severity: 'error'
                    });
                }
                break;
            }

            case 'DELETE_KEY': {
                await this.vault.deleteKey(msg.providerId);
                this.db.logAudit('KEY_CHANGE', msg.providerId, 'API key deleted from Windows Credential Store');
                postMessage({ type: 'KEY_DELETED', providerId: msg.providerId });
                await this.syncState(postMessage);
                break;
            }

            case 'TEST_CONNECTION': {
                const apiKey = await this.vault.getKey(msg.providerId);
                if (!apiKey) {
                    postMessage({
                        type: 'CONNECTION_TEST_RESULT',
                        providerId: msg.providerId,
                        result: {
                            success: false,
                            latencyMs: 0,
                            errorMessage: 'No API key configured. Please enter and save an API key first.'
                        }
                    });
                    return;
                }

                const adapter = this.registry.getAdapter(msg.providerId);
                if (!adapter) {
                    postMessage({
                        type: 'CONNECTION_TEST_RESULT',
                        providerId: msg.providerId,
                        result: {
                            success: false,
                            latencyMs: 0,
                            errorMessage: `No adapter found for provider: ${msg.providerId}`
                        }
                    });
                    return;
                }

                const result = await adapter.testConnection(apiKey);
                postMessage({ type: 'CONNECTION_TEST_RESULT', providerId: msg.providerId, result });
                break;
            }

            case 'DISCOVER_MODELS': {
                const apiKey = await this.vault.getKey(msg.providerId);
                if (!apiKey) {
                    postMessage({
                        type: 'SHOW_NOTIFICATION',
                        message: 'Configure and save an API key before discovering models.',
                        severity: 'warn'
                    });
                    return;
                }

                const adapter = this.registry.getAdapter(msg.providerId);
                if (!adapter) return;

                try {
                    const discovered = await adapter.discoverModels(apiKey);
                    for (const m of discovered) {
                        await this.db.addOrUpdateModel(m);
                    }
                    postMessage({
                        type: 'SHOW_NOTIFICATION',
                        message: `Discovered and registered ${discovered.length} models from ${msg.providerId}.`,
                        severity: 'info'
                    });
                    await this.syncState(postMessage);
                } catch (err: any) {
                    postMessage({
                        type: 'SHOW_NOTIFICATION',
                        message: `Model discovery failed: ${err?.message || err}`,
                        severity: 'error'
                    });
                }
                break;
            }

            case 'ADD_CUSTOM_MODEL': {
                await this.db.addOrUpdateModel(msg.model);
                postMessage({
                    type: 'SHOW_NOTIFICATION',
                    message: `Custom model ${msg.model.displayName} (${msg.model.id}) added.`,
                    severity: 'info'
                });
                await this.syncState(postMessage);
                break;
            }

            case 'TOGGLE_MODEL': {
                await this.db.setModelEnabled(msg.modelId, msg.enabled);
                await this.syncState(postMessage);
                break;
            }

            case 'UPDATE_FALLBACK_CONFIG': {
                await this.db.updateFallbackConfig(msg.config);
                this.fallbackEngine.updateConfig(msg.config);
                postMessage({
                    type: 'SHOW_NOTIFICATION',
                    message: 'Fallback preferences updated.',
                    severity: 'info'
                });
                await this.syncState(postMessage);
                break;
            }

            case 'SEND_PROMPT': {
                await this.handleSendPrompt(msg, postMessage);
                break;
            }

            case 'ABORT_PROMPT': {
                const controller = this.activeAbortControllers.get(msg.requestId);
                if (controller) {
                    controller.abort();
                    this.activeAbortControllers.delete(msg.requestId);
                }
                break;
            }

            case 'CLEAR_HISTORY': {
                this.messages = [];
                await this.syncState(postMessage);
                break;
            }

            case 'OPEN_EXTERNAL_URL': {
                vscode.env.openExternal(vscode.Uri.parse(msg.url));
                break;
            }
        }
    }

    private async handleSendPrompt(
        msg: { prompt: string; providerId: string; modelId: string; attachments?: any[] },
        postMessage: (out: HostToWebviewMessage) => void
    ): Promise<void> {
        this.activeProviderId = msg.providerId;
        this.activeModelId = msg.modelId;

        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const abortController = new AbortController();
        this.activeAbortControllers.set(requestId, abortController);

        // Add User Message to History
        const userMsg: ChatMessage = {
            id: `msg_u_${Date.now()}`,
            role: 'user',
            content: msg.prompt,
            attachments: msg.attachments,
            timestamp: Date.now()
        };
        this.messages.push(userMsg);

        postMessage({
            type: 'STREAM_START',
            requestId,
            providerId: msg.providerId,
            modelId: msg.modelId
        });

        const historyForRequest = this.messages.map(m => ({
            role: m.role,
            content: m.content,
            attachments: m.attachments
        }));

        const request: ChatCompletionRequest = {
            requestId,
            providerId: msg.providerId,
            modelId: msg.modelId,
            messages: historyForRequest
        };

        const startTime = Date.now();

        try {
            const execution = await this.fallbackEngine.dispatchChat(request, abortController.signal);

            const content = execution.response?.content || '';
            const reasoningContent = execution.response?.reasoningContent;

            const assistantMsg: ChatMessage = {
                id: `msg_a_${Date.now()}`,
                role: 'assistant',
                content,
                reasoningContent,
                providerId: execution.resolvedProviderId,
                modelId: execution.resolvedModelId,
                fallbackOccurred: execution.fallbackOccurred,
                originalProviderId: execution.originalProviderId,
                timestamp: Date.now()
            };

            this.messages.push(assistantMsg);

            // Record usage
            const usage = execution.response?.usage || {
                promptTokens: Math.ceil(msg.prompt.length / 4),
                completionTokens: Math.ceil(content.length / 4),
                totalTokens: Math.ceil((msg.prompt.length + content.length) / 4)
            };

            await this.db.recordUsage({
                id: `use_${Date.now()}`,
                timestamp: Date.now(),
                providerId: execution.resolvedProviderId,
                modelId: execution.resolvedModelId,
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                totalTokens: usage.totalTokens,
                latencyMs: Date.now() - startTime,
                success: true,
                fallbackOccurred: execution.fallbackOccurred
            });

            postMessage({
                type: 'STREAM_END',
                requestId,
                message: assistantMsg,
                fallbackOccurred: execution.fallbackOccurred,
                originalProviderId: execution.originalProviderId
            });
        } catch (err: any) {
            const hubError: HubError = err instanceof HubError ? err : (err as any);
            const details = hubError.details || {
                code: 'UNKNOWN',
                message: String(err),
                userFacingMessage: err?.message || String(err),
                isRetryable: false,
                providerId: msg.providerId,
                modelId: msg.modelId
            };

            postMessage({
                type: 'STREAM_ERROR',
                requestId,
                error: details
            });
        } finally {
            this.activeAbortControllers.delete(requestId);
        }
    }

    private async syncState(postMessage: (out: HostToWebviewMessage) => void): Promise<void> {
        const providers = this.db.getProviders();
        const models = this.db.getModels();
        const fallbackConfig = this.db.getFallbackConfig();

        const summaries: ProviderSummary[] = [];

        for (const p of providers) {
            const hasKey = await this.vault.hasKey(p.id);
            const providerModels = models.filter(m => m.providerId === p.id);
            const isCircuitOpen = this.fallbackEngine.isCircuitOpen(p.id);

            summaries.push({
                config: p,
                isKeyConfigured: hasKey,
                models: providerModels,
                isCircuitOpen
            });
        }

        postMessage({
            type: 'SYNC_STATE',
            providers: summaries,
            fallbackConfig,
            messages: this.messages,
            activeProviderId: this.activeProviderId,
            activeModelId: this.activeModelId
        });
    }
}
