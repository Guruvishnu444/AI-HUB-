export enum HubErrorCode {
    AUTH_FAILED = 'AUTH_FAILED',
    RATE_LIMITED = 'RATE_LIMITED',
    INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
    SERVER_ERROR = 'SERVER_ERROR',
    NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
    AMBIGUOUS_FAILURE = 'AMBIGUOUS_FAILURE',
    INVALID_REQUEST = 'INVALID_REQUEST',
    CIRCUIT_OPEN = 'CIRCUIT_OPEN',
    PROVIDER_NOT_FOUND = 'PROVIDER_NOT_FOUND',
    NO_KEY_CONFIGURED = 'NO_KEY_CONFIGURED',
    CONTEXT_WINDOW_EXCEEDED = 'CONTEXT_WINDOW_EXCEEDED',
    UNKNOWN = 'UNKNOWN'
}

export interface HubErrorDetails {
    code: HubErrorCode;
    message: string;
    userFacingMessage: string;
    isRetryable: boolean;
    providerId?: string;
    modelId?: string;
    statusCode?: number;
    retryAfterSeconds?: number;
    rawDetails?: string;
}

export class HubError extends Error {
    public readonly details: HubErrorDetails;

    constructor(details: HubErrorDetails) {
        super(details.userFacingMessage);
        this.name = 'HubError';
        this.details = details;
    }
}
