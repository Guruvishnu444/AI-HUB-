import { BaseProviderAdapter } from './base';
import { ProviderConfig, ConnectionTestResult } from '../types/provider';
import { ModelMetadata } from '../types/model';
import { ChatCompletionRequest, ChatCompletionResponse, StreamChunk } from '../types/chat';
import { cleanApiKey } from '../storage/secretVault';

export class GeminiAdapter extends BaseProviderAdapter {
    public readonly providerId = 'google-gemini';

    constructor(config: ProviderConfig) {
        super(config);
    }

    public async testConnection(rawKey: string): Promise<ConnectionTestResult> {
        const apiKey = cleanApiKey(rawKey);
        const start = Date.now();
        try {
            const url = `${this.config.baseUrl}/models?key=${encodeURIComponent(apiKey)}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                }
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
                    // keep raw body
                }
                throw new Error(errMsg);
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

    public async discoverModels(rawKey: string): Promise<ModelMetadata[]> {
        const apiKey = cleanApiKey(rawKey);
        const url = `${this.config.baseUrl}/models?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            }
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw this.sanitizeError(new Error(`HTTP ${response.status}: ${errBody}`), apiKey);
        }

        const data = (await response.json()) as any;
        const rawModels: any[] = data.models || [];

        const discovered: ModelMetadata[] = rawModels
            .filter((m: any) => {
                if (!m.name || !m.supportedGenerationMethods?.includes('generateContent')) return false;
                const id = m.name.replace(/^models\//, '').toLowerCase();
                if (
                    id.includes('embedding') ||
                    id.includes('aqa') ||
                    id.includes('imagen') ||
                    id.includes('bison') ||
                    id.includes('whisper') ||
                    id.includes('vision') ||
                    id.includes('tts') ||
                    id.includes('moderation') ||
                    id.includes('flash-lite') ||
                    id.includes('flash_lite') ||
                    id.endsWith('-lite') ||
                    id.includes('gemma') ||
                    id.includes('robotics')
                ) {
                    return false;
                }
                return true;
            })
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
                        supportsReasoningContent: id.includes('3.8') || id.includes('2.5') || id.includes('flash') || id.includes('pro'),
                        maxContextTokens: maxTokens,
                        maxOutputTokens: outputTokens
                    },
                    isCustom: false,
                    isEnabled: true,
                    description: m.description
                };
            });

        // Ensure core production models are always present
        const coreModels = [
            {
                id: 'gemini-2.5-flash',
                displayName: 'Gemini 2.5 Flash',
                providerId: this.providerId,
                capabilities: {
                    supportsStreaming: true,
                    supportsVision: true,
                    supportsTools: true,
                    supportsJsonMode: true,
                    supportsReasoningContent: true,
                    maxContextTokens: 1048576,
                    maxOutputTokens: 65536
                },
                isCustom: false,
                isEnabled: true,
                description: 'Flagship Google model with hybrid reasoning, multimodal vision, and agentic tool use'
            },
            {
                id: 'gemini-1.5-flash',
                displayName: 'Gemini 1.5 Flash (High Quota)',
                providerId: this.providerId,
                capabilities: {
                    supportsStreaming: true,
                    supportsVision: true,
                    supportsTools: true,
                    supportsJsonMode: true,
                    supportsReasoningContent: false,
                    maxContextTokens: 1048576,
                    maxOutputTokens: 8192
                },
                isCustom: false,
                isEnabled: true,
                description: 'Fast high-throughput model with 1,500 requests/day free tier quota'
            },
            {
                id: 'gemini-2.0-flash',
                displayName: 'Gemini 2.0 Flash',
                providerId: this.providerId,
                capabilities: {
                    supportsStreaming: true,
                    supportsVision: true,
                    supportsTools: true,
                    supportsJsonMode: true,
                    supportsReasoningContent: true,
                    maxContextTokens: 1048576,
                    maxOutputTokens: 8192
                },
                isCustom: false,
                isEnabled: true,
                description: 'Fast multimodal generation with real-time speed'
            },
            {
                id: 'gemini-2.5-pro',
                displayName: 'Gemini 2.5 Pro',
                providerId: this.providerId,
                capabilities: {
                    supportsStreaming: true,
                    supportsVision: true,
                    supportsTools: true,
                    supportsJsonMode: true,
                    supportsReasoningContent: true,
                    maxContextTokens: 2097152,
                    maxOutputTokens: 65536
                },
                isCustom: false,
                isEnabled: true,
                description: 'Advanced reasoning model with deep multi-step planning and code intelligence'
            }
        ];

        for (const cm of coreModels) {
            if (!discovered.some(m => m.id === cm.id)) {
                discovered.unshift(cm);
            }
        }

        return discovered;
    }

    private formatGeminiPayload(request: ChatCompletionRequest): any {
        let systemText = '';
        const rawTurns: Array<{ role: 'user' | 'model'; parts: any[] }> = [];

        for (const msg of request.messages) {
            if (msg.role === 'system') {
                systemText += (systemText ? '\n\n' : '') + msg.content;
                continue;
            }

            const role = msg.role === 'assistant' ? 'model' : 'user';
            const parts: any[] = [];
            if (msg.content) {
                parts.push({ text: msg.content });
            }

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

            if (parts.length > 0) {
                rawTurns.push({ role, parts });
            }
        }

        // Ensure the conversation starts with a user turn
        while (rawTurns.length > 0 && rawTurns[0].role !== 'user') {
            rawTurns.shift();
        }

        // Merge consecutive turns with the same role to strictly alternate user -> model -> user
        const contents: any[] = [];
        for (const turn of rawTurns) {
            if (contents.length === 0) {
                contents.push(turn);
            } else {
                const prev = contents[contents.length - 1];
                if (prev.role === turn.role) {
                    prev.parts.push(...turn.parts);
                } else {
                    contents.push(turn);
                }
            }
        }

        if (contents.length === 0) {
            contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
        }

        // Gemini API requires the LAST turn to be a user turn.
        // If history ends on a model turn (from a prior partial/failed response),
        // remove trailing model turns so the API does not reject with multiturn error.
        while (contents.length > 1 && contents[contents.length - 1].role === 'model') {
            contents.pop();
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
        rawKey: string,
        request: ChatCompletionRequest,
        abortSignal?: AbortSignal
    ): Promise<ChatCompletionResponse> {
        const apiKey = cleanApiKey(rawKey);
        const modelName = request.modelId.replace(/^models\//, '');
        const url = `${this.config.baseUrl}/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const payload = this.formatGeminiPayload(request);

        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify(payload),
                signal: abortSignal
            });
        } catch (err) {
            throw this.sanitizeError(err, apiKey);
        }

        if (!response.ok) {
            const errBody = await response.text();
            // If multiturn error is returned, fallback to collapsed single-turn payload
            if (errBody.includes('Multiturn') || errBody.includes('multiturn') || errBody.includes('not enabled for this model')) {
                try {
                    return await this.sendSingleTurnChat(apiKey, request, abortSignal);
                } catch {
                    // Fall through to other fallbacks
                }
            }
            // If generateContent 404s, 503s, or recommends Interactions API, fallback seamlessly
            if (response.status === 404 || response.status === 503 || errBody.includes('Interactions API') || errBody.includes('not found') || errBody.includes('high demand') || errBody.includes('UNAVAILABLE')) {
                try {
                    return await this.sendInteractionsChat(apiKey, request, abortSignal);
                } catch {
                    // Fall back to throwing sanitized original error
                }
            }
            const err: any = new Error(`HTTP ${response.status}: ${errBody}`);
            err.status = response.status;
            throw this.sanitizeError(err, apiKey);
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

    private async sendInteractionsChat(
        apiKey: string,
        request: ChatCompletionRequest,
        abortSignal?: AbortSignal
    ): Promise<ChatCompletionResponse> {
        const url = `${this.config.baseUrl}/interactions?key=${encodeURIComponent(apiKey)}`;
        const modelName = request.modelId.replace(/^models\//, '');

        // Use last user message content or joined message history
        const lastMsg = request.messages[request.messages.length - 1];
        const inputText = lastMsg?.content || '';

        const interactionPayload = {
            model: modelName,
            input: inputText
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify(interactionPayload),
            signal: abortSignal
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`HTTP ${response.status}: ${errBody}`);
        }

        const data = (await response.json()) as any;
        let content = '';

        if (data.steps && Array.isArray(data.steps)) {
            for (const step of data.steps) {
                if (step.content && Array.isArray(step.content)) {
                    for (const c of step.content) {
                        if (c.text) content += c.text;
                    }
                } else if (typeof step.text === 'string') {
                    content += step.text;
                }
            }
        } else if (data.output_text) {
            content = data.output_text;
        } else if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            content = data.candidates[0].content.parts[0].text;
        }

        return {
            requestId: request.requestId,
            content,
            finishReason: 'stop',
            providerId: this.providerId,
            modelId: request.modelId
        };
    }

    private async sendSingleTurnChat(
        apiKey: string,
        request: ChatCompletionRequest,
        abortSignal?: AbortSignal
    ): Promise<ChatCompletionResponse> {
        let systemText = '';
        const lines: string[] = [];

        for (const msg of request.messages) {
            if (msg.role === 'system') {
                systemText += (systemText ? '\n\n' : '') + msg.content;
                continue;
            }
            const speaker = msg.role === 'assistant' ? 'Model' : 'User';
            lines.push(`${speaker}: ${msg.content}`);
        }

        const combinedText = lines.join('\n\n') || 'Hello';
        const modelName = request.modelId.replace(/^models\//, '');
        const url = `${this.config.baseUrl}/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;

        const payload: any = {
            contents: [{ role: 'user', parts: [{ text: combinedText }] }]
        };

        if (systemText) {
            payload.systemInstruction = { parts: [{ text: systemText }] };
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify(payload),
            signal: abortSignal
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`HTTP ${response.status}: ${errBody}`);
        }

        const data = (await response.json()) as any;
        const candidate = data.candidates?.[0];
        const content = candidate?.content?.parts?.map((p: any) => p.text).join('') || '';

        return {
            requestId: request.requestId,
            content,
            finishReason: candidate?.finishReason || 'stop',
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
        const modelName = request.modelId.replace(/^models\//, '');
        const url = `${this.config.baseUrl}/models/${modelName}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
        const payload = this.formatGeminiPayload(request);

        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify(payload),
                signal: abortSignal
            });
        } catch (err) {
            throw this.sanitizeError(err, apiKey);
        }

        if (!response.ok) {
            const errBody = await response.text();
            // If model rejects multiturn, retry with single-turn fallback
            if (errBody.includes('Multiturn') || errBody.includes('multiturn') || errBody.includes('not enabled for this model')) {
                try {
                    const completed = await this.sendSingleTurnChat(apiKey, request, abortSignal);
                    yield {
                        requestId: request.requestId,
                        deltaContent: completed.content,
                        isComplete: true,
                        finishReason: 'stop',
                        providerId: this.providerId,
                        modelId: request.modelId
                    };
                    return;
                } catch {
                    // Fall through
                }
            }
            // If streaming generateContent 404s, 503s or asks for Interactions API, use interactions fallback
            if (response.status === 404 || response.status === 503 || errBody.includes('Interactions API') || errBody.includes('not found') || errBody.includes('high demand') || errBody.includes('UNAVAILABLE')) {
                try {
                    const completed = await this.sendInteractionsChat(apiKey, request, abortSignal);
                    yield {
                        requestId: request.requestId,
                        deltaContent: completed.content,
                        isComplete: true,
                        finishReason: 'stop',
                        providerId: this.providerId,
                        modelId: request.modelId
                    };
                    return;
                } catch {
                    // Fall back to throwing sanitized original error
                }
            }
            const err: any = new Error(`HTTP ${response.status}: ${errBody}`);
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
