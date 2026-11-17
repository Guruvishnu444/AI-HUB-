export type MessageRole = 'system' | 'user' | 'assistant';

export interface MessageAttachment {
    mimeType: string;
    dataBase64: string;
    fileName?: string;
}

export interface ChatMessage {
    id: string;
    role: MessageRole;
    content: string;
    reasoningContent?: string;       // Intermediate Chain-of-Thought (e.g. DeepSeek-R1)
    providerId?: string;             // Provider that responded
    modelId?: string;                // Model that responded
    fallbackOccurred?: boolean;      // Whether response came from a fallback provider
    originalProviderId?: string;     // If fallback occurred, what was the initially chosen provider
    attachments?: MessageAttachment[];
    timestamp: number;
}

export interface ChatCompletionRequest {
    requestId: string;
    providerId: string;
    modelId: string;
    messages: Array<{
        role: MessageRole;
        content: string;
        reasoningContent?: string;
        attachments?: MessageAttachment[];
    }>;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    stream?: boolean;
    stopSequences?: string[];
}

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export interface StreamChunk {
    requestId: string;
    deltaContent: string;
    deltaReasoning?: string;
    isComplete: boolean;
    finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
    usage?: TokenUsage;
    providerId?: string;
    modelId?: string;
}

export interface ChatCompletionResponse {
    requestId: string;
    content: string;
    reasoningContent?: string;
    finishReason: string;
    usage?: TokenUsage;
    providerId: string;
    modelId: string;
}
