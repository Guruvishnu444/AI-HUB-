import { ToolExecutor, ToolCall, ToolResult, PendingEdit } from './toolExecutor';
import { WorkspaceGuardrails } from '../../workspace/guardrails';
import { AdapterRegistry } from '../adapters/registry';
import { SecretVault } from '../storage/secretVault';
import { HubDatabase } from '../storage/database';
import { cleanApiKey } from '../storage/secretVault';

// ─── Tool Declarations in provider-neutral format ─────────────────────────────

interface ToolDef {
    name: string;
    description: string;
    parameters: Record<string, any>;
    required: string[];
}

export const TOOL_DEFS: ToolDef[] = [
    {
        name: 'listFiles',
        description: 'List files and directories in a workspace folder. Use "." for root. Call this first to understand the project structure.',
        parameters: {
            dirPath: { type: 'string', description: 'Relative path to directory. Use "." for workspace root.' }
        },
        required: ['dirPath']
    },
    {
        name: 'readFile',
        description: 'Read the full contents of a file in the workspace. Always call this before proposeFileEdit. Blocked files (.env, keys, secrets) are automatically rejected.',
        parameters: {
            filePath: { type: 'string', description: 'Relative file path from workspace root (e.g. "src/app.ts").' }
        },
        required: ['filePath']
    },
    {
        name: 'searchFiles',
        description: 'Search for a text pattern across workspace files. Use this to locate where a function, variable, or error originates.',
        parameters: {
            query: { type: 'string', description: 'Text or pattern to search for.' },
            dirPath: { type: 'string', description: 'Optional subdirectory to restrict search.' }
        },
        required: ['query']
    },
    {
        name: 'getActiveFileContext',
        description: 'Get the currently open file in the editor, cursor position, selected text, and all IDE error/warning diagnostics. Call this first when user says "fix this error" or "look at this".',
        parameters: {},
        required: []
    },
    {
        name: 'createFile',
        description: 'Create a brand new file in the workspace with complete source code or text. Use this whenever the user asks to create a file, generate a new script, write a program, or build a new module (e.g., "create test.py", "make a python script", "create hello.js"). The file will be safely created in the workspace upon one-click user approval.',
        parameters: {
            filePath: { type: 'string', description: 'Relative path of the new file to create (e.g. "test.py", "scripts/build.py", "src/hello.js").' },
            content: { type: 'string', description: 'The complete source code or text content to write into the new file.' },
            description: { type: 'string', description: 'Short summary of the file being created.' }
        },
        required: ['filePath', 'content']
    },
    {
        name: 'proposeFileEdit',
        description: 'Propose a corrected version of an existing file. ALWAYS read the file first. The user must approve — edits are NEVER auto-saved. Provide COMPLETE file content, not a partial diff.',
        parameters: {
            filePath: { type: 'string', description: 'Relative path to the file to edit.' },
            newContent: { type: 'string', description: 'The complete updated file content (full file, not a snippet).' },
            description: { type: 'string', description: 'What changed and why (1-3 sentences).' }
        },
        required: ['filePath', 'newContent', 'description']
    }
];

// ─── System Prompts ───────────────────────────────────────────────────────────

const DEBUGGER_SYSTEM_PROMPT = `You are an expert code debugger and software developer embedded in Antigravity IDE.

Your capabilities:
You have tools to list files (listFiles), read files (readFile), search code (searchFiles), check the active editor (getActiveFileContext), create new files (createFile), and edit existing files (proposeFileEdit).
You CAN create new files and edit files directly in the user's workspace through these tools!

Your job:
1. When asked to create a file, use the createFile tool with the filename and complete code.
2. When asked to fix an error, IDENTIFY the root cause in 1-2 sentences.
3. USE the available tools to inspect the codebase and read the file before proposing any edit.
4. PROPOSE the fix using proposeFileEdit or createFile with a clear description.
5. After calling the tool, briefly summarize what you did.

Rules:
- Never say you cannot create files — you HAVE the createFile tool! Use it.
- Never guess file contents — always read the file first before editing.
- Never propose edits to .env, secrets, or credential files.
- Produce COMPLETE file content, not partial snippets.
- Be direct and concise.`;

const ASSISTANT_SYSTEM_PROMPT = `You are an AI coding assistant embedded in Antigravity IDE.
You have direct tool access to the workspace:
- You can create new files using the createFile tool.
- You can read files using readFile.
- You can explore directories using listFiles.
- You can search the codebase using searchFiles.
- You can propose modifications to existing files using proposeFileEdit.

When the user asks you to create a program, script, or file, ALWAYS call the createFile tool with the desired relative path and the complete code. The user will be given a one-click approval button to save it to their disk.
Never say you cannot create or edit files, because you have tools that do exactly that.`;

// ─── Provider Protocol Detection ──────────────────────────────────────────────

type AgentProtocol = 'gemini' | 'openai' | 'anthropic' | 'react-fallback';

function detectProtocol(providerId: string, protocol: string, baseUrl: string): AgentProtocol {
    if (protocol === 'google-native' || baseUrl.includes('generativelanguage.googleapis.com')) {
        return 'gemini';
    }
    if (protocol === 'anthropic-native' || baseUrl.includes('anthropic.com')) {
        return 'anthropic';
    }
    if (protocol === 'openai-compatible' || baseUrl.includes('openai.com') || baseUrl.includes('deepseek.com') || baseUrl.includes('groq.com') || baseUrl.includes('openrouter.ai')) {
        return 'openai';
    }
    // Ollama and unknown: use ReAct text-based fallback
    return 'react-fallback';
}

// ─── Tool Declarations per Provider Format ────────────────────────────────────

function buildGeminiTools(): any {
    return [{
        functionDeclarations: TOOL_DEFS.map(t => ({
            name: t.name,
            description: t.description,
            parameters: {
                type: 'OBJECT',
                properties: Object.fromEntries(
                    Object.entries(t.parameters).map(([k, v]) => [k, { type: (v as any).type.toUpperCase(), description: (v as any).description }])
                ),
                required: t.required
            }
        }))
    }];
}

function buildOpenAITools(): any {
    return TOOL_DEFS.map(t => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: {
                type: 'object',
                properties: t.parameters,
                required: t.required
            }
        }
    }));
}

function buildAnthropicTools(): any {
    return TOOL_DEFS.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: {
            type: 'object',
            properties: t.parameters,
            required: t.required
        }
    }));
}

function buildReActSystemAddition(): string {
    const toolList = TOOL_DEFS.map(t => {
        const params = Object.entries(t.parameters).map(([k, v]) => `  - ${k}: ${(v as any).description}`).join('\n');
        return `Tool: ${t.name}\nDescription: ${t.description}${params ? '\nParameters:\n' + params : ''}`;
    }).join('\n\n');

    return `\n\nYou have access to the following tools. To use a tool, respond EXACTLY with this format (nothing before or after on those lines):

TOOL_CALL: <toolName>
ARGS: <JSON object with arguments>

Wait for the tool result before continuing. When done, respond normally without any TOOL_CALL prefix.

Available tools:
${toolList}

Example:
TOOL_CALL: readFile
ARGS: {"filePath": "src/app.ts"}`;
}

// ─── Main Options / Callbacks ─────────────────────────────────────────────────

export interface AgentLoopOptions {
    isDebugMode: boolean;
    maxIterations?: number;
    providerId: string;
    modelId: string;
    prompt: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AgentLoopCallbacks {
    onThinking: (step: string) => void;
    onToolResult: (result: ToolResult) => void;
    onPendingEdit: (edit: PendingEdit) => void;
    onFinalResponse: (text: string, resolvedProviderId?: string, resolvedModelId?: string) => void;
    onError: (message: string) => void;
}

function isUsableChatModel(id: string, providerId: string): boolean {
    const lower = id.toLowerCase();
    if (lower.includes('embedding') || lower.includes('aqa') || lower.includes('imagen') || lower.includes('bison') || lower.includes('whisper') || lower.includes('tts') || lower.includes('moderation') || lower.includes('dall-e')) {
        return false;
    }
    if (providerId === 'google-gemini' && lower.includes('gemma')) {
        return false;
    }
    return true;
}

function isSwitchableError(status: number, message: string): boolean {
    if (status === 429 || status === 503 || status === 500 || status === 502 || status === 504 || status === 404) return true;
    const lower = message.toLowerCase();
    return lower.includes('quota') ||
           lower.includes('rate limit') ||
           lower.includes('resource_exhausted') ||
           lower.includes('free_tier_requests') ||
           lower.includes('high demand') ||
           lower.includes('overloaded') ||
           lower.includes('unavailable') ||
           lower.includes('exceeded your current quota') ||
           lower.includes('capacity') ||
           lower.includes('insufficient_quota') ||
           lower.includes('billing') ||
           lower.includes('credit') ||
           lower.includes('fetch failed') ||
           lower.includes('connection refused') ||
           lower.includes('enotfound');
}

// ─── AgentLoop ────────────────────────────────────────────────────────────────

export class AgentLoop {
    private executor: ToolExecutor;
    private registry: AdapterRegistry;
    private vault: SecretVault;
    private db: HubDatabase;

    constructor(guardrails: WorkspaceGuardrails, registry: AdapterRegistry, vault: SecretVault, db: HubDatabase) {
        this.executor = new ToolExecutor(guardrails);
        this.registry = registry;
        this.vault = vault;
        this.db = db;
    }

    public getToolExecutor(): ToolExecutor {
        return this.executor;
    }

    public async run(options: AgentLoopOptions, callbacks: AgentLoopCallbacks): Promise<void> {
        const { isDebugMode, prompt, history } = options;
        const maxIter = options.maxIterations ?? 10;
        const systemPrompt = isDebugMode ? DEBUGGER_SYSTEM_PROMPT : ASSISTANT_SYSTEM_PROMPT;

        // Build ordered candidate list of models and providers for automated fallback
        interface CandidateTarget {
            providerId: string;
            modelId: string;
        }

        const candidates: CandidateTarget[] = [];
        candidates.push({ providerId: options.providerId, modelId: options.modelId });

        // 1. Alternate enabled chat models for the current provider
        const currentProviderModels = this.db.getModels().filter(m =>
            m.providerId === options.providerId &&
            m.isEnabled &&
            m.id !== options.modelId &&
            isUsableChatModel(m.id, m.providerId)
        );
        for (const m of currentProviderModels) {
            candidates.push({ providerId: options.providerId, modelId: m.id });
        }

        // 2. Alternate configured providers from fallbackConfig priorityOrder
        const fallbackConfig = this.db.getFallbackConfig();
        const priorityOrder = fallbackConfig.priorityOrder || [];
        for (const pId of priorityOrder) {
            if (pId === options.providerId) continue;
            const key = await this.vault.getKey(pId);
            const cfg = this.db.getProvider(pId);
            const isLocal = cfg?.baseUrl?.includes('localhost') || cfg?.baseUrl?.includes('127.0.0.1');
            if (!key && !isLocal) continue;

            const altModels = this.db.getModels().filter(m =>
                m.providerId === pId &&
                m.isEnabled &&
                isUsableChatModel(m.id, m.providerId)
            );
            for (const am of altModels) {
                candidates.push({ providerId: pId, modelId: am.id });
            }
        }

        let lastError: any = null;

        for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
            const candidate = candidates[cIdx];
            const isFallback = cIdx > 0;

            const apiKey = await this.vault.getKey(candidate.providerId) || '';
            const cleanedKey = cleanApiKey(apiKey);
            const providerConfig = this.db.getProvider(candidate.providerId);
            if (!providerConfig) continue;

            const isLocal = providerConfig.baseUrl.includes('localhost') || providerConfig.baseUrl.includes('127.0.0.1');
            if (!cleanedKey && !isLocal) {
                if (!isFallback) {
                    callbacks.onError(`No API key configured for ${candidate.providerId}. Please add it in Provider Manager.`);
                    return;
                }
                continue;
            }

            if (isFallback) {
                callbacks.onThinking(`Automatically falling back to ${providerConfig.name} (${candidate.modelId})...`);
            }

            const protocol = detectProtocol(candidate.providerId, providerConfig.protocol, providerConfig.baseUrl);

            try {
                let responseText = '';
                if (protocol === 'gemini') {
                    responseText = await this.runGeminiLoop(cleanedKey, candidate.modelId, providerConfig.baseUrl, systemPrompt, prompt, history, maxIter, callbacks);
                } else if (protocol === 'openai') {
                    responseText = await this.runOpenAILoop(cleanedKey, candidate.modelId, providerConfig.baseUrl, systemPrompt, prompt, history, maxIter, callbacks, providerConfig.id);
                } else if (protocol === 'anthropic') {
                    responseText = await this.runAnthropicLoop(cleanedKey, candidate.modelId, providerConfig.baseUrl, systemPrompt, prompt, history, maxIter, callbacks);
                } else {
                    responseText = await this.runReActLoop(cleanedKey, candidate.modelId, providerConfig, systemPrompt, prompt, history, maxIter, callbacks);
                }

                if (isFallback) {
                    await this.db.setActiveModel(candidate.providerId, candidate.modelId);
                    this.db.logAudit(
                        'FALLBACK',
                        candidate.providerId,
                        `Agent resolved via fallback from ${options.providerId} (${options.modelId}) to ${candidate.providerId} (${candidate.modelId})`,
                        candidate.modelId
                    );
                }

                callbacks.onFinalResponse(responseText, candidate.providerId, candidate.modelId);
                return;
            } catch (err: any) {
                lastError = err;
                const msg = err?.message || String(err);
                const status = err?.status || 0;
                const isSwitchable = err?.isSwitchable ?? isSwitchableError(status, msg);

                this.db.logAudit('ERROR', candidate.providerId, `Agent attempt failed on ${candidate.modelId}: ${msg}`, candidate.modelId);

                if (isSwitchable && cIdx + 1 < candidates.length) {
                    const nextCandidate = candidates[cIdx + 1];
                    const nextProvider = this.db.getProvider(nextCandidate.providerId);
                    callbacks.onThinking(`Model ${candidate.modelId} quota exceeded or unavailable. Switching to ${nextProvider?.name || nextCandidate.providerId} (${nextCandidate.modelId})...`);
                    continue;
                }

                if (!isSwitchable) {
                    break;
                }
            }
        }

        callbacks.onError(lastError?.message || 'All available models in the fallback chain failed.');
    }

    // ─── Gemini Loop ────────────────────────────────────────────────────────────

    private async runGeminiLoop(
        apiKey: string, modelId: string, baseUrl: string,
        systemPrompt: string, prompt: string,
        history: Array<{ role: 'user' | 'assistant'; content: string }>,
        maxIter: number, callbacks: AgentLoopCallbacks
    ): Promise<string> {
        const cleanModel = modelId.replace(/^models\//, '');
        const url = `${baseUrl.replace(/\/+$/, '')}/models/${cleanModel}:generateContent?key=${encodeURIComponent(apiKey)}`;

        const contents: any[] = [
            ...history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
            { role: 'user', parts: [{ text: prompt }] }
        ];

        const payload: any = {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            tools: buildGeminiTools(),
            toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
        };

        for (let i = 0; i < maxIter; i++) {
            const data = await this.fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(payload) });

            const parts: any[] = data.candidates?.[0]?.content?.parts || [];
            const functionCallParts = parts.filter((p: any) => p.functionCall);
            const textParts = parts.filter((p: any) => p.text);

            payload.contents.push({ role: 'model', parts });

            if (functionCallParts.length === 0) {
                return textParts.map((p: any) => p.text).join('') || '(Empty response)';
            }

            const responsePartsForGemini: any[] = [];
            for (const fcPart of functionCallParts) {
                const { name, args } = fcPart.functionCall;
                callbacks.onThinking(`Tool: ${name}(${Object.keys(args || {}).map(k => `${k}="${String(args[k]).substring(0, 50)}"`).join(', ')})`);
                const result = await this.executor.execute({ name: name as any, args: args || {} });
                callbacks.onToolResult(result);
                if (result.pendingEdit) callbacks.onPendingEdit(result.pendingEdit);
                responsePartsForGemini.push({ functionResponse: { name, response: { result: result.output } } });
            }
            payload.contents.push({ role: 'user', parts: responsePartsForGemini });
        }
        throw new Error(`Agent reached maximum iterations (${maxIter}).`);
    }

    // ─── OpenAI-Compatible Loop (OpenAI, DeepSeek, Groq, OpenRouter, etc.) ────

    private async runOpenAILoop(
        apiKey: string, modelId: string, baseUrl: string,
        systemPrompt: string, prompt: string,
        history: Array<{ role: 'user' | 'assistant'; content: string }>,
        maxIter: number, callbacks: AgentLoopCallbacks,
        providerId: string
    ): Promise<string> {
        const base = baseUrl.replace(/\/+$/, '');
        const chatUrl = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'Antigravity-Multi-AI-Hub/0.1.0'
        };
        if (providerId === 'openrouter' || base.includes('openrouter.ai')) {
            headers['HTTP-Referer'] = 'https://antigravity.hub';
            headers['X-Title'] = 'Antigravity Multi-AI Hub';
        }

        const messages: any[] = [
            { role: 'system', content: systemPrompt },
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: prompt }
        ];

        const tools = buildOpenAITools();

        for (let i = 0; i < maxIter; i++) {
            const payload: any = {
                model: modelId,
                messages,
                tools,
                tool_choice: 'auto',
                temperature: 0.1,
                max_tokens: 8192
            };

            const data = await this.fetchJson(chatUrl, { method: 'POST', headers, body: JSON.stringify(payload) });

            const choice = data.choices?.[0];
            const assistantMsg = choice?.message;
            if (!assistantMsg) {
                throw new Error('No message in response from provider.');
            }

            messages.push(assistantMsg);

            const toolCalls: any[] = assistantMsg.tool_calls || [];
            if (toolCalls.length === 0) {
                return assistantMsg.content || '(Empty response)';
            }

            // Execute tool calls
            for (const tc of toolCalls) {
                const name = tc.function?.name;
                let args: Record<string, any> = {};
                try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { args = {}; }

                callbacks.onThinking(`Tool: ${name}(${Object.keys(args).map(k => `${k}="${String(args[k]).substring(0, 50)}"`).join(', ')})`);
                const result = await this.executor.execute({ name: name as any, args });
                callbacks.onToolResult(result);
                if (result.pendingEdit) callbacks.onPendingEdit(result.pendingEdit);

                messages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: result.output
                });
            }
        }
        throw new Error(`Agent reached maximum iterations (${maxIter}).`);
    }

    // ─── Anthropic Loop ─────────────────────────────────────────────────────────

    private async runAnthropicLoop(
        apiKey: string, modelId: string, baseUrl: string,
        systemPrompt: string, prompt: string,
        history: Array<{ role: 'user' | 'assistant'; content: string }>,
        maxIter: number, callbacks: AgentLoopCallbacks
    ): Promise<string> {
        const base = baseUrl.replace(/\/+$/, '');
        const messagesUrl = base.endsWith('/messages') ? base : `${base}/messages`;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'User-Agent': 'Antigravity-Multi-AI-Hub/0.1.0'
        };

        const messages: any[] = [
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: prompt }
        ];

        const tools = buildAnthropicTools();

        for (let i = 0; i < maxIter; i++) {
            const payload: any = {
                model: modelId,
                system: systemPrompt,
                messages,
                tools,
                max_tokens: 8192,
                temperature: 0.1
            };

            const data = await this.fetchJson(messagesUrl, { method: 'POST', headers, body: JSON.stringify(payload) });

            const responseContent: any[] = data.content || [];
            const stopReason: string = data.stop_reason || 'end_turn';

            messages.push({ role: 'assistant', content: responseContent });

            const toolUseBlocks = responseContent.filter((c: any) => c.type === 'tool_use');
            const textBlocks = responseContent.filter((c: any) => c.type === 'text');

            if (toolUseBlocks.length === 0 || stopReason === 'end_turn') {
                return textBlocks.map((t: any) => t.text).join('') || '(Empty response)';
            }

            const toolResults: any[] = [];
            for (const toolUse of toolUseBlocks) {
                const { id, name, input } = toolUse;
                callbacks.onThinking(`Tool: ${name}(${Object.keys(input || {}).map(k => `${k}="${String(input[k]).substring(0, 50)}"`).join(', ')})`);
                const result = await this.executor.execute({ name: name as any, args: input || {} });
                callbacks.onToolResult(result);
                if (result.pendingEdit) callbacks.onPendingEdit(result.pendingEdit);

                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: id,
                    content: result.output
                });
            }

            messages.push({ role: 'user', content: toolResults });
        }
        throw new Error(`Agent reached maximum iterations (${maxIter}).`);
    }

    // ─── ReAct Text-Based Fallback (Ollama and others) ───────────────────────

    private async runReActLoop(
        apiKey: string, modelId: string, providerConfig: any,
        systemPrompt: string, prompt: string,
        history: Array<{ role: 'user' | 'assistant'; content: string }>,
        maxIter: number, callbacks: AgentLoopCallbacks
    ): Promise<string> {
        const adapter = this.registry.getAdapter(providerConfig.id);
        if (!adapter) {
            throw new Error(`No adapter found for provider "${providerConfig.id}".`);
        }

        const enhancedSystem = systemPrompt + buildReActSystemAddition();
        const conversationMessages: any[] = [
            { role: 'system', content: enhancedSystem },
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: prompt }
        ];

        for (let i = 0; i < maxIter; i++) {
            const request = {
                requestId: `agent_${Date.now()}`,
                providerId: providerConfig.id,
                modelId,
                messages: conversationMessages,
                temperature: 0.1,
                maxTokens: 4096
            };

            const resp = await adapter.sendChatCompletion(apiKey, request as any);
            const responseText = resp.content;

            conversationMessages.push({ role: 'assistant', content: responseText });

            const toolCallMatch = responseText.match(/TOOL_CALL:\s*(\w+)\s*\nARGS:\s*(\{[\s\S]*?\})/);
            if (!toolCallMatch) {
                const cleaned = responseText
                    .replace(/TOOL_CALL:.*$/gm, '')
                    .replace(/ARGS:.*$/gm, '')
                    .trim();
                return cleaned || responseText;
            }

            const toolName = toolCallMatch[1];
            let args: Record<string, any> = {};
            try { args = JSON.parse(toolCallMatch[2]); } catch { args = {}; }

            callbacks.onThinking(`Tool: ${toolName}(${Object.keys(args).map(k => `${k}="${String(args[k]).substring(0, 50)}"`).join(', ')})`);
            const result = await this.executor.execute({ name: toolName as any, args });
            callbacks.onToolResult(result);
            if (result.pendingEdit) callbacks.onPendingEdit(result.pendingEdit);

            conversationMessages.push({
                role: 'user',
                content: `TOOL_RESULT for ${toolName}:\n${result.output}`
            });
        }
        throw new Error(`Agent reached maximum iterations (${maxIter}).`);
    }

    // ─── Shared HTTP Helper ───────────────────────────────────────────────────

    private async fetchJson(url: string, init: RequestInit): Promise<any> {
        try {
            const response = await fetch(url, init);
            if (!response.ok) {
                const body = await response.text();
                let userMsg = `Provider error (HTTP ${response.status})`;
                try {
                    const parsed = JSON.parse(body);
                    const errText = parsed?.error?.message || parsed?.message || parsed?.detail;
                    if (errText) userMsg = `Provider error: ${errText}`;
                } catch { userMsg = `Provider error (HTTP ${response.status}): ${body.substring(0, 300)}`; }

                const isSwitchable = isSwitchableError(response.status, userMsg);
                const err: any = new Error(userMsg);
                err.status = response.status;
                err.isSwitchable = isSwitchable;
                throw err;
            }
            return await response.json();
        } catch (err: any) {
            if (err?.isSwitchable !== undefined) throw err;
            const netErr: any = new Error(`Network error: ${err?.message || err}`);
            netErr.status = 0;
            netErr.isSwitchable = true;
            throw netErr;
        }
    }
}
