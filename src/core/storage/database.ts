import * as vscode from 'vscode';
import { ProviderConfig } from '../types/provider';
import { ModelMetadata } from '../types/model';
import { FallbackConfig } from '../types/ipc';

export interface UsageMetric {
    id: string;
    timestamp: number;
    providerId: string;
    modelId: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    success: boolean;
    fallbackOccurred: boolean;
}

export interface AuditLogEntry {
    id: string;
    timestamp: number;
    eventType: 'REQUEST' | 'FALLBACK' | 'RETRY' | 'KEY_CHANGE' | 'ERROR';
    providerId: string;
    modelId?: string;
    details: string;
}

export class HubDatabase {
    private storageUri: vscode.Uri;
    private stateFilePath: vscode.Uri;
    private usageFilePath: vscode.Uri;

    // In-memory state synchronized to storage
    private providers: Map<string, ProviderConfig> = new Map();
    private models: Map<string, ModelMetadata> = new Map();
    private fallbackConfig: FallbackConfig = {
        enabled: true,
        priorityOrder: ['google-gemini', 'deepseek'],
        maxRetriesPerProvider: 2,
        circuitBreakerThreshold: 3,
        circuitBreakerCooldownMs: 60000
    };
    private usageMetrics: UsageMetric[] = [];
    private auditLogs: AuditLogEntry[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.storageUri = context.globalStorageUri;
        this.stateFilePath = vscode.Uri.joinPath(this.storageUri, 'hub_state.json');
        this.usageFilePath = vscode.Uri.joinPath(this.storageUri, 'hub_usage.json');
    }

    public async initialize(): Promise<void> {
        try {
            await vscode.workspace.fs.createDirectory(this.storageUri);
        } catch {
            // Directory exists
        }

        // Initialize default providers
        this.seedDefaultProviders();
        this.seedDefaultModels();

        // Load existing state from disk if present
        await this.loadState();
    }

    private seedDefaultProviders(): void {
        const gemini: ProviderConfig = {
            id: 'google-gemini',
            name: 'Google Gemini',
            protocol: 'google-native',
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
            isEnabled: true,
            timeoutMs: 45000,
            maxRetries: 2
        };

        const deepseek: ProviderConfig = {
            id: 'deepseek',
            name: 'DeepSeek Official',
            protocol: 'openai-compatible',
            baseUrl: 'https://api.deepseek.com',
            isEnabled: true,
            timeoutMs: 45000,
            maxRetries: 2
        };

        this.providers.set(gemini.id, gemini);
        this.providers.set(deepseek.id, deepseek);
    }

    private seedDefaultModels(): void {
        const defaultModels: ModelMetadata[] = [
            {
                id: 'gemini-2.5-flash',
                displayName: 'Gemini 2.5 Flash',
                providerId: 'google-gemini',
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
                description: 'Fast, multimodal workhorse model with 1M context window and reasoning budget.'
            },
            {
                id: 'gemini-2.5-pro',
                displayName: 'Gemini 2.5 Pro',
                providerId: 'google-gemini',
                capabilities: {
                    supportsStreaming: true,
                    supportsVision: true,
                    supportsTools: true,
                    supportsJsonMode: true,
                    supportsReasoningContent: true,
                    maxContextTokens: 2097152,
                    maxOutputTokens: 8192
                },
                isCustom: false,
                isEnabled: true,
                description: 'Frontier reasoning model with 2M token context, high coding intelligence, and multimodal support.'
            },
            {
                id: 'gemini-2.0-flash',
                displayName: 'Gemini 2.0 Flash',
                providerId: 'google-gemini',
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
                description: 'High-speed model optimized for real-time coding tasks and tool use.'
            },
            {
                id: 'deepseek-chat',
                displayName: 'DeepSeek Chat (V3)',
                providerId: 'deepseek',
                capabilities: {
                    supportsStreaming: true,
                    supportsVision: false,
                    supportsTools: true,
                    supportsJsonMode: true,
                    supportsReasoningContent: false,
                    maxContextTokens: 65536,
                    maxOutputTokens: 8192
                },
                isCustom: false,
                isEnabled: true,
                description: 'General conversational and coding model. 64k context, tool calling, and structured JSON outputs.'
            },
            {
                id: 'deepseek-reasoner',
                displayName: 'DeepSeek Reasoner (R1)',
                providerId: 'deepseek',
                capabilities: {
                    supportsStreaming: true,
                    supportsVision: false,
                    supportsTools: false,
                    supportsJsonMode: false,
                    supportsReasoningContent: true,
                    maxContextTokens: 65536,
                    maxOutputTokens: 8192
                },
                isCustom: false,
                isEnabled: true,
                description: 'Advanced reasoning model with native Chain-of-Thought. (No tool calls or JSON mode).'
            }
        ];

        for (const model of defaultModels) {
            this.models.set(model.id, model);
        }
    }

    private async loadState(): Promise<void> {
        try {
            const dataBytes = await vscode.workspace.fs.readFile(this.stateFilePath);
            const content = new TextDecoder().decode(dataBytes);
            const parsed = JSON.parse(content);

            if (parsed.providers && Array.isArray(parsed.providers)) {
                for (const p of parsed.providers) {
                    this.providers.set(p.id, p);
                }
            }

            if (parsed.models && Array.isArray(parsed.models)) {
                for (const m of parsed.models) {
                    this.models.set(m.id, m);
                }
            }

            if (parsed.fallbackConfig) {
                this.fallbackConfig = parsed.fallbackConfig;
            }
        } catch {
            // First time startup: write defaults to disk
            await this.persistState();
        }
    }

    private async persistState(): Promise<void> {
        try {
            const payload = {
                providers: Array.from(this.providers.values()),
                models: Array.from(this.models.values()),
                fallbackConfig: this.fallbackConfig,
                lastUpdated: Date.now()
            };
            const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
            await vscode.workspace.fs.writeFile(this.stateFilePath, bytes);
        } catch (err) {
            console.error('[HubDatabase] Failed to persist state:', err);
        }
    }

    public getProviders(): ProviderConfig[] {
        return Array.from(this.providers.values());
    }

    public getProvider(id: string): ProviderConfig | undefined {
        return this.providers.get(id);
    }

    public async updateProvider(config: ProviderConfig): Promise<void> {
        this.providers.set(config.id, config);
        await this.persistState();
    }

    public getModels(): ModelMetadata[] {
        return Array.from(this.models.values());
    }

    public getModel(id: string): ModelMetadata | undefined {
        return this.models.get(id);
    }

    public async addOrUpdateModel(model: ModelMetadata): Promise<void> {
        this.models.set(model.id, model);
        await this.persistState();
    }

    public async setModelEnabled(modelId: string, enabled: boolean): Promise<void> {
        const model = this.models.get(modelId);
        if (model) {
            model.isEnabled = enabled;
            await this.persistState();
        }
    }

    public getFallbackConfig(): FallbackConfig {
        return { ...this.fallbackConfig };
    }

    public async updateFallbackConfig(config: FallbackConfig): Promise<void> {
        this.fallbackConfig = { ...config };
        await this.persistState();
    }

    public async recordUsage(metric: UsageMetric): Promise<void> {
        this.usageMetrics.push(metric);
        // Persist periodically or append
        try {
            const bytes = new TextEncoder().encode(JSON.stringify(this.usageMetrics.slice(-500), null, 2));
            await vscode.workspace.fs.writeFile(this.usageFilePath, bytes);
        } catch {
            // Non-critical
        }
    }

    public getUsageMetrics(): UsageMetric[] {
        return [...this.usageMetrics];
    }

    public logAudit(eventType: AuditLogEntry['eventType'], providerId: string, details: string, modelId?: string): void {
        this.auditLogs.push({
            id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            timestamp: Date.now(),
            eventType,
            providerId,
            modelId,
            details
        });
    }

    public getAuditLogs(): AuditLogEntry[] {
        return [...this.auditLogs];
    }
}
