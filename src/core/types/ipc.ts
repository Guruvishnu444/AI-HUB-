import { ProviderConfig, ConnectionTestResult } from './provider';
import { ModelMetadata } from './model';
import { ChatMessage, StreamChunk } from './chat';
import { HubErrorDetails } from './errors';

export interface FallbackConfig {
    enabled: boolean;
    priorityOrder: string[];         // Array of provider IDs in fallback priority order
    maxRetriesPerProvider: number;   // Immediate retry on 429
    circuitBreakerThreshold: number; // Consecutive failures before tripping circuit
    circuitBreakerCooldownMs: number;
}

export interface ProviderSummary {
    config: ProviderConfig;
    isKeyConfigured: boolean;        // Boolean only! Never leak raw keys to Webview DOM
    models: ModelMetadata[];
    isCircuitOpen: boolean;
}

/**
 * Messages sent from Webview to Extension Host
 */
export type WebviewToHostMessage =
    | { type: 'INIT_STATE' }
    | { type: 'SAVE_KEY'; providerId: string; apiKey: string }
    | { type: 'DELETE_KEY'; providerId: string }
    | { type: 'TEST_CONNECTION'; providerId: string }
    | { type: 'DISCOVER_MODELS'; providerId: string }
    | { type: 'ADD_CUSTOM_MODEL'; model: ModelMetadata }
    | { type: 'TOGGLE_MODEL'; modelId: string; enabled: boolean }
    | { type: 'UPDATE_FALLBACK_CONFIG'; config: FallbackConfig }
    | { type: 'UPDATE_PROVIDER_CONFIG'; config: ProviderConfig }
    | { type: 'SEND_PROMPT'; prompt: string; providerId: string; modelId: string; attachments?: any[] }
    | { type: 'ABORT_PROMPT'; requestId: string }
    | { type: 'CLEAR_HISTORY' }
    | { type: 'RESOLVE_AMBIGUOUS_CHOICE'; requestId: string; action: 'retry_with_fallback' | 'cancel' }
    | { type: 'OPEN_EXTERNAL_URL'; url: string };

/**
 * Messages sent from Extension Host to Webview
 */
export type HostToWebviewMessage =
    | {
          type: 'SYNC_STATE';
          providers: ProviderSummary[];
          fallbackConfig: FallbackConfig;
          messages: ChatMessage[];
          activeProviderId: string;
          activeModelId: string;
      }
    | { type: 'KEY_SAVED'; providerId: string; success: boolean }
    | { type: 'KEY_DELETED'; providerId: string }
    | { type: 'CONNECTION_TEST_RESULT'; providerId: string; result: ConnectionTestResult }
    | { type: 'MODELS_DISCOVERED'; providerId: string; models: ModelMetadata[] }
    | { type: 'STREAM_START'; requestId: string; providerId: string; modelId: string }
    | { type: 'STREAM_CHUNK'; chunk: StreamChunk }
    | {
          type: 'STREAM_END';
          requestId: string;
          message: ChatMessage;
          fallbackOccurred: boolean;
          originalProviderId?: string;
      }
    | { type: 'STREAM_ERROR'; requestId: string; error: HubErrorDetails }
    | {
          type: 'AMBIGUOUS_FAILURE_PROMPT';
          requestId: string;
          providerId: string;
          modelId: string;
          userPrompt: string;
      }
    | { type: 'SHOW_NOTIFICATION'; message: string; severity: 'info' | 'warn' | 'error' };
