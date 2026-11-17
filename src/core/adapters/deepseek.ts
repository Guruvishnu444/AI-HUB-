import { BaseProviderAdapter } from './base';
import { ProviderConfig, ConnectionTestResult } from '../types/provider';
import { ModelMetadata } from '../types/model';
import { ChatCompletionRequest, ChatCompletionResponse, StreamChunk } from '../types/chat';
import { cleanApiKey } from '../storage/secretVault';

export class DeepSeekAdapter extends BaseProviderAdapter {
    public readonly providerId = 'deepseek';

    constructor(config: ProviderConfig) {
        super(config);
    }

    public async testConnection(rawKey: string): Promise<ConnectionTestResult> {
        const apiKey = cleanApiKey(rawKey);
        const start = Date.now();
        try {
            let url = `${this.config.baseUrl}/models`;
            let response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            // If base/models 404s, try /v1/models
            if (response.status === 404 && !this.config.baseUrl.endsWith('/v1')) {
                url = `${this.config.baseUrl}/v1/models`;
                response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                });
            }

            if (!response.ok) {
                const errBody = await response.text();
                let errMsg = `HTTP ${response.status}: ${errBody}`;
                try {
                    const parsed = JSON.parse(errBody);
                    if (parsed.error && parsed.error.message) {
                        errMsg = parsed.error.message;
                    }
                } catch {
                    // keep raw
                }
                throw new Error(errMsg);
            }

            const data = (await response.json()) as any;
            const models = data.data || [];

            return {
                success: true,
                latencyMs: Date.now() - start,
                modelCount: models.length
            };
        } catch (err: any) {
            const sanitized = this.sanitizeError(err, apiKey);
            return {
                success: false,
                latencyMs: Date.now() - start,
                errorMessage: sanitized.details.userFacingMessage
            };
        }
    }

    public async discoverModels(rawKey: string): Promise<ModelMetadata[]> {
        const apiKey = cleanApiKey(rawKey);
        let url = `${this.config.baseUrl}/models`;
        let response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 404 && !this.config.baseUrl.endsWith('/v1')) {
            url = `${this.config.baseUrl}/v1/models`;
            response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
        }

        if (!response.ok) {
            const errBody = await response.text();
            throw this.sanitizeError(new Error(`HTTP ${response.status}: ${errBody}`), apiKey);
        }

        const data = (await response.json()) as any;
        const rawModels: any[] = data.data || [];

        return rawModels.map((m: any) => {
            const isReasoner = m.id.includes('reasoner') || m.id.includes('r1');
            return {
                id: m.id,
                displayName: isReasoner ? 'DeepSeek Reasoner (R1)' : 'DeepSeek Chat (V3)',
                providerId: this.providerId,
                capabilities: {
                    supportsStreaming: true,
                    supportsVision: false,
                    supportsTools: !isReasoner,
                    supportsJsonMode: !isReasoner,
                    supportsReasoningContent: isReasoner,
                    maxContextTokens: 65536,
                    maxOutputTokens: 8192
                },
                isCustom: false,
                isEnabled: true,
                description: isReasoner
                    ? 'Frontier reasoning model with native Chain-of-Thought.'
                    : 'High-capability conversational and coding model.'
            };
        });
    }

    private formatDeepSeekPayload(request: ChatCompletionRequest, stream: boolean): any {
        const isReasoner = request.modelId.includes('reasoner');

        // Clean messages: for deepseek-reasoner, strip reasoning_content from prior assistant messages
        const formattedMessages = request.messages.map(m => {
            return {
                role: m.role,
                content: m.content
            };
        });

        const payload: any = {
            model: request.modelId,
            messages: formattedMessages,
            stream
        };

        if (!isReasoner) {
            if (request.temperature !== undefined) payload.temperature = request.temperature;
            if (request.topP !== undefined) payload.top_p = request.topP;
        }

        if (request.maxTokens !== undefined) payload.max_tokens = request.maxTokens;
        if (request.stopSequences && request.stopSequences.length > 0) payload.stop = request.stopSequences;

        return payload;
    }

    public async sendChatCompletion(
        rawKey: string,
        request: ChatCompletionRequest,
        abortSignal?: AbortSignal
    ): Promise<ChatCompletionResponse> {
        const apiKey = cleanApiKey(rawKey);
        let url = `${this.config.baseUrl}/chat/completions`;
        const payload = this.formatDeepSeekPayload(request, false);

        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: abortSignal
            });

            if (response.status === 404 && !this.config.baseUrl.endsWith('/v1')) {
                url = `${this.config.baseUrl}/v1/chat/completions`;
                response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    signal: abortSignal
                });
            }
        } catch (err) {
            throw this.sanitizeError(err, apiKey);
        }

        if (!response.ok) {
            const errBody = await response.text();
            throw this.sanitizeError(new Error(`HTTP ${response.status}: ${errBody}`), apiKey);
        }

        const data = (await response.json()) as any;
        const choice = data.choices?.[0];
        const content = choice?.message?.content || '';
        const reasoningContent = choice?.message?.reasoning_content;
        const finishReason = choice?.finish_reason || 'stop';

        const usage = data.usage
            ? {
                  promptTokens: data.usage.prompt_tokens || 0,
                  completionTokens: data.usage.completion_tokens || 0,
                  totalTokens: data.usage.total_tokens || 0
              }
            : undefined;

        return {
            requestId: request.requestId,
            content,
            reasoningContent,
            finishReason,
            usage,
            providerId: this.providerId,
            modelId: request.modelId
        };
    }

    public async *streamChatCompletion(
        rawKey: string,
        request: ChatCompletionRequest,
        abortSignal?: AbortSignal
    ): AsyncIterable<StreamChunk> {
        const apiKey = cleanApiKey(rawKey);
        let url = `${this.config.baseUrl}/chat/completions`;
        const payload = this.formatDeepSeekPayload(request, true);

        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: abortSignal
            });

            if (response.status === 404 && !this.config.baseUrl.endsWith('/v1')) {
                url = `${this.config.baseUrl}/v1/chat/completions`;
                response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    signal: abortSignal
                });
            }
        } catch (err) {
            throw this.sanitizeError(err, apiKey);
        }

        if (!response.ok) {
            const errBody = await response.text();
            throw this.sanitizeError(new Error(`HTTP ${response.status}: ${errBody}`), apiKey);
        }

        if (!response.body) {
            throw new Error('Readable stream not supported on response');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data:')) continue;

                    const jsonStr = trimmed.replace(/^data:\s*/, '');
                    if (jsonStr === '[DONE]') {
                        yield {
                            requestId: request.requestId,
                            deltaContent: '',
                            isComplete: true,
                            finishReason: 'stop',
                            providerId: this.providerId,
                            modelId: request.modelId
                        };
                        return;
                    }

                    try {
                        const parsed = JSON.parse(jsonStr);
                        const choice = parsed.choices?.[0];
                        const delta = choice?.delta;
                        const deltaContent = delta?.content || '';
                        const deltaReasoning = delta?.reasoning_content;
                        const finishReason = choice?.finish_reason;

                        const usage = parsed.usage
                            ? {
                                  promptTokens: parsed.usage.prompt_tokens || 0,
                                  completionTokens: parsed.usage.completion_tokens || 0,
                                  totalTokens: parsed.usage.total_tokens || 0
                              }
                            : undefined;

                        yield {
                            requestId: request.requestId,
                            deltaContent,
                            deltaReasoning,
                            isComplete: !!finishReason,
                            finishReason,
                            usage,
                            providerId: this.providerId,
                            modelId: request.modelId
                        };
                    } catch {
                        // ignore chunk JSON parse error
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
}
