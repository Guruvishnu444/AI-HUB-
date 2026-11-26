# Antigravity Multi-AI Hub

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![VS Code API](https://img.shields.io/badge/VS%20Code%20API-%5E1.90-007ACC.svg)](https://code.visualstudio.com/api)
[![Platform](https://img.shields.io/badge/Platform-Windows%2011-informational.svg)](#requirements)
[![Version](https://img.shields.io/badge/version-0.1.0-green.svg)](CHANGELOG.md)

A companion extension for **Google Antigravity IDE** that puts a multi-provider AI chat and coding agent in a side panel. Bring your own API keys, pick any model yourself, and let the built-in fallback engine switch to another provider when one is rate-limited or down.

> **Independent project.** This is a community extension. It is not affiliated with or endorsed by Google, and it does not modify Antigravity's built-in models, agents, or system files. Antigravity has no public API for adding third-party models to its own model dropdown, so the Hub runs as a separate panel beside your editor.

---

## Features

### Multiple providers, your own keys

| Provider | Protocol | Built-in models |
| :--- | :--- | :--- |
| Google Gemini | Native (`v1beta`) | `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-pro` |
| DeepSeek | OpenAI-compatible | `deepseek-chat`, `deepseek-reasoner` |
| OpenAI | OpenAI-compatible | `gpt-4o`, `gpt-4o-mini` |
| Anthropic Claude | Native | `claude-3-5-sonnet-20241022`, `claude-3-7sonnet-20250219` |
| OpenRouter | OpenAI-compatible | Discover models from the provider |
| Groq | OpenAI-compatible | Discover models from the provider |

- **Custom providers:** add any OpenAI-compatible base URL and model ID in the Provider Manager. Local servers such as Ollama or LM Studio expose this kind of endpoint, but they have not been tested with the Hub yet.
- **Provider Manager:** save or delete a key, ping a connection, discover models, enable or disable individual models, clean up unused providers, and purge non-chat models.

### Chat and agent mode

- **Manual model selection:** you choose the provider and model; nothing is routed behind your back except by your fallback rules.
- **Agent mode:** the model can list files, read files, search files, read the active file's context, create files, and propose edits. A run is capped at 20 steps by default.
- **Approval first:** every file creation or edit is shown as a diff and is written to disk only after you click **Approve and Save**. The agent does **not** run shell commands.
- **Folder chats:** each project folder keeps its own chat history. Switch folders from the **Folder Chats** menu and the right history is restored.
- **Stop button:** abort a running prompt at any time.

### Resilient fallback

- Configurable priority order. The default is Gemini, then DeepSeek.
- Automatic retries per provider (default 2) when a request fails with a switchable error such as a rate limit, quota, or high-demand response.
- Circuit breaker: after repeated failures (default 3) a provider is skipped for a cool-down (default 60 seconds), then probed again.
- Daily‑quota failures are told apart from short rate‑limit spikes.
- **Ambiguous failure protection:** if the connection drops after a request was sent, the Hub asks whether to retry with a fallback provider or cancel, so you are not billed twice by surprise.
- Context trimming: history is trimmed to fit the target model's context window when the provider changes. The token count is an estimate (about 4 characters per token).

All fallback settings can be changed in the **Fallback Rules** tab.

### Usage and audit

- Token totals, per‑model usage, latency, and whether a fallback happened.
- An audit log of requests, fallbacks, retries, key changes, and errors.
- Usage data is stored locally (the most recent 500 requests are kept).

### Security

- **API keys** are stored with the editor's `SecretStorage` (the operating system credential store). They are not written to the Hub's state files or to Git.
- **Workspace boundary:** the Hub can only touch files inside the project folder you select. Path traversal (`..\\`) and symlinks or junctions that point outside the folder are denied.
- **Blocked files:** credential and secret files are never read or sent to a provider, for example `.env*`, private keys (`*.pem`, `*.key`, `id_rsa`, `id_ed25519`), `.npmrc`, `.netrc`, `.pypirc`, `.git\\config`, `.git-credentials`, `.aws\\credentials`, `.kube\\config`, `credentials.json`, `secrets.*`, and service‑account files.
- **Sensitive files** (other configuration files) trigger a warning and need your confirmation before they are sent.
- **Webview hardening:** the panel uses a strict Content‑Security‑Policy (`default-src 'none'`) with no remote scripts, styles, or images, and escapes model output before showing it.

---

## Requirements

- Windows 11 (the primary development and test platform; other systems use the standard extension API but are untested).
- Google Antigravity IDE, or another editor that supports VS Code extensions (`engines.vscode` is `^1.90.0`).
- An API key for at least one provider.
- To build from source: Node.js 18 or newer (developed on Node 24) and npm.

---

## Install

### From a `.vsix` file

1. Get `antigravity-multi-ai-hub-0.1.0.vsix` from the project's Releases page, or [build it yourself](#build-from-source).
2. In Antigravity, open the **Extensions** panel.
3. Click the **`...`** menu at the top of the panel and choose **Install from VSIX...**.
4. Select the `.vsix` file and reload the window if you are asked to.

### Build from source

```powershell
git clone https://github.com/Guruvishnu444/AI-HUB-
cd AI-HUB-
npm ci
npm run build:vsix
```

This creates `antigravity-multi-ai-hub-0.1.0.vsix` in the project folder. Install it as described above.

---

## Quick start

1. Click the **Multi‑AI Hub** icon in the Activity Bar (or run **Multi‑AI Hub: Open Full Panel Beside Editor** from the Command Palette).
2. Open the **Provider Manager** tab, paste an API key for a provider, and click **Save Key**.
3. Click **Ping Connection** to test the key, then **Discover Models** if the provider supports it.
4. Open **Workspace and Files** and click **Choose Project Folder** to select the project the Hub may work in.
5. Go to **Chat and Routing**, choose a model, and type your prompt. Turn on agent mode and click **Run Agent** to let the model read and propose changes to your files.
6. Review each proposed change in the diff and click **Approve and Save** or **Reject**.
7. Open **Fallback Rules** to set the provider priority, retries, and circuit‑breaker threshold.

---

## Commands

Open the Command Palette (`Ctrl+Shift+P`) and search for **Multi‑AI Hub**.

| Command | What it does |
| :--- | :--- |
| `Open Full Panel Beside Editor` | Opens the Hub as a full panel next to your code |
| `Self‑Diagnostic Health Check` | Checks that the extension's components are working |
| `Select Project Workspace Folder` | Chooses the folder the Hub is allowed to access |

---

## How it works

```
Webview panel (chat, providers, workspace, fallback, usage)
        |   messages
        v
Message router (src/core/gateway/router.ts)
        |
        +--> Agent loop + tool executor ---> Workspace guardrails, diff engine, file tree
        |
        v
Fallback engine (retries, circuit breaker, context trimmer)
        |
        v
Provider adapters: Gemini | DeepSeek | Anthropic | OpenAI‑compatible
        |
        v
Your chosen provider's API
```

Provider settings, models, and chat history are stored as JSON files (`hub_state.json`, `hub_usage.json`, and per‑folder chat files) in the extension's global storage folder. Keys live only in `SecretStorage`.

For the design, threat model, and fallback state machine, see [`docs/02-architecture.md`](docs/02-architecture.md).

---

## Project structure

```
.
├── src/
│   ├── extension.ts            # Entry point: registers views and commands
│   ├── core/
│   │   ├── adapters/           # gemini, deepseek, anthropic, openaiCompatible, registry
│   │   ├── agents/             # agentLoop, toolExecutor
│   │   ├── fallback/           # engine, circuitBreaker, contextTrimmer
│   │   ├── gateway/            # router (webview <-> extension messages)
│   │   ├── storage/            # database (JSON state), secretVault (API keys)
│   │   └── types/              # chat, errors, ipc, model, provider
│   ├── webview/ui.ts           # The panel's HTML, CSS, and client script
│   └── workspace/              # diffEngine, fileTree, guardrails
├── scripts/                    # build.js, test_all.js, test_resilience.js
├── docs/                       # Compatibility report and architecture
├── resources/                  # Activity Bar icon
├── spike/                      # Phase 1 compatibility prototype (not shipped)
├── PROJECT_BRIEF.md            # Original project requirements
├── CHANGELOG.md
└── LICENSE
```

---

## Development

| Command | Purpose |
| :--- | :--- |
| `npm ci` | Install dependencies |
| `npm run compile` | Bundle the extension to `out/extension.js` |
| `npm run watch` | Rebuild on every change |
| `npm run typecheck` | Type‑check with `tsc --noEmit` |
| `npm test` | Run the automated test suite |
| `npm run build:vsix` | Package the extension as a `.vsix` |

---

## Data and privacy

- Your prompts, and any file contents you attach or the agent reads, are sent to the provider you selected. Use only providers you trust with that code.
- The extension contacts only the provider endpoints you configure (and opens links in your browser when you click them). It contains no telemetry or analytics code.
- You are responsible for each provider's terms of service and for any API charges.

---

## Known limitations

- Early release (v0.1.0), tested mainly on Windows 11.
- The agent cannot run terminal commands.
- Token counts and context trimming use an estimate, not each provider's real tokenizer.
- The panel's scripts are inline, so the Content‑Security‑Policy still allows inline scripts. It blocks all remote resources.
- Local model servers (Ollama, LM Studio) are untested.

---

## Screenshots

![Screenshot 1](file:///C:/Users/guruv/.gemini/antigravity/brain/cf9d190a-aa3c-48ac-8bef-73390b9cb64c/.user_uploaded/media_1795499255996_a0f80e69.png)
![Screenshot 2](file:///C:/Users/guruv/.gemini/antigravity/brain/cf9d190a-aa3c-48ac-8bef-73390b9cb64c/.user_uploaded/media_1795498095927_10304e0f.png)
![Screenshot 3](file:///C:/Users/guruv/.gemini/antigravity/brain/cf9d190a-aa3c-48ac-8bef-73390b9cb64c/.user_uploaded/media_1795444823255_824a50a8.png)
