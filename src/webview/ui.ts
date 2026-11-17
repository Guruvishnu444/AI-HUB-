export function getWebviewHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Antigravity Multi-AI Hub</title>
    <style>
        :root {
            --bg: var(--vscode-editor-background, #1e1e1e);
            --fg: var(--vscode-editor-foreground, #d4d4d4);
            --card-bg: var(--vscode-sideBar-background, #252526);
            --border: var(--vscode-widget-border, #3c3c3c);
            --input-bg: var(--vscode-input-background, #3c3c3c);
            --input-fg: var(--vscode-input-foreground, #cccccc);
            --btn-bg: var(--vscode-button-background, #0e639c);
            --btn-fg: var(--vscode-button-foreground, #ffffff);
            --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
            --badge-green: #0e7039;
            --badge-red: #a82424;
            --badge-amber: #b8860b;
            --badge-blue: #1c5bba;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            background-color: var(--bg);
            color: var(--fg);
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
            font-size: 13px;
        }

        /* Top Navigation Tabs */
        .nav-tabs {
            display: flex;
            border-bottom: 1px solid var(--border);
            background: var(--card-bg);
            flex-shrink: 0;
        }

        .tab-btn {
            padding: 10px 16px;
            cursor: pointer;
            border: none;
            background: transparent;
            color: var(--fg);
            opacity: 0.7;
            font-size: 12px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
            border-bottom: 2px solid transparent;
        }

        .tab-btn:hover { opacity: 1; }
        .tab-btn.active {
            opacity: 1;
            border-bottom: 2px solid var(--btn-bg);
            color: var(--btn-fg);
        }

        /* Tab Panes */
        .tab-pane {
            flex: 1;
            display: none;
            flex-direction: column;
            overflow-y: auto;
            padding: 14px;
        }
        .tab-pane.active { display: flex; }

        /* Badges */
        .badge {
            display: inline-block;
            padding: 2px 7px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }
        .badge-green { background: var(--badge-green); color: #fff; }
        .badge-red { background: var(--badge-red); color: #fff; }
        .badge-amber { background: var(--badge-amber); color: #fff; }
        .badge-blue { background: var(--badge-blue); color: #fff; }
        .badge-gray { background: #3c3c3c; color: #ddd; }

        /* Card Container */
        .card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 14px;
            margin-bottom: 14px;
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .card-title {
            font-size: 13px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        /* Inputs and Buttons */
        input[type="text"], input[type="password"], input[type="number"], select, textarea {
            width: 100%;
            padding: 7px 10px;
            background: var(--input-bg);
            color: var(--input-fg);
            border: 1px solid var(--border);
            border-radius: 4px;
            font-size: 12px;
            outline: none;
            margin-bottom: 8px;
        }
        input:focus, select:focus, textarea:focus { border-color: var(--btn-bg); }

        button {
            padding: 6px 12px;
            background: var(--btn-bg);
            color: var(--btn-fg);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
        }
        button:hover { background: var(--btn-hover); }
        button.secondary {
            background: transparent;
            border: 1px solid var(--border);
            color: var(--fg);
        }
        button.secondary:hover { background: rgba(255,255,255,0.06); }
        button.danger { background: var(--badge-red); color: #fff; }

        /* Chat Layout */
        .chat-container {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
        }

        .chat-header-bar {
            display: flex;
            gap: 10px;
            align-items: center;
            margin-bottom: 10px;
            flex-wrap: wrap;
        }

        .model-select-group {
            flex: 1;
            min-width: 220px;
        }

        .chat-messages {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 14px;
            padding-right: 4px;
        }

        .message-bubble {
            padding: 12px 16px;
            border-radius: 6px;
            line-height: 1.5;
            max-width: 95%;
            word-wrap: break-word;
        }
        .message-bubble.user {
            background: rgba(14, 99, 156, 0.22);
            border: 1px solid rgba(14, 99, 156, 0.45);
            align-self: flex-end;
        }
        .message-bubble.assistant {
            background: var(--card-bg);
            border: 1px solid var(--border);
            align-self: flex-start;
        }

        .message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            margin-bottom: 6px;
            padding-bottom: 4px;
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .role-tag {
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .reasoning-box {
            background: rgba(0,0,0,0.3);
            border-left: 3px solid var(--badge-amber);
            padding: 8px 12px;
            border-radius: 0 4px 4px 0;
            font-size: 11.5px;
            margin-bottom: 8px;
            color: #ccc;
        }
        .reasoning-title {
            font-weight: 600;
            color: var(--badge-amber);
            margin-bottom: 4px;
        }

        /* Chat Input Area */
        .chat-input-area {
            margin-top: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            flex-shrink: 0;
        }
        .chat-textarea {
            resize: none;
            height: 70px;
            margin-bottom: 0;
        }
        .chat-action-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        /* Tables */
        .data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            margin-top: 6px;
        }
        .data-table th, .data-table td {
            padding: 8px 10px;
            text-align: left;
            border-bottom: 1px solid var(--border);
        }
        .data-table th {
            font-weight: 600;
            background: rgba(255,255,255,0.03);
            color: var(--fg);
            opacity: 0.85;
        }

        .btn-group {
            display: flex;
            gap: 8px;
            margin-top: 6px;
            flex-wrap: wrap;
        }

        /* Form grid */
        .form-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }

        .toast {
            position: fixed;
            bottom: 12px;
            right: 12px;
            background: #252526;
            border: 1px solid var(--border);
            padding: 8px 14px;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            font-size: 12px;
            display: none;
            z-index: 1000;
        }
    </style>
</head>
<body>

    <!-- Top Tabs (Symbols only, No Emojis) -->
    <div class="nav-tabs">
        <button class="tab-btn active" onclick="switchTab('chat')">[ &gt; ] Chat &amp; Routing</button>
        <button class="tab-btn" onclick="switchTab('providers')">[ + ] Provider Manager</button>
        <button class="tab-btn" onclick="switchTab('fallback')">[ # ] Fallback Rules</button>
        <button class="tab-btn" onclick="switchTab('usage')">[ = ] Usage &amp; Audit</button>
    </div>

    <!-- TAB 1: CHAT & MODEL SELECTOR -->
    <div id="pane-chat" class="tab-pane active">
        <div class="chat-container">
            <!-- Model Selection Bar -->
            <div class="chat-header-bar">
                <div class="model-select-group">
                    <label style="font-size:11px; font-weight:600; opacity:0.8; margin-bottom:2px; display:block;">Active Model</label>
                    <select id="model-selector" onchange="onModelChange()"></select>
                </div>
                <div id="model-badges" style="display:flex; gap:6px; align-items:center; margin-top:14px;"></div>
                <button class="secondary" style="margin-top:14px;" onclick="clearChat()">[ Clear History ]</button>
            </div>

            <!-- Fallback Status Alert -->
            <div id="fallback-status-banner" style="display:none; margin-bottom:8px;" class="card">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="badge badge-amber">[ FALLBACK ACTIVE ]</span>
                    <span id="fallback-status-text" style="font-size:11.5px;"></span>
                </div>
            </div>

            <!-- Messages Stream Area -->
            <div id="chat-messages" class="chat-messages">
                <div style="text-align:center; opacity:0.6; padding:30px 10px;">
                    <p style="font-size:14px; font-weight:600; margin-bottom:4px;">Antigravity Multi-AI Hub</p>
                    <p style="font-size:12px;">Type your message below. The chat history will display exactly what was sent and the received reply.</p>
                </div>
            </div>

            <!-- Input Box -->
            <div class="chat-input-area">
                <textarea id="chat-input" class="chat-textarea" placeholder="Type prompt here... (Enter to send, Shift+Enter for new line)" onkeydown="handleKeyDown(event)"></textarea>
                <div class="chat-action-bar">
                    <span id="char-counter" style="font-size:11px; opacity:0.6;">Ready</span>
                    <div style="display:flex; gap:8px;">
                        <button id="abort-btn" class="danger" style="display:none;" onclick="abortPrompt()">[ Stop ]</button>
                        <button id="send-btn" onclick="sendPrompt()">[ Send Prompt ]</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- TAB 2: PROVIDER MANAGER -->
    <div id="pane-providers" class="tab-pane">
        <!-- Security Notice -->
        <div class="card">
            <div class="card-header">
                <span class="card-title">&bull; Secure Credential Storage</span>
                <span class="badge badge-blue">Windows DPAPI</span>
            </div>
            <p style="font-size:11.5px; opacity:0.8; line-height:1.4;">
                API keys are stored directly in your local <strong>Windows Credential Store</strong>.
                Keys are never logged, never committed, and never exposed in plain text.
            </p>
        </div>

        <!-- Add Custom Provider & Model Form -->
        <div class="card" style="border:1px solid rgba(14, 99, 156, 0.5);">
            <div class="card-header">
                <span class="card-title">[+] Add Custom Provider &amp; Model</span>
                <span class="badge badge-gray">Universal OpenAI Protocol</span>
            </div>
            <p style="font-size:11.5px; opacity:0.8; margin-bottom:12px;">
                Connect any other AI provider or local server (OpenAI, OpenRouter, Groq, Ollama, LM Studio, vLLM, etc.) by entering its details:
            </p>
            <div class="form-grid">
                <div>
                    <label style="font-size:11px; font-weight:600; display:block; margin-bottom:2px;">Provider Name</label>
                    <input type="text" id="custom-provider-name" placeholder="e.g. OpenAI, OpenRouter, Groq, Ollama">
                </div>
                <div>
                    <label style="font-size:11px; font-weight:600; display:block; margin-bottom:2px;">Base URL</label>
                    <input type="text" id="custom-provider-url" placeholder="e.g. https://api.openai.com/v1">
                </div>
            </div>
            <div class="form-grid">
                <div>
                    <label style="font-size:11px; font-weight:600; display:block; margin-bottom:2px;">Model Name &amp; ID</label>
                    <input type="text" id="custom-model-id" placeholder="e.g. gpt-4o, llama3.3:70b, mistral-large">
                </div>
                <div>
                    <label style="font-size:11px; font-weight:600; display:block; margin-bottom:2px;">API Key (Leave blank if local)</label>
                    <input type="password" id="custom-api-key" placeholder="Enter key (stored securely in Windows DPAPI)">
                </div>
            </div>
            <button onclick="addCustomProviderAndModel()">[+ Register Provider &amp; Model ]</button>
        </div>

        <!-- Registered Providers List -->
        <div id="providers-list"></div>
    </div>

    <!-- TAB 3: FALLBACK RULES -->
    <div id="pane-fallback" class="tab-pane">
        <div class="card">
            <div class="card-header">
                <span class="card-title">&bull; Resilient Fallback Engine</span>
                <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
                    <input type="checkbox" id="fallback-enabled-toggle" onchange="saveFallbackConfig()"> Enable Automatic Fallback
                </label>
            </div>
            <p style="font-size:11.5px; opacity:0.8; line-height:1.4; margin-bottom:12px;">
                When enabled, if your primary provider is rate-limited (HTTP 429) or experiencing temporary outages,
                the engine automatically switches to the next configured provider without losing your conversation context.
            </p>

            <div style="margin-bottom:12px;">
                <label style="font-size:11px; font-weight:600; margin-bottom:4px; display:block;">Priority Chain Order</label>
                <select id="fallback-priority-select" onchange="saveFallbackConfig()"></select>
            </div>

            <div style="margin-bottom:12px;">
                <label style="font-size:11px; font-weight:600; margin-bottom:4px; display:block;">Max Immediate Retries on 429 / 5xx</label>
                <input type="number" id="max-retries-input" min="0" max="5" value="2" onchange="saveFallbackConfig()" style="width:120px;">
            </div>

            <div>
                <label style="font-size:11px; font-weight:600; margin-bottom:4px; display:block;">Circuit Breaker Failure Threshold</label>
                <input type="number" id="circuit-threshold-input" min="1" max="10" value="3" onchange="saveFallbackConfig()" style="width:120px;">
            </div>
        </div>
    </div>

    <!-- TAB 4: USAGE & AUDIT -->
    <div id="pane-usage" class="tab-pane">
        <!-- Overall Stats -->
        <div class="card">
            <div class="card-header">
                <span class="card-title">&bull; Cumulative Consumption</span>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; text-align:center;">
                <div style="background:rgba(0,0,0,0.25); padding:12px; border-radius:4px;">
                    <div style="font-size:20px; font-weight:700;" id="total-tokens-stat">0</div>
                    <div style="font-size:11px; opacity:0.7;">Total Tokens Processed</div>
                </div>
                <div style="background:rgba(0,0,0,0.25); padding:12px; border-radius:4px;">
                    <div style="font-size:20px; font-weight:700;" id="total-requests-stat">0</div>
                    <div style="font-size:11px; opacity:0.7;">Total Requests Dispatched</div>
                </div>
            </div>
        </div>

        <!-- Separate Per-Model Usage Breakdown -->
        <div class="card">
            <div class="card-header">
                <span class="card-title">&bull; AI Models Usage Breakdown</span>
                <span class="badge badge-gray" id="model-count-badge">0 Models</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Model</th>
                            <th>Provider</th>
                            <th>Requests</th>
                            <th>Prompt Tokens</th>
                            <th>Completion Tokens</th>
                            <th>Total Tokens</th>
                            <th>Avg Latency</th>
                        </tr>
                    </thead>
                    <tbody id="model-usage-tbody">
                        <tr>
                            <td colspan="7" style="text-align:center; opacity:0.6; padding:16px;">No model usage recorded yet. Run a prompt to view statistics.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Activity & Fallback Audit Log -->
        <div class="card">
            <div class="card-header">
                <span class="card-title">&bull; Fallback &amp; Activity Audit Log</span>
            </div>
            <div id="audit-log-container" style="max-height:220px; overflow-y:auto; font-size:11px; font-family:monospace; line-height:1.5;">
                <p style="opacity:0.6;">No activity logged yet.</p>
            </div>
        </div>
    </div>

    <div id="toast" class="toast"></div>

    <script>
        const vscode = acquireVsCodeApi();
        let state = {
            providers: [],
            fallbackConfig: { enabled: true, priorityOrder: ['google-gemini', 'deepseek'], maxRetriesPerProvider: 2, circuitBreakerThreshold: 3 },
            messages: [],
            activeProviderId: 'google-gemini',
            activeModelId: 'gemini-2.5-flash',
            currentRequestId: null,
            modelUsage: [],
            totalTokens: 0,
            totalRequests: 0,
            auditLogs: []
        };

        function switchTab(tabName) {
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            const activeBtn = document.querySelector(\`[onclick="switchTab('\${tabName}')"]\`);
            if (activeBtn) activeBtn.classList.add('active');
            const activePane = document.getElementById(\`pane-\${tabName}\`);
            if (activePane) activePane.classList.add('active');
        }

        window.addEventListener('DOMContentLoaded', () => {
            vscode.postMessage({ type: 'INIT_STATE' });
        });

        window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.type) {
                case 'SYNC_STATE':
                    state.providers = msg.providers;
                    state.fallbackConfig = msg.fallbackConfig;
                    state.messages = msg.messages;
                    state.activeProviderId = msg.activeProviderId || state.activeProviderId;
                    state.activeModelId = msg.activeModelId || state.activeModelId;
                    state.modelUsage = msg.modelUsage || [];
                    state.totalTokens = msg.totalTokens || 0;
                    state.totalRequests = msg.totalRequests || 0;
                    state.auditLogs = msg.auditLogs || [];

                    renderModelSelector();
                    renderProviders();
                    renderFallbackConfig();
                    renderMessages();
                    renderUsageAnalytics();
                    break;

                case 'USER_MESSAGE_COMMITTED':
                    // Verify if user message is already rendered, else append
                    if (!state.messages.some(m => m.id === msg.message.id)) {
                        state.messages.push(msg.message);
                        renderMessages();
                    }
                    break;

                case 'CONNECTION_TEST_RESULT':
                    showToast(msg.result.success
                        ? \`[✓] \${msg.providerId}: Connected (\${msg.result.latencyMs}ms, \${msg.result.modelCount || 0} models)\`
                        : \`[✕] \${msg.providerId}: \${msg.result.errorMessage}\`
                    );
                    renderProviders();
                    break;

                case 'STREAM_START':
                    state.currentRequestId = msg.requestId;
                    document.getElementById('send-btn').style.display = 'none';
                    document.getElementById('abort-btn').style.display = 'block';
                    break;

                case 'STREAM_END':
                    state.currentRequestId = null;
                    document.getElementById('send-btn').style.display = 'block';
                    document.getElementById('abort-btn').style.display = 'none';
                    // Remove pending assistant placeholder if present
                    state.messages = state.messages.filter(m => !m.isPending);
                    state.messages.push(msg.message);
                    renderMessages();
                    // Request state refresh for updated token usage
                    vscode.postMessage({ type: 'INIT_STATE' });
                    break;

                case 'STREAM_ERROR':
                    state.currentRequestId = null;
                    document.getElementById('send-btn').style.display = 'block';
                    document.getElementById('abort-btn').style.display = 'none';
                    // Update pending assistant bubble with error
                    const pendingMsg = state.messages.find(m => m.isPending);
                    if (pendingMsg) {
                        pendingMsg.isPending = false;
                        pendingMsg.content = \`[ERROR]: \${msg.error.userFacingMessage}\`;
                    }
                    renderMessages();
                    showToast(\`[ERROR]: \${msg.error.userFacingMessage}\`);
                    break;

                case 'SHOW_NOTIFICATION':
                    showToast(msg.message);
                    break;
            }
        });

        function renderModelSelector() {
            const select = document.getElementById('model-selector');
            select.innerHTML = '';

            let allModels = [];
            state.providers.forEach(p => {
                if (p.config.isEnabled) {
                    p.models.forEach(m => {
                        if (m.isEnabled) allModels.push({ ...m, providerName: p.config.name });
                    });
                }
            });

            allModels.forEach(m => {
                const opt = document.createElement('option');
                opt.value = \`\${m.providerId}::\${m.id}\`;
                opt.textContent = \`[\${m.providerName}] \${m.displayName} (\${m.id})\`;
                if (m.providerId === state.activeProviderId && m.id === state.activeModelId) {
                    opt.selected = true;
                }
                select.appendChild(opt);
            });

            onModelChange();
        }

        function onModelChange() {
            const select = document.getElementById('model-selector');
            if (!select.value) return;
            const [pId, mId] = select.value.split('::');
            state.activeProviderId = pId;
            state.activeModelId = mId;

            const provider = state.providers.find(p => p.config.id === pId);
            const model = provider?.models?.find(m => m.id === mId);

            const badges = document.getElementById('model-badges');
            badges.innerHTML = '';
            if (model) {
                const caps = model.capabilities;
                if (caps.supportsVision) badges.innerHTML += '<span class="badge badge-blue">[Vision]</span>';
                if (caps.supportsReasoningContent) badges.innerHTML += '<span class="badge badge-amber">[Reasoning]</span>';
                if (caps.supportsTools) badges.innerHTML += '<span class="badge badge-green">[Tools]</span>';
                const ctxK = Math.round(caps.maxContextTokens / 1024);
                badges.innerHTML += \`<span class="badge badge-gray">[\${ctxK}k Ctx]</span>\`;
            }
        }

        function renderProviders() {
            const container = document.getElementById('providers-list');
            container.innerHTML = '';

            state.providers.forEach(p => {
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = \`
                    <div class="card-header">
                        <span class="card-title">&bull; \${escapeHtml(p.config.name)} (\${p.config.id})</span>
                        <span class="badge \${p.isKeyConfigured ? 'badge-green' : 'badge-red'}">
                            \${p.isKeyConfigured ? '[KEY STORED]' : '[NO KEY]'}
                        </span>
                    </div>
                    <div style="font-size:11px; opacity:0.75; margin-bottom:6px;">
                        Base URL: <code>\${escapeHtml(p.config.baseUrl)}</code> | Models: \${p.models.length}
                    </div>
                    <div style="display:flex; gap:8px;">
                        <input type="password" id="key-input-\${p.config.id}" placeholder="\${p.isKeyConfigured ? '•••••••••••••••• (Key Configured)' : 'Enter API Key...'}" style="flex:1;">
                        <button onclick="saveKey('\${p.config.id}')">[ Save Key ]</button>
                        \${p.isKeyConfigured ? \`<button class="danger" onclick="deleteKey('\${p.config.id}')">[ Delete ]</button>\` : ''}
                    </div>
                    <div class="btn-group">
                        <button class="secondary" onclick="testConnection('\${p.config.id}')">[ Ping Connection ]</button>
                        <button class="secondary" onclick="discoverModels('\${p.config.id}')">[ Discover Models ]</button>
                    </div>
                \`;
                container.appendChild(card);
            });
        }

        function addCustomProviderAndModel() {
            const name = document.getElementById('custom-provider-name').value.trim();
            const url = document.getElementById('custom-provider-url').value.trim();
            const modelId = document.getElementById('custom-model-id').value.trim();
            const apiKey = document.getElementById('custom-api-key').value.trim();

            if (!name) {
                showToast('[✕] Please enter a provider name.');
                return;
            }
            if (!url) {
                showToast('[✕] Please enter a valid base URL.');
                return;
            }
            if (!modelId) {
                showToast('[✕] Please enter a model name or ID.');
                return;
            }

            const pId = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

            const provider = {
                id: pId,
                name: name,
                protocol: 'openai-compatible',
                baseUrl: url,
                isEnabled: true,
                timeoutMs: 45000,
                maxRetries: 2
            };

            const model = {
                id: modelId,
                displayName: \`\${name} (\${modelId})\`,
                providerId: pId,
                capabilities: {
                    supportsStreaming: true,
                    supportsVision: false,
                    supportsTools: true,
                    supportsJsonMode: true,
                    supportsReasoningContent: false,
                    maxContextTokens: 128000,
                    maxOutputTokens: 4096
                },
                isCustom: true,
                isEnabled: true,
                description: \`Custom model connected via \${name}\`
            };

            vscode.postMessage({
                type: 'ADD_CUSTOM_PROVIDER',
                provider,
                model,
                apiKey
            });

            // Clear inputs
            document.getElementById('custom-provider-name').value = '';
            document.getElementById('custom-provider-url').value = '';
            document.getElementById('custom-model-id').value = '';
            document.getElementById('custom-api-key').value = '';
        }

        function renderFallbackConfig() {
            document.getElementById('fallback-enabled-toggle').checked = state.fallbackConfig.enabled;
            document.getElementById('max-retries-input').value = state.fallbackConfig.maxRetriesPerProvider;
            document.getElementById('circuit-threshold-input').value = state.fallbackConfig.circuitBreakerThreshold;

            const select = document.getElementById('fallback-priority-select');
            select.innerHTML = '';

            const pIds = state.providers.map(p => p.config.id);
            if (pIds.length >= 2) {
                const opt1 = document.createElement('option');
                opt1.value = pIds.join(',');
                opt1.textContent = pIds.map((id, idx) => \`\${idx + 1}. \${id}\`).join('  ->  ');
                select.appendChild(opt1);

                const reversed = [...pIds].reverse();
                const opt2 = document.createElement('option');
                opt2.value = reversed.join(',');
                opt2.textContent = reversed.map((id, idx) => \`\${idx + 1}. \${id}\`).join('  ->  ');
                select.appendChild(opt2);
            }
        }

        function saveFallbackConfig() {
            const enabled = document.getElementById('fallback-enabled-toggle').checked;
            const priorityStr = document.getElementById('fallback-priority-select').value;
            const maxRetries = parseInt(document.getElementById('max-retries-input').value, 10);
            const threshold = parseInt(document.getElementById('circuit-threshold-input').value, 10);

            vscode.postMessage({
                type: 'UPDATE_FALLBACK_CONFIG',
                config: {
                    enabled,
                    priorityOrder: priorityStr ? priorityStr.split(',') : ['google-gemini', 'deepseek'],
                    maxRetriesPerProvider: maxRetries,
                    circuitBreakerThreshold: threshold,
                    circuitBreakerCooldownMs: 60000
                }
            });
        }

        function renderMessages() {
            const container = document.getElementById('chat-messages');
            if (state.messages.length === 0) {
                container.innerHTML = '<div style="text-align:center; opacity:0.6; padding:30px 10px;"><p style="font-size:14px; font-weight:600;">Antigravity Multi-AI Hub</p><p style="font-size:12px;">Ready for prompts. Every sent message and its received reply will be logged here.</p></div>';
                return;
            }

            container.innerHTML = '';
            state.messages.forEach(m => {
                const bubble = document.createElement('div');
                bubble.className = \`message-bubble \${m.role}\`;

                const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '';

                let headerHtml = '';
                if (m.role === 'user') {
                    headerHtml = \`
                        <div class="message-header">
                            <span class="role-tag" style="color: #4fc1ff;">[ USER ] (You)</span>
                            <span style="opacity:0.6; font-size:10.5px;">\${timeStr}</span>
                        </div>
                    \`;
                } else {
                    const fallbackTag = m.fallbackOccurred
                        ? \`<span class="badge badge-amber" style="margin-left:6px;">[FELL BACK from \${m.originalProviderId}]</span>\`
                        : '';
                    headerHtml = \`
                        <div class="message-header">
                            <span class="role-tag" style="color: #9cdcfe;">[ AI ] (\${escapeHtml(m.providerId || '')} / \${escapeHtml(m.modelId || '')}) \${fallbackTag}</span>
                            <span style="opacity:0.6; font-size:10.5px;">\${timeStr}</span>
                        </div>
                    \`;
                }

                let reasoningHtml = '';
                if (m.reasoningContent) {
                    reasoningHtml = \`
                        <div class="reasoning-box">
                            <div class="reasoning-title">[ Reasoning / Chain-of-Thought ]</div>
                            <div>\${escapeHtml(m.reasoningContent)}</div>
                        </div>
                    \`;
                }

                let contentHtml = '';
                if (m.isPending) {
                    contentHtml = '<div style="opacity:0.7; font-style:italic;">[ Generating response... ]</div>';
                } else {
                    contentHtml = \`<div>\${escapeHtml(m.content)}</div>\`;
                }

                bubble.innerHTML = \`\${headerHtml}\${reasoningHtml}\${contentHtml}\`;
                container.appendChild(bubble);
            });

            container.scrollTop = container.scrollHeight;
        }

        function renderUsageAnalytics() {
            document.getElementById('total-tokens-stat').textContent = state.totalTokens.toLocaleString();
            document.getElementById('total-requests-stat').textContent = state.totalRequests.toLocaleString();
            document.getElementById('model-count-badge').textContent = \`\${state.modelUsage.length} Models\`;

            // Render Per-Model Usage Table
            const tbody = document.getElementById('model-usage-tbody');
            if (state.modelUsage.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; opacity:0.6; padding:16px;">No model usage recorded yet. Run a prompt to view statistics.</td></tr>';
            } else {
                tbody.innerHTML = '';
                state.modelUsage.forEach(item => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = \`
                        <td><strong>\${escapeHtml(item.displayName)}</strong><br><span style="opacity:0.6; font-size:10.5px;">\${escapeHtml(item.modelId)}</span></td>
                        <td><code>\${escapeHtml(item.providerId)}</code></td>
                        <td>\${item.requestCount.toLocaleString()}</td>
                        <td>\${item.promptTokens.toLocaleString()}</td>
                        <td>\${item.completionTokens.toLocaleString()}</td>
                        <td><strong>\${item.totalTokens.toLocaleString()}</strong></td>
                        <td>\${item.avgLatencyMs}ms</td>
                    \`;
                    tbody.appendChild(tr);
                });
            }

            // Render Audit Logs
            const logContainer = document.getElementById('audit-log-container');
            if (state.auditLogs.length === 0) {
                logContainer.innerHTML = '<p style="opacity:0.6;">No activity logged yet.</p>';
            } else {
                logContainer.innerHTML = '';
                state.auditLogs.forEach(entry => {
                    const timeStr = new Date(entry.timestamp).toLocaleTimeString();
                    const line = document.createElement('div');
                    line.style.padding = '3px 0';
                    line.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
                    line.innerHTML = \`<span style="opacity:0.5;">[\${timeStr}]</span> <span class="badge \${getLogBadgeClass(entry.eventType)}">[\${entry.eventType}]</span> <strong>\${escapeHtml(entry.providerId)}</strong>: \${escapeHtml(entry.details)}\`;
                    logContainer.appendChild(line);
                });
            }
        }

        function getLogBadgeClass(type) {
            switch (type) {
                case 'REQUEST': return 'badge-blue';
                case 'FALLBACK': return 'badge-amber';
                case 'RETRY': return 'badge-gray';
                case 'ERROR': return 'badge-red';
                case 'KEY_CHANGE': return 'badge-green';
                default: return 'badge-gray';
            }
        }

        function escapeHtml(text) {
            if (!text) return '';
            return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\n/g, '<br>');
        }

        function sendPrompt() {
            const input = document.getElementById('chat-input');
            const prompt = input.value.trim();
            if (!prompt) return;

            // Immediately show what was sent in the chat
            const userMsg = {
                id: \`local_u_\${Date.now()}\`,
                role: 'user',
                content: prompt,
                timestamp: Date.now()
            };
            state.messages.push(userMsg);

            // Immediately add a pending response bubble
            const pendingAssistantMsg = {
                id: \`local_a_\${Date.now()}\`,
                role: 'assistant',
                content: '',
                providerId: state.activeProviderId,
                modelId: state.activeModelId,
                isPending: true,
                timestamp: Date.now()
            };
            state.messages.push(pendingAssistantMsg);

            renderMessages();

            vscode.postMessage({
                type: 'SEND_PROMPT',
                prompt,
                providerId: state.activeProviderId,
                modelId: state.activeModelId
            });

            input.value = '';
        }

        function handleKeyDown(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendPrompt();
            }
        }

        function abortPrompt() {
            if (state.currentRequestId) {
                vscode.postMessage({ type: 'ABORT_PROMPT', requestId: state.currentRequestId });
            }
        }

        function clearChat() {
            state.messages = [];
            renderMessages();
            vscode.postMessage({ type: 'CLEAR_HISTORY' });
        }

        function saveKey(providerId) {
            const val = document.getElementById(\`key-input-\${providerId}\`).value.trim();
            if (!val) return;
            vscode.postMessage({ type: 'SAVE_KEY', providerId, apiKey: val });
            document.getElementById(\`key-input-\${providerId}\`).value = '';
        }

        function deleteKey(providerId) {
            vscode.postMessage({ type: 'DELETE_KEY', providerId });
        }

        function testConnection(providerId) {
            vscode.postMessage({ type: 'TEST_CONNECTION', providerId });
        }

        function discoverModels(providerId) {
            vscode.postMessage({ type: 'DISCOVER_MODELS', providerId });
        }

        function showToast(text) {
            const t = document.getElementById('toast');
            t.textContent = text;
            t.style.display = 'block';
            setTimeout(() => { t.style.display = 'none'; }, 4000);
        }
    </script>
</body>
</html>`;
}
