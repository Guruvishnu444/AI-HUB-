import { ModelMetadata } from './model';
import { ChatCompletionRequest, ChatCompletionResponse, StreamChunk } from './chat';

export interface ProviderCapabilities {
    supportsStreaming: boolean;
    supportsVision: boolean;
    supportsTools: boolean;
    supportsJsonMode: boolean;
    supportsReasoningContent: boolean; // e.g. DeepSeek-R1 / Gemini thinking
    maxContextTokens: number;
    maxOutputTokens: number;
}

export type ProviderProtocol = 'google-native' | 'openai-compatible' | 'anthropic-native' | 'ollama-native';

export interface ProviderConfig {
    id: string;                      // e.g. "google-gemini", "deepseek"
    name: string;                    // e.g. "Google Gemini", "DeepSeek Official"
    protocol: ProviderProtocol;
    baseUrl: string;                 // Base API endpoint URL
    isEnabled: boolean;
    timeoutMs: number;               // Request timeout (default: 45000ms)
    maxRetries: number;              // Immediate retry count on 429/503 (default: 2)
}

export interface ConnectionTestResult {
    success: boolean;
    latencyMs: number;
    errorMessage?: string;
    modelCount?: number;
}

/**
 * Universal Provider Adapter Interface.
 * Native adapters (GeminiAdapter, DeepSeekAdapter, etc.) implement this contract.
 */
export interface IProviderAdapter {
    readonly providerId: string;
    readonly config: ProviderConfig;

    /**
     * Test authentication and network reachability with the given key.
     */
    testConnection(apiKey: string): Promise<ConnectionTestResult>;

    /**
     * Discover or list models provided by this provider.
     */
    discoverModels(apiKey: string): Promise<ModelMetadata[]>;

    /**
     * Non-streaming completion call.
     */
    sendChatCompletion(
        apiKey: string,
        request: ChatCompletionRequest,
        abortSignal?: AbortSignal
    ): Promise<ChatCompletionResponse>;

    /**
     * Streaming completion call emitting SSE/JSON chunks.
     */
    streamChatCompletion(
        apiKey: string,
        request: ChatCompletionRequest,
        abortSignal?: AbortSignal
    ): AsyncIterable<StreamChunk>;
}
