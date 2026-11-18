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
        name: 'proposeFileEdit',
        description: 'Propose a corrected version of a file. ALWAYS read the file first. The user must approve — edits are NEVER auto-saved. Provide COMPLETE file content, not a partial diff.',
        parameters: {
            filePath: { type: 'string', description: 'Relative path to the file to edit.' },
            newContent: { type: 'string', description: 'The complete updated file content (full file, not a snippet).' },
            description: { type: 'string', description: 'What changed and why (1-3 sentences).' }
        },
        required: ['filePath', 'newContent', 'description']
    }
];

// ─── System Prompts ───────────────────────────────────────────────────────────

const DEBUGGER_SYSTEM_PROMPT = `You are an expert code debugger embedded in an IDE called Antigravity IDE.

Your job:
1. IDENTIFY the root cause of the error in 1-2 sentences.
2. USE the available tools (listFiles, readFile, searchFiles, getActiveFileContext, proposeFileEdit) to investigate the codebase.
3. ALWAYS read the file before proposing any edit.
4. PROPOSE exactly the minimal correct fix using proposeFileEdit with a clear description.
5. After proposing, briefly explain what you changed and why (do not repeat the code).

Rules:
- Never guess — always read the file first.
- Never propose edits to .env, secrets, or credential files.
- Always call getActiveFileContext first if the user says "fix this" without specifying a file.
- Produce the COMPLETE corrected file content when proposing an edit — not a partial snippet.
- Be direct and concise. No unnecessary explanations.`;

const ASSISTANT_SYSTEM_PROMPT = `You are a helpful AI assistant embedded in Antigravity IDE.
You can explore the workspace, read source files, search for patterns, and propose file edits for the user to review.
When accessing files, always use the available tools rather than guessing file contents.
Credential and secret files are automatically protected — you cannot access them.
Proposed edits require explicit user approval before saving.`;

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
    onFinalResponse: (text: string) => void;
    onError: (message: string) => void;
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
        const { isDebugMode, providerId, modelId, prompt, history } = options;
        const maxIter = options.maxIterations ?? 10;

        const apiKey = await this.vault.getKey(providerId);
        if (!apiKey) {
            callbacks.onError(`No API key configured for ${providerId}. Please add it in Provider Manager.`);
            return;
        }
        const cleanedKey = cleanApiKey(apiKey);

        const providerConfig = this.db.getProvider(providerId);
        if (!providerConfig) {
            callbacks.onError(`Provider "${providerId}" not found.`);
            return;
        }

        const protocol = detectProtocol(providerId, providerConfig.protocol, providerConfig.baseUrl);
        const systemPrompt = isDebugMode ? DEBUGGER_SYSTEM_PROMPT : ASSISTANT_SYSTEM_PROMPT;

        switch (protocol) {
            case 'gemini':
                return this.runGeminiLoop(cleanedKey, modelId, providerConfig.baseUrl, systemPrompt, prompt, history, maxIter, callbacks);
            case 'openai':
                return this.runOpenAILoop(cleanedKey, modelId, providerConfig.baseUrl, systemPrompt, prompt, history, maxIter, callbacks, providerConfig.id);
            case 'anthropic':
                return this.runAnthropicLoop(cleanedKey, modelId, providerConfig.baseUrl, systemPrompt, prompt, history, maxIter, callbacks);
            case 'react-fallback':
                return this.runReActLoop(cleanedKey, modelId, providerConfig, systemPrompt, prompt, history, maxIter, callbacks);
        }
    }

    // ─── Gemini Loop ────────────────────────────────────────────────────────────

    private async runGeminiLoop(
        apiKey: string, modelId: string, baseUrl: string,
        systemPrompt: string, prompt: string,
        history: Array<{ role: 'user' | 'assistant'; content: string }>,
        maxIter: number, callbacks: AgentLoopCallbacks
    ): Promise<void> {
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
            const data = await this.fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(payload) }, callbacks);
            if (!data) return;

            const parts: any[] = data.candidates?.[0]?.content?.parts || [];
            const functionCallParts = parts.filter((p: any) => p.functionCall);
            const textParts = parts.filter((p: any) => p.text);

            payload.contents.push({ role: 'model', parts });

            if (functionCallParts.length === 0) {
                callbacks.onFinalResponse(textParts.map((p: any) => p.text).join('') || '(Empty response)');
                return;
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
        callbacks.onError(`Agent reached maximum iterations (${maxIter}).`);
    }

    // ─── OpenAI-Compatible Loop (OpenAI, DeepSeek, Groq, OpenRouter, etc.) ────

    private async runOpenAILoop(
        apiKey: string, modelId: string, baseUrl: string,
        systemPrompt: string, prompt: string,
        history: Array<{ role: 'user' | 'assistant'; content: string }>,
        maxIter: number, callbacks: AgentLoopCallbacks,
        providerId: string
    ): Promise<void> {
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

            const data = await this.fetchJson(chatUrl, { method: 'POST', headers, body: JSON.stringify(payload) }, callbacks);
            if (!data) return;

            const choice = data.choices?.[0];
            const assistantMsg = choice?.message;
            if (!assistantMsg) {
                callbacks.onError('No message in response from provider.');
                return;
            }

            messages.push(assistantMsg);

            const toolCalls: any[] = assistantMsg.tool_calls || [];
            if (toolCalls.length === 0) {
                // Final answer
                callbacks.onFinalResponse(assistantMsg.content || '(Empty response)');
                return;
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
        callbacks.onError(`Agent reached maximum iterations (${maxIter}).`);
    }

    // ─── Anthropic Loop ─────────────────────────────────────────────────────────

    private async runAnthropicLoop(
        apiKey: string, modelId: string, baseUrl: string,
        systemPrompt: string, prompt: string,
        history: Array<{ role: 'user' | 'assistant'; content: string }>,
        maxIter: number, callbacks: AgentLoopCallbacks
    ): Promise<void> {
        const base = baseUrl.replace(/\/+$/, '');
        const messagesUrl = base.endsWith('/messages') ? base : `${base}/messages`;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'User-Agent': 'Antigravity-Multi-AI-Hub/0.1.0'
        };

        // Build Anthropic messages (no system role in messages array)
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

            const data = await this.fetchJson(messagesUrl, { method: 'POST', headers, body: JSON.stringify(payload) }, callbacks);
            if (!data) return;

            const responseContent: any[] = data.content || [];
            const stopReason: string = data.stop_reason || 'end_turn';

            // Add assistant turn to messages
            messages.push({ role: 'assistant', content: responseContent });

            const toolUseBlocks = responseContent.filter((c: any) => c.type === 'tool_use');
            const textBlocks = responseContent.filter((c: any) => c.type === 'text');

            if (toolUseBlocks.length === 0 || stopReason === 'end_turn') {
                callbacks.onFinalResponse(textBlocks.map((t: any) => t.text).join('') || '(Empty response)');
                return;
            }

            // Execute tool calls and collect results
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

            // Add tool results as a user turn (Anthropic format)
            messages.push({ role: 'user', content: toolResults });
        }
        callbacks.onError(`Agent reached maximum iterations (${maxIter}).`);
    }

    // ─── ReAct Text-Based Fallback (Ollama and others) ───────────────────────

    private async runReActLoop(
        apiKey: string, modelId: string, providerConfig: any,
        systemPrompt: string, prompt: string,
        history: Array<{ role: 'user' | 'assistant'; content: string }>,
        maxIter: number, callbacks: AgentLoopCallbacks
    ): Promise<void> {
        // Use the existing adapter's sendChatCompletion with structured ReAct prompting
        const adapter = this.registry.getAdapter(providerConfig.id);
        if (!adapter) {
            callbacks.onError(`No adapter found for provider "${providerConfig.id}".`);
            return;
        }

        const enhancedSystem = systemPrompt + buildReActSystemAddition();
        const conversationMessages: any[] = [
            { role: 'system', content: enhancedSystem },
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: prompt }
        ];

        for (let i = 0; i < maxIter; i++) {
            const { ChatCompletionRequest } = await import('../types/chat' as any);
            const request = {
                requestId: `agent_${Date.now()}`,
                providerId: providerConfig.id,
                modelId,
                messages: conversationMessages,
                temperature: 0.1,
                maxTokens: 4096
            };

            let responseText = '';
            try {
                const resp = await adapter.sendChatCompletion(apiKey, request as any);
                responseText = resp.content;
            } catch (err: any) {
                callbacks.onError(`Provider error: ${err?.message || err}`);
                return;
            }

            conversationMessages.push({ role: 'assistant', content: responseText });

            // Parse ReAct format: TOOL_CALL: <name>\nARGS: <json>
            const toolCallMatch = responseText.match(/TOOL_CALL:\s*(\w+)\s*\nARGS:\s*(\{[\s\S]*?\})/);
            if (!toolCallMatch) {
                // No tool call — final response
                // Strip any ReAct formatting artifacts from the final answer
                const cleaned = responseText
                    .replace(/TOOL_CALL:.*$/gm, '')
                    .replace(/ARGS:.*$/gm, '')
                    .trim();
                callbacks.onFinalResponse(cleaned || responseText);
                return;
            }

            const toolName = toolCallMatch[1];
            let args: Record<string, any> = {};
            try { args = JSON.parse(toolCallMatch[2]); } catch { args = {}; }

            callbacks.onThinking(`Tool: ${toolName}(${Object.keys(args).map(k => `${k}="${String(args[k]).substring(0, 50)}"`).join(', ')})`);
            const result = await this.executor.execute({ name: toolName as any, args });
            callbacks.onToolResult(result);
            if (result.pendingEdit) callbacks.onPendingEdit(result.pendingEdit);

            // Feed tool result back as a user message
            conversationMessages.push({
                role: 'user',
                content: `TOOL_RESULT for ${toolName}:\n${result.output}`
            });
        }
        callbacks.onError(`Agent reached maximum iterations (${maxIter}).`);
    }

    // ─── Shared HTTP Helper ───────────────────────────────────────────────────

    private async fetchJson(url: string, init: RequestInit, callbacks: AgentLoopCallbacks): Promise<any | null> {
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
                callbacks.onError(userMsg);
                return null;
            }
            return await response.json();
        } catch (err: any) {
            callbacks.onError(`Network error: ${err?.message || err}`);
            return null;
        }
    }
}
