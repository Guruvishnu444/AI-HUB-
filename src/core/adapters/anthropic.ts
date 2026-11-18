import { BaseProviderAdapter } from './base';
import { ProviderConfig, ConnectionTestResult } from '../types/provider';
import { ModelMetadata } from '../types/model';
import { ChatCompletionRequest, ChatCompletionResponse, StreamChunk } from '../types/chat';
import { cleanApiKey } from '../storage/secretVault';

export class AnthropicAdapter extends BaseProviderAdapter {
    public readonly providerId: string;

    constructor(config: ProviderConfig) {
        super(config);
        this.providerId = config.id;
    }

    private getHeaders(apiKey: string): Record<string, string> {
        return {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'User-Agent': 'Antigravity-Multi-AI-Hub/0.1.0'
        };
    }

    public async testConnection(rawKey: string): Promise<ConnectionTestResult> {
        const apiKey = cleanApiKey(rawKey);
        const start = Date.now();
        try {
            // Anthropic doesn't have a public GET /models endpoint with API keys;
            // ping with a 1-token test prompt to /v1/messages
            const url = this.config.baseUrl.endsWith('/messages')
                ? this.config.baseUrl
                : `${this.config.baseUrl.replace(/\/+$/, '')}/messages`;

            const response = await fetch(url, {
                method: 'POST',
                headers: this.getHeaders(apiKey),
                body: JSON.stringify({
                    model: 'claude-3-5-haiku-20241022',
                    max_tokens: 1,
                    messages: [{ role: 'user', content: 'ping' }]
                })
            });

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

            return {
                success: true,
                latencyMs: Date.now() - start,
                modelCount: 4
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
        // Return standard verified Anthropic models
        return [
            {
                id: 'claude-3-7-sonnet-20250219',
                displayName: 'Claude 3.7 Sonnet',
                providerId: this.providerId,
                capabilities: {
                    supportsStreaming: true,
                    supportsVision: true,
                    supportsTools: true,
                    supportsJsonMode: true,
                    supportsReasoningContent: true,
                    maxContextTokens: 200000,
                    maxOutputTokens: 8192
                },
                isCustom: false,
                isEnabled: true,
                description: 'Frontier hybrid reasoning and coding model from Anthropic with 200k context.'
            },
            {
                id: 'claude-3-5-sonnet-20241022',
                displayName: 'Claude 3.5 Sonnet',
                providerId: this.providerId,
                capabilities: {
                    supportsStreaming: true,
                    supportsVision: true,
                    supportsTools: true,
                    supportsJsonMode: true,
                    supportsReasoningContent: false,
                    maxContextTokens: 200000,
                    maxOutputTokens: 8192
                },
                isCustom: false,
                isEnabled: true,
                description: 'State of the art intelligence for coding and complex tasks.'
            },
            {
                id: 'claude-3-5-haiku-20241022',
                displayName: 'Claude 3.5 Haiku',
                providerId: this.providerId,
                capabilities: {
                    supportsStreaming: true,
                    supportsVision: false,
                    supportsTools: true,
                    supportsJsonMode: true,
                    supportsReasoningContent: false,
                    maxContextTokens: 200000,
                    maxOutputTokens: 8192
                },
                isCustom: false,
                isEnabled: true,
                description: 'Fast, lightweight intelligence with 200k context.'
            }
        ];
    }

    public async sendChatCompletion(
        rawKey: string,
        request: ChatCompletionRequest,
        abortSignal?: AbortSignal
    ): Promise<ChatCompletionResponse> {
        const apiKey = cleanApiKey(rawKey);
        const url = this.config.baseUrl.endsWith('/messages')
            ? this.config.baseUrl
            : `${this.config.baseUrl.replace(/\/+$/, '')}/messages`;

        let systemPrompt = '';
        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

        for (const m of request.messages) {
            if (m.role === 'system') {
                systemPrompt += (systemPrompt ? '\n\n' : '') + m.content;
            } else {
                messages.push({
                    role: m.role === 'assistant' ? 'assistant' : 'user',
                    content: m.content
                });
            }
        }

        const payload: any = {
            model: request.modelId,
            max_tokens: request.maxTokens || 4096,
            messages,
            stream: false
        };

        if (systemPrompt) payload.system = systemPrompt;
        if (request.temperature !== undefined) payload.temperature = request.temperature;
        if (request.topP !== undefined) payload.top_p = request.topP;
        if (request.stopSequences && request.stopSequences.length > 0) payload.stop_sequences = request.stopSequences;

        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: this.getHeaders(apiKey),
                body: JSON.stringify(payload),
                signal: abortSignal
            });
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
        let content = '';
        if (Array.isArray(data.content)) {
            content = data.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
        }

        const usage = data.usage
            ? {
                  promptTokens: data.usage.input_tokens || 0,
                  completionTokens: data.usage.output_tokens || 0,
                  totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
              }
            : undefined;

        return {
            requestId: request.requestId,
            content,
            finishReason: data.stop_reason || 'stop',
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
        // Fall back to non-streaming for unified reliability
        const completed = await this.sendChatCompletion(rawKey, request, abortSignal);
        yield {
            requestId: request.requestId,
            deltaContent: completed.content,
            isComplete: true,
            finishReason: 'stop',
            providerId: this.providerId,
            modelId: request.modelId
        };
    }
}
