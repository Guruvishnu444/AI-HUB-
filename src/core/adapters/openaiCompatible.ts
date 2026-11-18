import { BaseProviderAdapter } from './base';
import { ProviderConfig, ConnectionTestResult } from '../types/provider';
import { ModelMetadata } from '../types/model';
import { ChatCompletionRequest, ChatCompletionResponse, StreamChunk } from '../types/chat';
import { cleanApiKey } from '../storage/secretVault';

export class OpenAICompatibleAdapter extends BaseProviderAdapter {
    public readonly providerId: string;

    constructor(config: ProviderConfig) {
        super(config);
        this.providerId = config.id;
    }

    private getEndpointUrl(path: string): string {
        const base = this.config.baseUrl.replace(/\/+$/, '');
        const cleanPath = path.replace(/^\/+/, '');
        return `${base}/${cleanPath}`;
    }

    public async testConnection(rawKey: string): Promise<ConnectionTestResult> {
        const apiKey = cleanApiKey(rawKey);
        const start = Date.now();
        try {
            let url = this.getEndpointUrl('/models');
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'User-Agent': 'Antigravity-Multi-AI-Hub/0.1.0'
            };
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            if (this.config.baseUrl.includes('openrouter.ai')) {
                headers['HTTP-Referer'] = 'https://antigravity.hub';
                headers['X-Title'] = 'Antigravity Multi-AI Hub';
            }

            let response = await fetch(url, { method: 'GET', headers });

            // If 404, try with /v1/models if base didn't include /v1
            if (response.status === 404 && !this.config.baseUrl.includes('/v1')) {
                url = this.getEndpointUrl('/v1/models');
                response = await fetch(url, { method: 'GET', headers });
            }

            // If still 404, ping chat/completions to check if endpoint is alive
            if (response.status === 404) {
                let chatUrl = this.getEndpointUrl('/chat/completions');
                if (!this.config.baseUrl.includes('/v1')) {
                    chatUrl = this.getEndpointUrl('/v1/chat/completions');
                }
                const pingRes = await fetch(chatUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model: 'test',
                        messages: [{ role: 'user', content: 'ping' }],
                        max_tokens: 1
                    })
                });
                if (pingRes.ok || (pingRes.status === 400 && !(await pingRes.clone().text()).includes('API key') && !(await pingRes.clone().text()).includes('Unauthorized'))) {
                    return {
                        success: true,
                        latencyMs: Date.now() - start,
                        modelCount: 1
                    };
                }
                response = pingRes;
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
                const err: any = new Error(errMsg);
                err.status = response.status;
                throw err;
            }

            const data = (await response.json()) as any;
            const models = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];

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
        let url = this.getEndpointUrl('/models');
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        let response = await fetch(url, { method: 'GET', headers });

        if (response.status === 404 && !this.config.baseUrl.includes('/v1')) {
            url = this.getEndpointUrl('/v1/models');
            response = await fetch(url, { method: 'GET', headers });
        }

        if (!response.ok) {
            const errBody = await response.text();
            let errMsg = `HTTP ${response.status}: ${errBody}`;
            try {
                const parsed = JSON.parse(errBody);
                if (parsed.error && parsed.error.message) errMsg = parsed.error.message;
            } catch {}
            const err: any = new Error(errMsg);
            err.status = response.status;
            throw this.sanitizeError(err, apiKey);
        }

        const data = (await response.json()) as any;
        const rawModels: any[] = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];

        return rawModels.map((m: any) => {
            const id = typeof m === 'string' ? m : m.id || m.name;
            return {
                id,
                displayName: id,
                providerId: this.providerId,
                capabilities: {
                    supportsStreaming: true,
                    supportsVision: false,
                    supportsTools: true,
                    supportsJsonMode: true,
                    supportsReasoningContent: false,
                    maxContextTokens: 128000,
                    maxOutputTokens: 4096
                },
                isCustom: true,
                isEnabled: true,
                description: `Discovered from ${this.config.name}`
            };
        });
    }

    public async sendChatCompletion(
        rawKey: string,
        request: ChatCompletionRequest,
        abortSignal?: AbortSignal
    ): Promise<ChatCompletionResponse> {
        const apiKey = cleanApiKey(rawKey);
        let url = this.getEndpointUrl('/chat/completions');

        const formattedMessages = request.messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        const payload: any = {
            model: request.modelId,
            messages: formattedMessages,
            stream: false
        };

        if (request.temperature !== undefined) payload.temperature = request.temperature;
        if (request.topP !== undefined) payload.top_p = request.topP;
        if (request.maxTokens !== undefined) payload.max_tokens = request.maxTokens;
        if (request.stopSequences && request.stopSequences.length > 0) payload.stop = request.stopSequences;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: abortSignal
            });

            if (response.status === 404 && !this.config.baseUrl.includes('/v1')) {
                url = this.getEndpointUrl('/v1/chat/completions');
                response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                    signal: abortSignal
                });
            }
        } catch (err) {
            throw this.sanitizeError(err, apiKey);
        }

        if (!response.ok) {
            const errBody = await response.text();
            let errMsg = `HTTP ${response.status}: ${errBody}`;
            try {
                const parsed = JSON.parse(errBody);
                if (parsed.error && parsed.error.message) errMsg = parsed.error.message;
            } catch {}
            const err: any = new Error(errMsg);
            err.status = response.status;
            throw this.sanitizeError(err, apiKey);
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
        let url = this.getEndpointUrl('/chat/completions');

        const formattedMessages = request.messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        const payload: any = {
            model: request.modelId,
            messages: formattedMessages,
            stream: true
        };

        if (request.temperature !== undefined) payload.temperature = request.temperature;
        if (request.topP !== undefined) payload.top_p = request.topP;
        if (request.maxTokens !== undefined) payload.max_tokens = request.maxTokens;
        if (request.stopSequences && request.stopSequences.length > 0) payload.stop = request.stopSequences;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: abortSignal
            });

            if (response.status === 404 && !this.config.baseUrl.includes('/v1')) {
                url = this.getEndpointUrl('/v1/chat/completions');
                response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                    signal: abortSignal
                });
            }
        } catch (err) {
            throw this.sanitizeError(err, apiKey);
        }

        if (!response.ok) {
            const errBody = await response.text();
            let errMsg = `HTTP ${response.status}: ${errBody}`;
            try {
                const parsed = JSON.parse(errBody);
                if (parsed.error && parsed.error.message) errMsg = parsed.error.message;
            } catch {}
            const err: any = new Error(errMsg);
            err.status = response.status;
            throw this.sanitizeError(err, apiKey);
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
