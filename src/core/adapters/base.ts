import { IProviderAdapter, ProviderConfig, ConnectionTestResult } from '../types/provider';
import { ModelMetadata } from '../types/model';
import { ChatCompletionRequest, ChatCompletionResponse, StreamChunk } from '../types/chat';
import { HubError, HubErrorCode, HubErrorDetails } from '../types/errors';

export abstract class BaseProviderAdapter implements IProviderAdapter {
    public abstract readonly providerId: string;
    public readonly config: ProviderConfig;

    constructor(config: ProviderConfig) {
        this.config = config;
    }

    public abstract testConnection(apiKey: string): Promise<ConnectionTestResult>;
    public abstract discoverModels(apiKey: string): Promise<ModelMetadata[]>;
    public abstract sendChatCompletion(
        apiKey: string,
        request: ChatCompletionRequest,
        abortSignal?: AbortSignal
    ): Promise<ChatCompletionResponse>;
    public abstract streamChatCompletion(
        apiKey: string,
        request: ChatCompletionRequest,
        abortSignal?: AbortSignal
    ): AsyncIterable<StreamChunk>;

    /**
     * Sanitizes errors to ensure secrets are never leaked into error messages or stack traces.
     */
    protected sanitizeError(rawError: any, apiKey: string): HubError {
        let message = rawError?.message || String(rawError);
        let statusCode: number | undefined = rawError?.status || rawError?.statusCode || rawError?.response?.status;

        // Extract status code from message string if not present on error object
        if (!statusCode) {
            const httpMatch = message.match(/HTTP\s+(\d{3})/i) || message.match(/"code":\s*(\d{3})/);
            if (httpMatch) {
                statusCode = parseInt(httpMatch[1], 10);
            }
        }

        // Redact API key
        if (apiKey && apiKey.length > 5) {
            message = message.split(apiKey).join('[REDACTED_API_KEY]');
        }

        let code = HubErrorCode.UNKNOWN;
        let isRetryable = false;
        let userFacingMessage = `Provider error: ${message}`;
        let retryAfterSeconds: number | undefined;

        if (statusCode === 401 || statusCode === 403 || message.includes('API key') || message.includes('Unauthorized') || message.includes('API_KEY_INVALID')) {
            code = HubErrorCode.AUTH_FAILED;
            isRetryable = false;
            userFacingMessage = `Authentication failed for ${this.config.name}. Please verify your API key in the Provider Manager.`;
        } else if (statusCode === 429 || message.includes('rate limit') || message.includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
            code = HubErrorCode.RATE_LIMITED;
            isRetryable = true;
            // Check Retry-After
            const retryHeader = rawError?.response?.headers?.get?.('retry-after') || rawError?.headers?.['retry-after'];
            if (retryHeader) {
                const parsed = parseInt(retryHeader, 10);
                if (!isNaN(parsed)) {
                    retryAfterSeconds = parsed;
                }
            }
            if (!retryAfterSeconds) retryAfterSeconds = 3;
            userFacingMessage = `${this.config.name} is currently rate-limited (HTTP 429). Retrying in ${retryAfterSeconds}s...`;
        } else if (statusCode === 503 || message.includes('503') || message.includes('high demand') || message.includes('UNAVAILABLE') || message.includes('overloaded')) {
            code = HubErrorCode.SERVER_ERROR;
            isRetryable = true;
            retryAfterSeconds = 2;
            userFacingMessage = `${this.config.name} is experiencing temporary high demand (HTTP 503). Retrying automatically...`;
        } else if (statusCode && statusCode >= 500 && statusCode < 600) {
            code = HubErrorCode.SERVER_ERROR;
            isRetryable = true;
            retryAfterSeconds = 3;
            userFacingMessage = `${this.config.name} server error (HTTP ${statusCode}). The provider service may be temporarily unavailable.`;
        } else if (message.includes('insufficient_quota') || message.includes('credit') || message.includes('billing')) {
            code = HubErrorCode.INSUFFICIENT_CREDITS;
            isRetryable = false;
            userFacingMessage = `${this.config.name} reported insufficient credit balance. Please check your billing dashboard.`;
        } else if (message.includes('timeout') || message.includes('ETIMEDOUT') || message.includes('ECONNRESET')) {
            code = HubErrorCode.NETWORK_TIMEOUT;
            isRetryable = true;
            retryAfterSeconds = 2;
            userFacingMessage = `Connection to ${this.config.name} timed out.`;
        }

        const details: HubErrorDetails = {
            code,
            message,
            userFacingMessage,
            isRetryable,
            providerId: this.providerId,
            statusCode,
            retryAfterSeconds,
            rawDetails: typeof rawError === 'object' ? JSON.stringify(rawError, Object.getOwnPropertyNames(rawError)) : undefined
        };

        return new HubError(details);
    }
}
