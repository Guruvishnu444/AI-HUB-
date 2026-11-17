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

        /* Tab Content Panes */
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
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }
        .badge-green { background: var(--badge-green); color: #fff; }
        .badge-red { background: var(--badge-red); color: #fff; }
        .badge-amber { background: var(--badge-amber); color: #fff; }
        .badge-blue { background: var(--badge-blue); color: #fff; }

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
        input[type="text"], input[type="password"], select, textarea {
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
            min-width: 200px;
        }

        .chat-messages {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding-right: 4px;
        }

        .message-bubble {
            padding: 10px 14px;
            border-radius: 6px;
            line-height: 1.5;
            max-width: 95%;
            word-wrap: break-word;
        }
        .message-bubble.user {
            background: rgba(14, 99, 156, 0.2);
            border: 1px solid rgba(14, 99, 156, 0.4);
            align-self: flex-end;
        }
        .message-bubble.assistant {
            background: var(--card-bg);
            border: 1px solid var(--border);
            align-self: flex-start;
        }

        .message-meta {
            display: flex;
            gap: 8px;
            align-items: center;
            font-size: 11px;
            opacity: 0.7;
            margin-bottom: 4px;
        }

        .reasoning-box {
            background: rgba(0,0,0,0.25);
            border-left: 3px solid var(--badge-amber);
            padding: 8px 10px;
            border-radius: 0 4px 4px 0;
            font-size: 11.5px;
            margin-bottom: 8px;
            color: #ccc;
        }
        .reasoning-title {
            font-weight: 600;
            color: var(--badge-amber);
            margin-bottom: 4px;
            cursor: pointer;
            user-select: none;
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
            height: 65px;
            margin-bottom: 0;
        }
        .chat-action-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        /* Settings & Provider Rows */
        .provider-row {
            border-top: 1px solid rgba(255,255,255,0.05);
            padding-top: 12px;
            margin-top: 12px;
        }
        .btn-group {
            display: flex;
            gap: 8px;
            margin-top: 6px;
        }

        /* Notifications Banner */
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

    <!-- Tab Bar -->
    <div class="nav-tabs">
        <button class="tab-btn active" onclick="switchTab('chat')">💬 Chat & Routing</button>
        <button class="tab-btn" onclick="switchTab('providers')">⚙️ Provider Manager</button>
        <button class="tab-btn" onclick="switchTab('fallback')">🛡️ Fallback Rules</button>
        <button class="tab-btn" onclick="switchTab('usage')">📊 Usage & Audit</button>
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
                <button class="secondary" style="margin-top:14px;" onclick="clearChat()">Clear</button>
            </div>

            <!-- Fallback Status Alert -->
            <div id="fallback-status-banner" style="display:none; margin-bottom:8px;" class="card">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="badge badge-amber">Fallback Active</span>
                    <span id="fallback-status-text" style="font-size:11.5px;"></span>
                </div>
            </div>

            <!-- Messages Stream Area -->
            <div id="chat-messages" class="chat-messages">
                <div style="text-align:center; opacity:0.6; padding:30px 10px;">
                    <p style="font-size:14px; font-weight:600; margin-bottom:4px;">Antigravity Multi-AI Hub</p>
                    <p style="font-size:12px;">Select a model, enter your prompt, and get automatic resilient fallback.</p>
                </div>
            </div>

            <!-- Input Box -->
            <div class="chat-input-area">
                <textarea id="chat-input" class="chat-textarea" placeholder="Type instructions or code question... (Enter to send, Shift+Enter for new line)" onkeydown="handleKeyDown(event)"></textarea>
                <div class="chat-action-bar">
                    <span id="char-counter" style="font-size:11px; opacity:0.6;">0 tokens (est)</span>
                    <div style="display:flex; gap:8px;">
                        <button id="abort-btn" class="danger" style="display:none;" onclick="abortPrompt()">Stop</button>
                        <button id="send-btn" onclick="sendPrompt()">Send Prompt</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- TAB 2: PROVIDER MANAGER -->
    <div id="pane-providers" class="tab-pane">
        <div class="card">
            <div class="card-header">
                <span class="card-title">🔐 Secure API Key Storage</span>
                <span class="badge badge-blue">Windows DPAPI</span>
            </div>
            <p style="font-size:11.5px; opacity:0.8; line-height:1.4;">
                API keys are stored directly in your local <strong>Windows Credential Store / DPAPI</strong>.
                Keys are never logged, never saved in plain text, and never sent to Git.
            </p>
        </div>

        <div id="providers-list"></div>
    </div>

    <!-- TAB 3: FALLBACK RULES -->
    <div id="pane-fallback" class="tab-pane">
        <div class="card">
            <div class="card-header">
                <span class="card-title">🛡️ Resilient Fallback Engine</span>
                <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
                    <input type="checkbox" id="fallback-enabled-toggle" onchange="saveFallbackConfig()"> Enable Fallback
                </label>
            </div>
            <p style="font-size:11.5px; opacity:0.8; line-height:1.4; margin-bottom:12px;">
                When enabled, if your primary provider is rate-limited (HTTP 429) or experiencing temporary outages,
                the engine automatically switches to the next priority provider without dropping context.
            </p>

            <div style="margin-bottom:12px;">
                <label style="font-size:11px; font-weight:600; margin-bottom:4px; display:block;">Priority Chain Order</label>
                <select id="fallback-priority-select" onchange="saveFallbackConfig()">
                    <option value="google-gemini,deepseek">1. Google Gemini  →  2. DeepSeek</option>
                    <option value="deepseek,google-gemini">1. DeepSeek  →  2. Google Gemini</option>
                </select>
            </div>

            <div style="margin-bottom:12px;">
                <label style="font-size:11px; font-weight:600; margin-bottom:4px; display:block;">Max Immediate Retries on 429 / 5xx</label>
                <input type="number" id="max-retries-input" min="0" max="5" value="2" onchange="saveFallbackConfig()" style="width:100px;">
            </div>

            <div>
                <label style="font-size:11px; font-weight:600; margin-bottom:4px; display:block;">Circuit Breaker Failure Threshold</label>
                <input type="number" id="circuit-threshold-input" min="1" max="10" value="3" onchange="saveFallbackConfig()" style="width:100px;">
            </div>
        </div>
    </div>

    <!-- TAB 4: USAGE & AUDIT -->
    <div id="pane-usage" class="tab-pane">
        <div class="card">
            <div class="card-header">
                <span class="card-title">📊 Usage Analytics</span>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; text-align:center;">
                <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:4px;">
                    <div style="font-size:18px; font-weight:700;" id="total-tokens-stat">0</div>
                    <div style="font-size:11px; opacity:0.7;">Total Tokens Processed</div>
                </div>
                <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:4px;">
                    <div style="font-size:18px; font-weight:700;" id="total-requests-stat">0</div>
                    <div style="font-size:11px; opacity:0.7;">Total Requests Dispatched</div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <span class="card-title">📜 Audit & Fallback Log</span>
            </div>
            <div id="audit-log-container" style="max-height:220px; overflow-y:auto; font-size:11px; font-family:monospace; line-height:1.4;">
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
            currentRequestId: null
        };

        // Navigation
        function switchTab(tabName) {
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.querySelector(\`[onclick="switchTab('\${tabName}')"]\`).classList.add('active');
            document.getElementById(\`pane-\${tabName}\`).classList.add('active');
        }

        // Initialize Webview
        window.addEventListener('DOMContentLoaded', () => {
            vscode.postMessage({ type: 'INIT_STATE' });
        });

        // Listen for messages from Extension Host
        window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.type) {
                case 'SYNC_STATE':
                    state.providers = msg.providers;
                    state.fallbackConfig = msg.fallbackConfig;
                    state.messages = msg.messages;
                    state.activeProviderId = msg.activeProviderId || state.activeProviderId;
                    state.activeModelId = msg.activeModelId || state.activeModelId;
                    renderModelSelector();
                    renderProviders();
                    renderFallbackConfig();
                    renderMessages();
                    break;

                case 'CONNECTION_TEST_RESULT':
                    showToast(\`\${msg.providerId}: \${msg.result.success ? '✅ Connected (' + msg.result.latencyMs + 'ms)' : '❌ ' + msg.result.errorMessage}\`);
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
                    state.messages.push(msg.message);
                    renderMessages();
                    break;

                case 'STREAM_ERROR':
                    state.currentRequestId = null;
                    document.getElementById('send-btn').style.display = 'block';
                    document.getElementById('abort-btn').style.display = 'none';
                    showToast(\`Error: \${msg.error.userFacingMessage}\`);
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
                if (caps.supportsVision) badges.innerHTML += '<span class="badge badge-blue">Vision</span>';
                if (caps.supportsReasoningContent) badges.innerHTML += '<span class="badge badge-amber">Reasoning</span>';
                if (caps.supportsTools) badges.innerHTML += '<span class="badge badge-green">Tools</span>';
                const ctxK = Math.round(caps.maxContextTokens / 1024);
                badges.innerHTML += \`<span class="badge" style="background:#444;">\${ctxK}k Ctx</span>\`;
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
                        <span class="card-title">\${p.config.name} (\${p.config.id})</span>
                        <span class="badge \${p.isKeyConfigured ? 'badge-green' : 'badge-red'}">
                            \${p.isKeyConfigured ? 'Key Saved' : 'No Key'}
                        </span>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <input type="password" id="key-input-\${p.config.id}" placeholder="\${p.isKeyConfigured ? '•••••••••••••••• (Key Configured)' : 'Enter API Key...'}" style="flex:1;">
                        <button onclick="saveKey('\${p.config.id}')">Save</button>
                        \${p.isKeyConfigured ? \`<button class="danger" onclick="deleteKey('\${p.config.id}')">Delete</button>\` : ''}
                    </div>
                    <div class="btn-group">
                        <button class="secondary" onclick="testConnection('\${p.config.id}')">Ping Connection</button>
                        <button class="secondary" onclick="discoverModels('\${p.config.id}')">Discover Models (\${p.models.length})</button>
                    </div>
                \`;
                container.appendChild(card);
            });
        }

        function renderFallbackConfig() {
            document.getElementById('fallback-enabled-toggle').checked = state.fallbackConfig.enabled;
            document.getElementById('max-retries-input').value = state.fallbackConfig.maxRetriesPerProvider;
            document.getElementById('circuit-threshold-input').value = state.fallbackConfig.circuitBreakerThreshold;
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
                    priorityOrder: priorityStr.split(','),
                    maxRetriesPerProvider: maxRetries,
                    circuitBreakerThreshold: threshold,
                    circuitBreakerCooldownMs: 60000
                }
            });
        }

        function renderMessages() {
            const container = document.getElementById('chat-messages');
            if (state.messages.length === 0) {
                container.innerHTML = '<div style="text-align:center; opacity:0.6; padding:30px 10px;"><p style="font-size:14px; font-weight:600;">Antigravity Multi-AI Hub</p><p style="font-size:12px;">Ready for prompts.</p></div>';
                return;
            }

            container.innerHTML = '';
            state.messages.forEach(m => {
                const bubble = document.createElement('div');
                bubble.className = \`message-bubble \${m.role}\`;

                let headerHtml = '';
                if (m.role === 'assistant') {
                    const fallbackBadge = m.fallbackOccurred
                        ? \`<span class="badge badge-amber">Fell back from \${m.originalProviderId}</span>\`
                        : '';
                    headerHtml = \`
                        <div class="message-meta">
                            <strong>\${m.providerId}</strong> / \${m.modelId} \${fallbackBadge}
                        </div>
                    \`;
                }

                let reasoningHtml = '';
                if (m.reasoningContent) {
                    reasoningHtml = \`
                        <div class="reasoning-box">
                            <div class="reasoning-title">▼ Chain-of-Thought Reasoning</div>
                            <div>\${escapeHtml(m.reasoningContent)}</div>
                        </div>
                    \`;
                }

                bubble.innerHTML = \`\${headerHtml}\${reasoningHtml}<div>\${escapeHtml(m.content)}</div>\`;
                container.appendChild(bubble);
            });

            container.scrollTop = container.scrollHeight;
        }

        function escapeHtml(text) {
            if (!text) return '';
            return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\n/g, '<br>');
        }

        function sendPrompt() {
            const input = document.getElementById('chat-input');
            const prompt = input.value.trim();
            if (!prompt) return;

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
