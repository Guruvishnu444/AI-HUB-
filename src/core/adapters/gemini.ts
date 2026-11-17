import { BaseProviderAdapter } from './base';
import { ProviderConfig, ConnectionTestResult } from '../types/provider';
import { ModelMetadata } from '../types/model';
import { ChatCompletionRequest, ChatCompletionResponse, StreamChunk } from '../types/chat';

export class GeminiAdapter extends BaseProviderAdapter {
    public readonly providerId = 'google-gemini';

    constructor(config: ProviderConfig) {
        super(config);
    }

    public async testConnection(apiKey: string): Promise<ConnectionTestResult> {
        const start = Date.now();
        try {
            const url = `${this.config.baseUrl}/models?key=${encodeURIComponent(apiKey)}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errBody = await response.text();
                throw new Error(`HTTP ${response.status}: ${errBody}`);
            }

            const data = (await response.json()) as any;
            const models = data.models || [];

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

    public async discoverModels(apiKey: string): Promise<ModelMetadata[]> {
        const url = `${this.config.baseUrl}/models?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw this.sanitizeError(new Error(`HTTP ${response.status}: ${errBody}`), apiKey);
        }

        const data = (await response.json()) as any;
        const rawModels: any[] = data.models || [];

        return rawModels
            .filter((m: any) => m.name && m.supportedGenerationMethods?.includes('generateContent'))
            .map((m: any) => {
                const id = m.name.replace(/^models\//, '');
                const maxTokens = m.inputTokenLimit || 1048576;
                const outputTokens = m.outputTokenLimit || 8192;

                return {
                    id,
                    displayName: m.displayName || id,
                    providerId: this.providerId,
                    capabilities: {
                        supportsStreaming: true,
                        supportsVision: true,
                        supportsTools: true,
                        supportsJsonMode: true,
                        supportsReasoningContent: id.includes('2.5') || id.includes('flash'),
                        maxContextTokens: maxTokens,
                        maxOutputTokens: outputTokens
                    },
                    isCustom: false,
                    isEnabled: true,
                    description: m.description
                };
            });
    }

    private formatGeminiPayload(request: ChatCompletionRequest): any {
        let systemText = '';
        const contents: any[] = [];

        for (const msg of request.messages) {
            if (msg.role === 'system') {
                systemText += (systemText ? '\n\n' : '') + msg.content;
                continue;
            }

            const role = msg.role === 'assistant' ? 'model' : 'user';
            const parts: any[] = [{ text: msg.content }];

            if (msg.attachments && msg.attachments.length > 0) {
                for (const att of msg.attachments) {
                    parts.push({
                        inlineData: {
                            mimeType: att.mimeType,
                            data: att.dataBase64
                        }
                    });
                }
            }

            contents.push({ role, parts });
        }

        const payload: any = { contents };

        if (systemText) {
            payload.systemInstruction = {
                parts: [{ text: systemText }]
            };
        }

        const generationConfig: any = {};
        if (request.temperature !== undefined) generationConfig.temperature = request.temperature;
        if (request.topP !== undefined) generationConfig.topP = request.topP;
        if (request.maxTokens !== undefined) generationConfig.maxOutputTokens = request.maxTokens;
        if (request.stopSequences && request.stopSequences.length > 0) generationConfig.stopSequences = request.stopSequences;

        if (Object.keys(generationConfig).length > 0) {
            payload.generationConfig = generationConfig;
        }

        return payload;
    }

    public async sendChatCompletion(
        apiKey: string,
        request: ChatCompletionRequest,
        abortSignal?: AbortSignal
    ): Promise<ChatCompletionResponse> {
        const modelName = request.modelId.replace(/^models\//, '');
        const url = `${this.config.baseUrl}/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const payload = this.formatGeminiPayload(request);

        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: abortSignal
            });
        } catch (err) {
            throw this.sanitizeError(err, apiKey);
        }

        if (!response.ok) {
            const errBody = await response.text();
            throw this.sanitizeError(new Error(`HTTP ${response.status}: ${errBody}`), apiKey);
        }

        const data = (await response.json()) as any;
        const candidate = data.candidates?.[0];
        const content = candidate?.content?.parts?.map((p: any) => p.text).join('') || '';
        const finishReason = candidate?.finishReason || 'stop';

        const usage = data.usageMetadata
            ? {
                  promptTokens: data.usageMetadata.promptTokenCount || 0,
                  completionTokens: data.usageMetadata.candidatesTokenCount || 0,
                  totalTokens: data.usageMetadata.totalTokenCount || 0
              }
            : undefined;

        return {
            requestId: request.requestId,
            content,
            finishReason,
            usage,
            providerId: this.providerId,
            modelId: request.modelId
        };
    }

    public async *streamChatCompletion(
        apiKey: string,
        request: ChatCompletionRequest,
        abortSignal?: AbortSignal
    ): AsyncIterable<StreamChunk> {
        const modelName = request.modelId.replace(/^models\//, '');
        const url = `${this.config.baseUrl}/models/${modelName}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
        const payload = this.formatGeminiPayload(request);

        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: abortSignal
            });
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
                        const candidate = parsed.candidates?.[0];
                        const textDelta = candidate?.content?.parts?.map((p: any) => p.text).join('') || '';
                        const finishReason = candidate?.finishReason;

                        const usage = parsed.usageMetadata
                            ? {
                                  promptTokens: parsed.usageMetadata.promptTokenCount || 0,
                                  completionTokens: parsed.usageMetadata.candidatesTokenCount || 0,
                                  totalTokens: parsed.usageMetadata.totalTokenCount || 0
                              }
                            : undefined;

                        yield {
                            requestId: request.requestId,
                            deltaContent: textDelta,
                            isComplete: !!finishReason,
                            finishReason,
                            usage,
                            providerId: this.providerId,
                            modelId: request.modelId
                        };
                    } catch {
                        // ignore line parse errors
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
}
