import { ProviderConfig, ConnectionTestResult } from './provider';
import { ModelMetadata } from './model';
import { ChatMessage, StreamChunk } from './chat';
import { HubErrorDetails } from './errors';

// Workspace types (inlined to avoid circular imports)
export interface FileTreeNode {
    name: string;
    relativePath: string;
    type: 'file' | 'directory';
    isBlocked: boolean;
    isSensitive: boolean;
    children?: FileTreeNode[];
    sizeBytes?: number;
}

export interface FileDiff {
    relativePath: string;
    originalContent: string;
    proposedContent: string;
    hunks: Array<{ type: 'add' | 'remove' | 'unchanged'; lineNumber: number; content: string }>;
    isNewFile: boolean;
    linesAdded: number;
    linesRemoved: number;
}

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

export interface ModelUsageSummary {
    modelId: string;
    providerId: string;
    displayName: string;
    requestCount: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    avgLatencyMs: number;
    lastUsedTimestamp: number;
}

export interface FolderChatSummary {
    workspacePath: string;
    folderName: string;
    lastUpdated: number;
    messageCount: number;
    preview: string;
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
    | { type: 'ADD_CUSTOM_PROVIDER'; provider: ProviderConfig; model: ModelMetadata; apiKey?: string }
    | { type: 'ADD_CUSTOM_MODEL'; model: ModelMetadata }
    | { type: 'TOGGLE_MODEL'; modelId: string; enabled: boolean }
    | { type: 'UPDATE_FALLBACK_CONFIG'; config: FallbackConfig }
    | { type: 'UPDATE_PROVIDER_CONFIG'; config: ProviderConfig }
    | { type: 'SEND_PROMPT'; prompt: string; providerId: string; modelId: string; attachments?: any[]; clientMessageId?: string }
    | { type: 'ABORT_PROMPT'; requestId: string }
    | { type: 'CLEAR_HISTORY' }
    | { type: 'LIST_FOLDER_CHATS' }
    | { type: 'LOAD_FOLDER_CHAT'; workspacePath: string }
    | { type: 'DELETE_FOLDER_CHAT'; workspacePath: string }
    | { type: 'RESOLVE_AMBIGUOUS_CHOICE'; requestId: string; action: 'retry_with_fallback' | 'cancel' }
    | { type: 'OPEN_EXTERNAL_URL'; url: string }
    // Phase 7: Workspace
    | { type: 'WORKSPACE_GET_TREE'; path?: string }
    | { type: 'WORKSPACE_READ_FILE'; relativePath: string }
    | { type: 'WORKSPACE_SEARCH'; query: string }
    | { type: 'WORKSPACE_PICK_FOLDER' }
    // Phase 8: Diff / Edit
    | { type: 'WORKSPACE_APPROVE_EDIT'; editId: string }
    | { type: 'WORKSPACE_REJECT_EDIT'; editId: string }
    // Phase 9: Agentic Function Calling (all providers)
    | { type: 'AGENT_RUN'; prompt: string; providerId: string; modelId: string; isDebugMode: boolean; clientMessageId?: string }
    | { type: 'AGENT_APPROVE_EDIT'; editId: string }
    | { type: 'AGENT_REJECT_EDIT'; editId: string }
    | { type: 'ATTACH_ACTIVE_ERROR' }
    // Model & Provider Management
    | { type: 'SET_ACTIVE_MODEL'; providerId: string; modelId: string }
    | { type: 'DELETE_PROVIDER'; providerId: string }
    | { type: 'PURGE_UNCONFIGURED_PROVIDERS' }
    | { type: 'PURGE_UNWANTED_MODELS' };

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
          modelUsage: ModelUsageSummary[];
          totalTokens: number;
          totalRequests: number;
          auditLogs: Array<{
              id: string;
              timestamp: number;
              eventType: string;
              providerId: string;
              modelId?: string;
              details: string;
          }>;
          workspaceRoot: string | null;
          currentFolderChatName?: string;
      }
    | { type: 'FOLDER_CHATS_LIST'; chats: FolderChatSummary[]; currentWorkspacePath: string | null }
    | { type: 'USER_MESSAGE_COMMITTED'; message: ChatMessage }
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
    | { type: 'SHOW_NOTIFICATION'; message: string; severity: 'info' | 'warn' | 'error' }
    // Phase 7
    | { type: 'WORKSPACE_TREE'; nodes: FileTreeNode[]; workspaceRoot: string | null }
    | { type: 'WORKSPACE_FILE_CONTENT'; relativePath: string; content: string; sizeBytes: number; truncated: boolean; warning?: string }
    | { type: 'WORKSPACE_SEARCH_RESULTS'; results: Array<{ file: string; line: number; text: string }> }
    // Phase 8
    | { type: 'DIFF_PROPOSAL'; editId: string; diff: FileDiff }
    | { type: 'EDIT_APPROVED'; editId: string; path: string; bytesWritten: number }
    | { type: 'EDIT_REJECTED'; editId: string }
    // Phase 9: Agentic loop (all providers)
    | { type: 'AGENT_THINKING'; requestId: string; step: string }
    | { type: 'AGENT_TOOL_RESULT'; requestId: string; toolName: string; success: boolean; output: string }
    | { type: 'AGENT_EDIT_PROPOSAL'; requestId: string; editId: string; filePath: string; originalContent: string; proposedContent: string; description: string }
    | { type: 'AGENT_EDIT_APPROVED'; editId: string; filePath: string; bytesWritten: number }
    | { type: 'AGENT_EDIT_REJECTED'; editId: string }
    | { type: 'AGENT_RESPONSE'; requestId: string; message: ChatMessage }
    | { type: 'AGENT_ERROR'; requestId: string; errorMessage: string }
    | { type: 'ACTIVE_ERROR_CONTEXT'; context: string };
