import * as vscode from 'vscode';
import { ProviderConfig } from '../types/provider';
import { ModelMetadata } from '../types/model';
import { FallbackConfig, ModelUsageSummary } from '../types/ipc';

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
        const providers: ProviderConfig[] = [
            {
                id: 'google-gemini',
                name: 'Google Gemini',
                protocol: 'google-native',
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
                isEnabled: true,
                timeoutMs: 45000,
                maxRetries: 2
            },
            {
                id: 'deepseek',
                name: 'DeepSeek Official',
                protocol: 'openai-compatible',
                baseUrl: 'https://api.deepseek.com',
                isEnabled: true,
                timeoutMs: 45000,
                maxRetries: 2
            },
            {
                id: 'openai',
                name: 'OpenAI',
                protocol: 'openai-compatible',
                baseUrl: 'https://api.openai.com/v1',
                isEnabled: true,
                timeoutMs: 45000,
                maxRetries: 2
            },
            {
                id: 'anthropic',
                name: 'Anthropic Claude',
                protocol: 'anthropic-native',
                baseUrl: 'https://api.anthropic.com/v1',
                isEnabled: true,
                timeoutMs: 45000,
                maxRetries: 2
            },
            {
                id: 'openrouter',
                name: 'OpenRouter',
                protocol: 'openai-compatible',
                baseUrl: 'https://openrouter.ai/api/v1',
                isEnabled: true,
                timeoutMs: 45000,
                maxRetries: 2
            },
            {
                id: 'groq',
                name: 'Groq',
                protocol: 'openai-compatible',
                baseUrl: 'https://api.groq.com/openai/v1',
                isEnabled: true,
                timeoutMs: 45000,
                maxRetries: 2
            }
        ];

        for (const p of providers) {
            this.providers.set(p.id, p);
        }
    }

    // Map of deprecated or old model IDs to current verified working replacements
    private static readonly DEPRECATED_MODEL_IDS: Record<string, string> = {
        'gemini-2.5-flash':                         'gemini-3.8-flash',
        'gemini-2.5-flash-preview-05-20':           'gemini-3.8-flash',
        'gemini-2.5-flash-preview':                 'gemini-3.8-flash',
        'gemini-2.5-pro':                           'gemini-3.8-pro',
        'gemini-2.5-pro-preview-06-05':             'gemini-3.8-pro',
        'gemini-2.5-pro-preview':                   'gemini-3.8-pro',
        'gemini-2.0-flash':                         'gemini-3.8-flash',
        'gemini-2.0-flash-preview':                 'gemini-3.8-flash',
        'gemini-2.0-pro':                           'gemini-3.8-pro',
        'gemini-1.5-flash':                         'gemini-3.8-flash',
        'gemini-1.5-pro':                           'gemini-3.8-pro',
        'gemini-1.0-pro':                           'gemini-3.8-flash',
        'gemini-pro':                               'gemini-3.8-flash'
    };

    private seedDefaultModels(): void {
        const defaultModels: ModelMetadata[] = [
            {
                id: 'gemini-3.8-flash',
                displayName: 'Gemini 3.8 Flash',
                providerId: 'google-gemini',
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
                description: 'Latest Google frontier flash model with native deep reasoning, 1M context, multimodal vision, and agentic tool use.'
            },
            {
                id: 'gemini-3.8-pro',
                displayName: 'Gemini 3.8 Pro',
                providerId: 'google-gemini',
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
                description: 'Frontier reasoning model with 2M context, deep multi-step planning, and multimodal code intelligence.'
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
            },
            {
                id: 'gpt-4o',
                displayName: 'GPT-4o',
                providerId: 'openai',
                capabilities: {
                    supportsStreaming: true,
                    supportsVision: true,
                    supportsTools: true,
                    supportsJsonMode: true,
                    supportsReasoningContent: false,
                    maxContextTokens: 128000,
                    maxOutputTokens: 4096
                },
                isCustom: false,
                isEnabled: true,
                description: 'OpenAI flagship multimodal intelligent model.'
            },
            {
                id: 'gpt-4o-mini',
                displayName: 'GPT-4o Mini',
                providerId: 'openai',
                capabilities: {
                    supportsStreaming: true,
                    supportsVision: true,
                    supportsTools: true,
                    supportsJsonMode: true,
                    supportsReasoningContent: false,
                    maxContextTokens: 128000,
                    maxOutputTokens: 4096
                },
                isCustom: false,
                isEnabled: true,
                description: 'Fast, cost-efficient OpenAI model for daily coding tasks.'
            },
            {
                id: 'claude-3-5-sonnet-20241022',
                displayName: 'Claude 3.5 Sonnet',
                providerId: 'anthropic',
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
                description: 'Frontier code intelligence and deep analysis model from Anthropic.'
            },
            {
                id: 'claude-3-7-sonnet-20250219',
                displayName: 'Claude 3.7 Sonnet',
                providerId: 'anthropic',
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
                description: 'Hybrid reasoning and coding model from Anthropic.'
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
                    // Always prefer fresh seeded data for built-in providers
                    if (!this.providers.has(p.id)) {
                        this.providers.set(p.id, p);
                    }
                }
            }

            if (parsed.models && Array.isArray(parsed.models)) {
                let didMigrate = false;
                for (const m of parsed.models) {
                    // Aggressively migrate any deprecated/old Gemini model IDs on load
                    const replacement = HubDatabase.DEPRECATED_MODEL_IDS[m.id];
                    const isOldGemini =
                        m.id.startsWith('gemini-2.') ||
                        m.id.startsWith('gemini-1.') ||
                        m.id.includes('preview') ||
                        m.id.includes('flash-preview') ||
                        m.id.includes('pro-preview');

                    if (replacement || isOldGemini) {
                        // Delete the stale model so it never shows in the dropdown
                        this.models.delete(m.id);
                        const targetId = replacement || 'gemini-3.8-flash';
                        const freshSeed = Array.from(this.models.values()).find(s => s.id === targetId);
                        if (freshSeed) {
                            this.models.set(freshSeed.id, freshSeed);
                        }
                        didMigrate = true;
                        continue;
                    }
                    // Don't overwrite built-in seeded models with potentially stale saved copies
                    if (!this.models.has(m.id)) {
                        this.models.set(m.id, m);
                    }
                }
                if (didMigrate) {
                    // Persist the cleaned-up state immediately so stale IDs are gone from disk
                    await this.persistState();
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

    public getModelUsageSummary(): ModelUsageSummary[] {
        const summaryMap = new Map<string, ModelUsageSummary>();

        for (const metric of this.usageMetrics) {
            const key = metric.modelId;
            let entry = summaryMap.get(key);
            if (!entry) {
                const modelMeta = this.getModel(metric.modelId);
                entry = {
                    modelId: metric.modelId,
                    providerId: metric.providerId,
                    displayName: modelMeta?.displayName || metric.modelId,
                    requestCount: 0,
                    promptTokens: 0,
                    completionTokens: 0,
                    totalTokens: 0,
                    avgLatencyMs: 0,
                    lastUsedTimestamp: 0
                };
                summaryMap.set(key, entry);
            }

            const currentTotalLatency = entry.avgLatencyMs * entry.requestCount + metric.latencyMs;
            entry.requestCount += 1;
            entry.promptTokens += metric.promptTokens;
            entry.completionTokens += metric.completionTokens;
            entry.totalTokens += metric.totalTokens;
            entry.avgLatencyMs = Math.round(currentTotalLatency / entry.requestCount);
            if (metric.timestamp > entry.lastUsedTimestamp) {
                entry.lastUsedTimestamp = metric.timestamp;
            }
        }

        return Array.from(summaryMap.values()).sort((a, b) => b.lastUsedTimestamp - a.lastUsedTimestamp);
    }

    public getTotalTokens(): number {
        return this.usageMetrics.reduce((sum, m) => sum + m.totalTokens, 0);
    }

    public getTotalRequests(): number {
        return this.usageMetrics.length;
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
