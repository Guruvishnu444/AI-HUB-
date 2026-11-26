import * as vscode from 'vscode';
import * as path from 'path';
import { SecretVault } from '../storage/secretVault';
import { HubDatabase } from '../storage/database';
import { AdapterRegistry } from '../adapters/registry';
import { FallbackEngine } from '../fallback/engine';
import { OpenAICompatibleAdapter } from '../adapters/openaiCompatible';
import { AnthropicAdapter } from '../adapters/anthropic';
import { WebviewToHostMessage, HostToWebviewMessage, ProviderSummary, FolderChatSummary } from '../types/ipc';
import { ChatMessage, ChatCompletionRequest } from '../types/chat';
import { HubError } from '../types/errors';
import { WorkspaceGuardrails } from '../../workspace/guardrails';
import { FileTreeExplorer } from '../../workspace/fileTree';
import { DiffEngine } from '../../workspace/diffEngine';
import { AgentLoop } from '../agents/agentLoop';

export class GatewayRouter {
    private vault: SecretVault;
    private db: HubDatabase;
    private registry: AdapterRegistry;
    private fallbackEngine: FallbackEngine;
    private guardrails?: WorkspaceGuardrails;
    private fileTree?: FileTreeExplorer;
    private diffEngine?: DiffEngine;
    private agentLoop?: AgentLoop;
    private messages: ChatMessage[] = [];
    private currentChatWorkspacePath: string | null = null;
    private messagesLoaded = false;
    private activeProviderId = 'google-gemini';
    private activeModelId = 'gemini-2.5-flash';
    private activeAbortControllers: Map<string, AbortController> = new Map();

    constructor(
        vault: SecretVault,
        db: HubDatabase,
        registry: AdapterRegistry,
        guardrails?: WorkspaceGuardrails,
        fileTree?: FileTreeExplorer,
        diffEngine?: DiffEngine
    ) {
        this.vault = vault;
        this.db = db;
        this.registry = registry;
        this.guardrails = guardrails;
        this.fileTree = fileTree;
        this.diffEngine = diffEngine;
        this.fallbackEngine = new FallbackEngine(registry, vault, db);
        // Restore last selected active model from database
        const savedModel = db.getActiveModel();
        if (savedModel && savedModel.providerId && savedModel.modelId) {
            this.activeProviderId = savedModel.providerId;
            this.activeModelId = savedModel.modelId;
        }
        // Initialize agent loop (all providers supported)
        if (guardrails) {
            this.agentLoop = new AgentLoop(guardrails, registry, vault, db);
        }
    }

    public async ensureMessagesLoaded(): Promise<void> {
        if (!this.messagesLoaded) {
            const wsRoot = this.currentChatWorkspacePath || this.guardrails?.getWorkspaceRoot() || null;
            this.currentChatWorkspacePath = wsRoot;
            this.messages = await this.db.loadFolderChat(wsRoot);
            this.messagesLoaded = true;
        }
    }

    public async saveCurrentChat(): Promise<void> {
        const wsRoot = this.currentChatWorkspacePath || this.guardrails?.getWorkspaceRoot() || null;
        await this.db.saveFolderChat(wsRoot, this.messages);
    }

    public async handleWorkspaceRootChanged(newWsRoot: string | null, postMessage?: (out: HostToWebviewMessage) => void): Promise<void> {
        if (this.messagesLoaded) {
            await this.saveCurrentChat();
        }
        this.currentChatWorkspacePath = newWsRoot;
        this.messages = await this.db.loadFolderChat(newWsRoot);
        this.messagesLoaded = true;
        if (postMessage) {
            await this.syncState(postMessage);
        }
    }

    public async handleWebviewMessage(
        msg: WebviewToHostMessage,
        postMessage: (out: HostToWebviewMessage) => void
    ): Promise<void> {
        switch (msg.type) {
            case 'INIT_STATE': {
                await this.ensureMessagesLoaded();
                await this.syncState(postMessage);
                break;
            }

            case 'SAVE_KEY': {
                try {
                    await this.vault.saveKey(msg.providerId, msg.apiKey);
                    this.db.logAudit('KEY_CHANGE', msg.providerId, 'API key securely saved to Windows Credential Store');
                    postMessage({ type: 'KEY_SAVED', providerId: msg.providerId, success: true });
                    postMessage({
                        type: 'SHOW_NOTIFICATION',
                        message: `API Key saved securely in Windows Credential Store for ${msg.providerId}.`,
                        severity: 'info'
                    });
                    await this.syncState(postMessage);
                } catch (err: any) {
                    postMessage({
                        type: 'SHOW_NOTIFICATION',
                        message: `Failed to save key: ${err?.message || err}`,
                        severity: 'error'
                    });
                }
                break;
            }

            case 'DELETE_KEY': {
                await this.vault.deleteKey(msg.providerId);
                this.db.logAudit('KEY_CHANGE', msg.providerId, 'API key deleted from Windows Credential Store');
                postMessage({ type: 'KEY_DELETED', providerId: msg.providerId });
                await this.syncState(postMessage);
                break;
            }

            case 'TEST_CONNECTION': {
                const pConfig = this.db.getProvider(msg.providerId);
                const isLocal = pConfig?.baseUrl?.includes('localhost') || pConfig?.baseUrl?.includes('127.0.0.1');
                const apiKey = await this.vault.getKey(msg.providerId);

                if (!apiKey && !isLocal) {
                    postMessage({
                        type: 'CONNECTION_TEST_RESULT',
                        providerId: msg.providerId,
                        result: {
                            success: false,
                            latencyMs: 0,
                            errorMessage: 'No API key configured. Please enter and save an API key first.'
                        }
                    });
                    return;
                }

                let adapter = this.registry.getAdapter(msg.providerId);
                if (!adapter && pConfig) {
                    if (pConfig.id === 'anthropic' || pConfig.baseUrl?.includes('anthropic.com')) {
                        adapter = new AnthropicAdapter(pConfig);
                    } else {
                        adapter = new OpenAICompatibleAdapter(pConfig);
                    }
                    this.registry.registerAdapter(adapter);
                }

                if (!adapter) {
                    postMessage({
                        type: 'CONNECTION_TEST_RESULT',
                        providerId: msg.providerId,
                        result: {
                            success: false,
                            latencyMs: 0,
                            errorMessage: `No adapter found for provider: ${msg.providerId}`
                        }
                    });
                    return;
                }

                const result = await adapter.testConnection(apiKey || '');
                postMessage({ type: 'CONNECTION_TEST_RESULT', providerId: msg.providerId, result });
                break;
            }

            case 'DISCOVER_MODELS': {
                const apiKey = await this.vault.getKey(msg.providerId);
                if (!apiKey) {
                    postMessage({
                        type: 'SHOW_NOTIFICATION',
                        message: 'Configure and save an API key before discovering models.',
                        severity: 'warn'
                    });
                    return;
                }

                const adapter = this.registry.getAdapter(msg.providerId);
                if (!adapter) return;

                try {
                    const discovered = await adapter.discoverModels(apiKey);
                    for (const m of discovered) {
                        await this.db.addOrUpdateModel(m);
                    }
                    postMessage({
                        type: 'SHOW_NOTIFICATION',
                        message: `Discovered and registered ${discovered.length} models from ${msg.providerId}.`,
                        severity: 'info'
                    });
                    await this.syncState(postMessage);
                } catch (err: any) {
                    postMessage({
                        type: 'SHOW_NOTIFICATION',
                        message: `Model discovery failed: ${err?.message || err}`,
                        severity: 'error'
                    });
                }
                break;
            }

            case 'ADD_CUSTOM_PROVIDER': {
                try {
                    await this.db.updateProvider(msg.provider);
                    await this.db.addOrUpdateModel(msg.model);

                    if (msg.apiKey && msg.apiKey.trim()) {
                        await this.vault.saveKey(msg.provider.id, msg.apiKey.trim());
                    }

                    // Register adapter dynamically
                    let adapter;
                    if (msg.provider.id === 'anthropic' || msg.provider.baseUrl?.includes('anthropic.com')) {
                        adapter = new AnthropicAdapter(msg.provider);
                    } else {
                        adapter = new OpenAICompatibleAdapter(msg.provider);
                    }
                    this.registry.registerAdapter(adapter);

                    this.db.logAudit(
                        'KEY_CHANGE',
                        msg.provider.id,
                        `Added custom provider "${msg.provider.name}" with model "${msg.model.displayName}"`
                    );

                    postMessage({
                        type: 'SHOW_NOTIFICATION',
                        message: `Provider "${msg.provider.name}" and model "${msg.model.displayName}" added successfully.`,
                        severity: 'info'
                    });

                    await this.syncState(postMessage);
                } catch (err: any) {
                    postMessage({
                        type: 'SHOW_NOTIFICATION',
                        message: `Failed to add provider: ${err?.message || err}`,
                        severity: 'error'
                    });
                }
                break;
            }

            case 'ADD_CUSTOM_MODEL': {
                await this.db.addOrUpdateModel(msg.model);
                postMessage({
                    type: 'SHOW_NOTIFICATION',
                    message: `Custom model ${msg.model.displayName} (${msg.model.id}) added.`,
                    severity: 'info'
                });
                await this.syncState(postMessage);
                break;
            }

            case 'TOGGLE_MODEL': {
                await this.db.setModelEnabled(msg.modelId, msg.enabled);
                await this.syncState(postMessage);
                break;
            }

            case 'UPDATE_FALLBACK_CONFIG': {
                await this.db.updateFallbackConfig(msg.config);
                this.fallbackEngine.updateConfig(msg.config);
                postMessage({
                    type: 'SHOW_NOTIFICATION',
                    message: 'Fallback preferences updated.',
                    severity: 'info'
                });
                await this.syncState(postMessage);
                break;
            }

            case 'SEND_PROMPT': {
                await this.handleSendPrompt(msg, postMessage);
                break;
            }

            case 'ABORT_PROMPT': {
                const controller = this.activeAbortControllers.get(msg.requestId);
                if (controller) {
                    controller.abort();
                    this.activeAbortControllers.delete(msg.requestId);
                }
                break;
            }

            case 'CLEAR_HISTORY': {
                this.messages = [];
                await this.saveCurrentChat();
                await this.syncState(postMessage);
                break;
            }

            case 'LIST_FOLDER_CHATS': {
                const chats = await this.db.listFolderChats();
                const activePath = this.currentChatWorkspacePath || this.guardrails?.getWorkspaceRoot() || null;
                postMessage({ type: 'FOLDER_CHATS_LIST', chats, currentWorkspacePath: activePath });
                break;
            }

            case 'LOAD_FOLDER_CHAT': {
                await this.saveCurrentChat();
                this.currentChatWorkspacePath = msg.workspacePath === 'global' ? null : msg.workspacePath;
                this.messages = await this.db.loadFolderChat(this.currentChatWorkspacePath);
                this.messagesLoaded = true;
                await this.syncState(postMessage);
                const folderName = this.currentChatWorkspacePath ? path.basename(this.currentChatWorkspacePath) : 'Global / Scratchpad';
                postMessage({ type: 'SHOW_NOTIFICATION', message: `Loaded chat history for "${folderName}" (${this.messages.length} messages).`, severity: 'info' });
                break;
            }

            case 'DELETE_FOLDER_CHAT': {
                await this.db.deleteFolderChat(msg.workspacePath === 'global' ? null : msg.workspacePath);
                const activePath = this.currentChatWorkspacePath || this.guardrails?.getWorkspaceRoot() || null;
                if ((msg.workspacePath === 'global' && !activePath) || msg.workspacePath === activePath) {
                    this.messages = [];
                    await this.syncState(postMessage);
                }
                const chats = await this.db.listFolderChats();
                postMessage({ type: 'FOLDER_CHATS_LIST', chats, currentWorkspacePath: activePath });
                postMessage({ type: 'SHOW_NOTIFICATION', message: 'Folder chat history deleted.', severity: 'info' });
                break;
            }

            case 'OPEN_EXTERNAL_URL': {
                vscode.env.openExternal(vscode.Uri.parse(msg.url));
                break;
            }

            case 'WORKSPACE_GET_TREE': {
                if (!this.fileTree) {
                    postMessage({ type: 'SHOW_NOTIFICATION', message: 'Workspace subsystem not initialized.', severity: 'warn' });
                    return;
                }
                const nodes = await this.fileTree.buildTree(msg.path || '', 2);
                postMessage({
                    type: 'WORKSPACE_TREE',
                    nodes,
                    workspaceRoot: this.guardrails?.getWorkspaceRoot() ?? null
                });
                break;
            }

            case 'WORKSPACE_READ_FILE': {
                if (!this.fileTree) return;
                try {
                    const res = await this.fileTree.readFile(msg.relativePath);
                    postMessage({
                        type: 'WORKSPACE_FILE_CONTENT',
                        relativePath: msg.relativePath,
                        content: res.content,
                        sizeBytes: res.sizeBytes,
                        truncated: res.truncated,
                        warning: res.warning
                    });
                } catch (err: any) {
                    postMessage({
                        type: 'SHOW_NOTIFICATION',
                        message: `File read failed: ${err?.message || err}`,
                        severity: 'error'
                    });
                }
                break;
            }

            case 'WORKSPACE_SEARCH': {
                if (!this.fileTree) return;
                const results = await this.fileTree.searchFiles(msg.query);
                postMessage({
                    type: 'WORKSPACE_SEARCH_RESULTS',
                    results
                });
                break;
            }

            case 'WORKSPACE_PICK_FOLDER': {
                await vscode.commands.executeCommand('antigravityHub.pickWorkspace');
                await this.syncState(postMessage);
                if (this.fileTree) {
                    const nodes = await this.fileTree.buildTree('', 2);
                    postMessage({
                        type: 'WORKSPACE_TREE',
                        nodes,
                        workspaceRoot: this.guardrails?.getWorkspaceRoot() ?? null
                    });
                }
                break;
            }

            case 'WORKSPACE_APPROVE_EDIT': {
                if (!this.diffEngine) return;
                try {
                    const result = await this.diffEngine.approveEdit(msg.editId);
                    postMessage({
                        type: 'EDIT_APPROVED',
                        editId: msg.editId,
                        path: result.path,
                        bytesWritten: result.bytesWritten
                    });
                    postMessage({
                        type: 'SHOW_NOTIFICATION',
                        message: `Saved changes to ${result.path} (${result.bytesWritten} bytes).`,
                        severity: 'info'
                    });
                } catch (err: any) {
                    postMessage({
                        type: 'SHOW_NOTIFICATION',
                        message: `Failed to apply edit: ${err?.message || err}`,
                        severity: 'error'
                    });
                }
                break;
            }

            case 'WORKSPACE_REJECT_EDIT': {
                if (!this.diffEngine) return;
                this.diffEngine.rejectEdit(msg.editId);
                postMessage({
                    type: 'EDIT_REJECTED',
                    editId: msg.editId
                });
                postMessage({
                    type: 'SHOW_NOTIFICATION',
                    message: 'Diff proposal rejected.',
                    severity: 'info'
                });
                break;
            }

            // ── Phase 9: Agentic loop (all providers) ─────────────────────────

            case 'AGENT_RUN': {
                await this.handleAgentRun(msg, postMessage);
                break;
            }

            case 'AGENT_APPROVE_EDIT': {
                if (!this.agentLoop) return;
                try {
                    const executor = this.agentLoop.getToolExecutor();
                    const res = await executor.approveEdit(msg.editId);
                    postMessage({ type: 'AGENT_EDIT_APPROVED', editId: msg.editId, filePath: res.path, bytesWritten: res.bytesWritten });
                    postMessage({ type: 'SHOW_NOTIFICATION', message: `Saved ${res.path} (${res.bytesWritten} bytes written).`, severity: 'info' });
                    this.db.logAudit('REQUEST', 'agent', `Agent edit approved and saved: ${res.path}`);
                } catch (err: any) {
                    postMessage({ type: 'SHOW_NOTIFICATION', message: `Failed to save edit: ${err?.message || err}`, severity: 'error' });
                }
                break;
            }

            case 'AGENT_REJECT_EDIT': {
                if (!this.agentLoop) return;
                this.agentLoop.getToolExecutor().rejectEdit(msg.editId);
                postMessage({ type: 'AGENT_EDIT_REJECTED', editId: msg.editId });
                postMessage({ type: 'SHOW_NOTIFICATION', message: 'Edit proposal rejected.', severity: 'info' });
                break;
            }

            case 'ATTACH_ACTIVE_ERROR': {
                // Read the active editor diagnostics and return them as context to inject into the prompt
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    postMessage({ type: 'SHOW_NOTIFICATION', message: 'No active file open in the editor.', severity: 'warn' });
                    return;
                }
                const doc = editor.document;
                const relPath = this.guardrails ? this.guardrails.toRelative(doc.fileName) : doc.fileName;
                const diags = vscode.languages.getDiagnostics(doc.uri);
                const errors = diags
                    .filter(d => d.severity === vscode.DiagnosticSeverity.Error || d.severity === vscode.DiagnosticSeverity.Warning)
                    .map(d => `Line ${d.range.start.line + 1}: [${d.severity === 0 ? 'ERROR' : 'WARN'}] ${d.message}`)
                    .join('\n');
                const selection = editor.selection.isEmpty ? '' : doc.getText(editor.selection);
                const context = [
                    `Active file: ${relPath}`,
                    `Language: ${doc.languageId}`,
                    errors ? `Diagnostics:\n${errors}` : 'No diagnostics.',
                    selection ? `Selected text:\n\`\`\`\n${selection}\n\`\`\`` : ''
                ].filter(Boolean).join('\n');
                postMessage({ type: 'ACTIVE_ERROR_CONTEXT', context });
                break;
            }

            case 'SET_ACTIVE_MODEL': {
                this.activeProviderId = msg.providerId;
                this.activeModelId = msg.modelId;
                await this.db.setActiveModel(msg.providerId, msg.modelId);
                break;
            }

            case 'DELETE_PROVIDER': {
                await this.vault.deleteKey(msg.providerId);
                await this.db.deleteProvider(msg.providerId);
                postMessage({ type: 'SHOW_NOTIFICATION', message: `Provider "${msg.providerId}" and its model holder removed.`, severity: 'info' });
                await this.syncState(postMessage);
                break;
            }

            case 'PURGE_UNCONFIGURED_PROVIDERS': {
                const providers = this.db.getProviders();
                const configured: string[] = [];
                for (const p of providers) {
                    if (await this.vault.hasKey(p.id)) configured.push(p.id);
                }
                const count = await this.db.purgeUnconfiguredProviders(configured);
                await this.db.purgeUnwantedModels();
                postMessage({ type: 'SHOW_NOTIFICATION', message: `Cleaned up ${count} unused providers and pruned unwanted models.`, severity: 'info' });
                await this.syncState(postMessage);
                break;
            }

            case 'PURGE_UNWANTED_MODELS': {
                const count = await this.db.purgeUnwantedModels();
                postMessage({ type: 'SHOW_NOTIFICATION', message: `Purged ${count} non-chat models. Only verified usable models remain.`, severity: 'info' });
                await this.syncState(postMessage);
                break;
            }
        }
    }

    private async handleAgentRun(
        msg: { prompt: string; providerId: string; modelId: string; isDebugMode: boolean; clientMessageId?: string },
        postMessage: (out: HostToWebviewMessage) => void
    ): Promise<void> {
        const requestId = `agent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        if (!this.agentLoop) {
            postMessage({ type: 'AGENT_ERROR', requestId, errorMessage: 'Agent loop not available. Please open a workspace folder first.' });
            postMessage({ type: 'SHOW_NOTIFICATION', message: 'Agent loop not available. Select a workspace folder first.', severity: 'warn' });
            return;
        }

        this.activeProviderId = msg.providerId;
        this.activeModelId = msg.modelId;

        // Add user message to chat history
        const userMsg: ChatMessage = {
            id: msg.clientMessageId || `msg_u_${Date.now()}`,
            role: 'user',
            content: msg.prompt,
            timestamp: Date.now()
        };
        this.messages.push(userMsg);
        await this.saveCurrentChat();
        postMessage({ type: 'USER_MESSAGE_COMMITTED', message: userMsg });

        // Build conversation history (without the current prompt, it's passed separately)
        // Exclude past error messages so they don't poison LLM context or cause repetitive errors
        const history = this.messages
            .slice(0, -1)
            .filter(m => (m.role === 'user' || m.role === 'assistant') && !m.content.startsWith('Error:'))
            .map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content
            }));

        // Accumulate tool steps for the final assistant message
        const thinkingSteps: string[] = [];
        let finalContent = '';
        let errorHandled = false;

        try {
            await this.agentLoop.run(
                {
                    isDebugMode: msg.isDebugMode,
                    providerId: msg.providerId,
                    modelId: msg.modelId,
                    prompt: msg.prompt,
                    history
                },
                {
                    onThinking: (step) => {
                        thinkingSteps.push(step);
                        postMessage({ type: 'AGENT_THINKING', requestId, step });
                    },
                    onToolResult: (result) => {
                        postMessage({
                            type: 'AGENT_TOOL_RESULT',
                            requestId,
                            toolName: result.toolName,
                            success: result.success,
                            output: result.output.substring(0, 500) + (result.output.length > 500 ? '...' : '')
                        });
                    },
                    onPendingEdit: (edit) => {
                        postMessage({
                            type: 'AGENT_EDIT_PROPOSAL',
                            requestId,
                            editId: edit.editId,
                            filePath: edit.filePath,
                            originalContent: edit.originalContent,
                            proposedContent: edit.proposedContent,
                            description: edit.description
                        });
                    },
                    onFinalResponse: async (text, resolvedProviderId, resolvedModelId) => {
                        finalContent = text;
                        const finalProviderId = resolvedProviderId || msg.providerId;
                        const finalModelId = resolvedModelId || msg.modelId;
                        const assistantMsg: ChatMessage = {
                            id: `msg_a_${Date.now()}`,
                            role: 'assistant',
                            content: text,
                            providerId: finalProviderId,
                            modelId: finalModelId,
                            timestamp: Date.now()
                        };
                        this.messages.push(assistantMsg);
                        await this.saveCurrentChat();
                        postMessage({ type: 'AGENT_RESPONSE', requestId, message: assistantMsg });
                        this.db.logAudit('REQUEST', finalProviderId, `Agent response (${msg.isDebugMode ? 'debug' : 'assistant'} mode, ${thinkingSteps.length} tool calls)`, finalModelId);
                        if (finalProviderId !== msg.providerId || finalModelId !== msg.modelId) {
                            this.activeProviderId = finalProviderId;
                            this.activeModelId = finalModelId;
                            await this.syncState(postMessage);
                        }
                    },
                    onError: async (message) => {
                        if (errorHandled) return;
                        errorHandled = true;
                        const errAssistantMsg: ChatMessage = {
                            id: `msg_err_${Date.now()}`,
                            role: 'assistant',
                            content: `Error: ${message}`,
                            providerId: msg.providerId,
                            modelId: msg.modelId,
                            timestamp: Date.now()
                        };
                        this.messages.push(errAssistantMsg);
                        await this.saveCurrentChat();
                        postMessage({ type: 'AGENT_ERROR', requestId, errorMessage: message });
                    }
                }
            );
        } catch (err: any) {
            if (errorHandled) return;
            errorHandled = true;
            const errAssistantMsg: ChatMessage = {
                id: `msg_err_${Date.now()}`,
                role: 'assistant',
                content: `Error: ${err?.message || err}`,
                providerId: msg.providerId,
                modelId: msg.modelId,
                timestamp: Date.now()
            };
            this.messages.push(errAssistantMsg);
            await this.saveCurrentChat();
            postMessage({ type: 'AGENT_ERROR', requestId, errorMessage: err?.message || String(err) });
        }
    }

    private async handleSendPrompt(
        msg: { prompt: string; providerId: string; modelId: string; attachments?: any[]; clientMessageId?: string },
        postMessage: (out: HostToWebviewMessage) => void
    ): Promise<void> {
        this.activeProviderId = msg.providerId;
        this.activeModelId = msg.modelId;

        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const abortController = new AbortController();
        this.activeAbortControllers.set(requestId, abortController);

        // Add User Message to History using client-supplied ID if provided to prevent duplicate rendering
        const userMsg: ChatMessage = {
            id: msg.clientMessageId || `msg_u_${Date.now()}`,
            role: 'user',
            content: msg.prompt,
            attachments: msg.attachments,
            timestamp: Date.now()
        };
        this.messages.push(userMsg);
        await this.saveCurrentChat();

        // Notify Webview immediately so user message is rendered at once
        postMessage({
            type: 'USER_MESSAGE_COMMITTED',
            message: userMsg
        });

        postMessage({
            type: 'STREAM_START',
            requestId,
            providerId: msg.providerId,
            modelId: msg.modelId
        });

        const historyForRequest = this.messages
            .filter(m => !m.content.startsWith('Error:'))
            .map(m => ({
                role: m.role,
                content: m.content,
                attachments: m.attachments
            }));

        const request: ChatCompletionRequest = {
            requestId,
            providerId: msg.providerId,
            modelId: msg.modelId,
            messages: historyForRequest
        };

        const startTime = Date.now();

        try {
            const execution = await this.fallbackEngine.dispatchChat(request, abortController.signal);

            const content = execution.response?.content || '';
            const reasoningContent = execution.response?.reasoningContent;

            const assistantMsg: ChatMessage = {
                id: `msg_a_${Date.now()}`,
                role: 'assistant',
                content,
                reasoningContent,
                providerId: execution.resolvedProviderId,
                modelId: execution.resolvedModelId,
                fallbackOccurred: execution.fallbackOccurred,
                originalProviderId: execution.originalProviderId,
                timestamp: Date.now()
            };

            this.messages.push(assistantMsg);
            await this.saveCurrentChat();

            // Record usage
            const usage = execution.response?.usage || {
                promptTokens: Math.ceil(msg.prompt.length / 4),
                completionTokens: Math.ceil(content.length / 4),
                totalTokens: Math.ceil((msg.prompt.length + content.length) / 4)
            };

            await this.db.recordUsage({
                id: `use_${Date.now()}`,
                timestamp: Date.now(),
                providerId: execution.resolvedProviderId,
                modelId: execution.resolvedModelId,
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                totalTokens: usage.totalTokens,
                latencyMs: Date.now() - startTime,
                success: true,
                fallbackOccurred: execution.fallbackOccurred
            });

            postMessage({
                type: 'STREAM_END',
                requestId,
                message: assistantMsg,
                fallbackOccurred: execution.fallbackOccurred,
                originalProviderId: execution.originalProviderId
            });
        } catch (err: any) {
            const hubError: HubError = err instanceof HubError ? err : (err as any);
            const details = hubError.details || {
                code: 'UNKNOWN',
                message: String(err),
                userFacingMessage: err?.message || String(err),
                isRetryable: false,
                providerId: msg.providerId,
                modelId: msg.modelId
            };

            postMessage({
                type: 'STREAM_ERROR',
                requestId,
                error: details
            });
        } finally {
            this.activeAbortControllers.delete(requestId);
        }
    }

    public async syncState(postMessage: (out: HostToWebviewMessage) => void): Promise<void> {
        await this.ensureMessagesLoaded();
        const providers = this.db.getProviders();
        const models = this.db.getModels();
        const fallbackConfig = this.db.getFallbackConfig();

        const summaries: ProviderSummary[] = [];

        for (const p of providers) {
            const hasKey = await this.vault.hasKey(p.id);
            const providerModels = models.filter(m => m.providerId === p.id);
            const isCircuitOpen = this.fallbackEngine.isCircuitOpen(p.id);

            summaries.push({
                config: p,
                isKeyConfigured: hasKey,
                models: providerModels,
                isCircuitOpen
            });
        }

        const wsRoot = this.currentChatWorkspacePath || this.guardrails?.getWorkspaceRoot() || null;
        const currentFolderChatName = wsRoot ? path.basename(wsRoot) : 'Global / Scratchpad';

        postMessage({
            type: 'SYNC_STATE',
            providers: summaries,
            fallbackConfig,
            messages: this.messages,
            activeProviderId: this.activeProviderId,
            activeModelId: this.activeModelId,
            modelUsage: this.db.getModelUsageSummary(),
            totalTokens: this.db.getTotalTokens(),
            totalRequests: this.db.getTotalRequests(),
            auditLogs: this.db.getAuditLogs().slice(-50).reverse(),
            workspaceRoot: wsRoot,
            currentFolderChatName
        });
    }
}
