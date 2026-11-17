# Project Brief: Antigravity Multi-AI Hub

## 1. Project Overview & Identity
- **Project Name**: Antigravity Multi-AI Hub
- **Purpose**: A companion AI coding assistant that runs beside Google Antigravity IDE (Windows editor).
- **Core Concept**: Connect user-provided API keys for multiple AI providers (Google Gemini, DeepSeek, Anthropic Claude, OpenAI, OpenRouter, Ollama, LM Studio, etc.), select models manually, and optionally benefit from automated, resilient fallback when a provider is rate-limited or experiencing outages.
- **Strict Boundary**: Does **NOT** replace, tamper with, or modify Google Antigravity IDE's built-in models, agents, binaries, or configuration files. Operates as an independent companion.

---

## 2. Operating Environment & Constraints
- **Host OS**: Microsoft Windows (NT 10.0.26200 / Windows 11 x64).
- **Target Editor**: Google Antigravity IDE (VS Code-based distribution, v1.107.0, Open VSX gallery).
- **Runtime Environment**: Node.js v24.18.0, npm 11.16.0, Git 2.54.0.
- **Workspace Isolation**: Work strictly confined to the project directory. No modifications to parent directories or IDE installations.
- **Security Baseline**:
  - Zero hardcoded keys or secrets.
  - Zero credential leakage in Git, logs, SQLite, or frontend webview state.
  - API keys stored exclusively in secure credential stores (VS Code `SecretStorage` / Windows DPAPI / Credential Vault).
  - No public network listener (strictly `127.0.0.1` binding).
  - Full origin validation and authenticated local communication.
  - Strict workspace boundaries: prevent path traversal, protect sensitive files (`.env`, private keys).
  - Explicit user approval required for any file modifications, diff applications, or terminal executions.
  - Untrusted model output & project files treated as untrusted (prompt injection defense).

---

## 3. Provider Matrix
### Phase 1 Providers (v1)
1. **Google Gemini API**:
   - Official unified SDK: `@google/genai` (current, active).
   - REST base: `https://generativelanguage.googleapis.com/v1beta/`
   - Authentication: API key via `x-goog-api-key` or Bearer token.
   - Primary Models: `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash`.
2. **DeepSeek API**:
   - Official REST base: `https://api.deepseek.com` (OpenAI-compatible protocol).
   - Endpoint: `POST https://api.deepseek.com/chat/completions`
   - Authentication: Bearer token (`Authorization: Bearer <KEY>`).
   - Primary Models:
     - `deepseek-chat` (DeepSeek-V3): General chat, coding, tool calls, JSON mode, 64k context.
     - `deepseek-reasoner` (DeepSeek-R1): Native chain-of-thought (`reasoning_content`), 64k context, no tool calls, no JSON mode.

### Extensibility Roadmap (Future Adapters)
- Anthropic Claude (Messages API)
- OpenAI (Responses / Chat Completions API)
- OpenRouter (OpenAI-compatible router)
- Ollama (Local model server)
- LM Studio (Local model server)

---

## 4. Architecture Decisions & Boundaries
- **Language**: TypeScript across backend, extension host, and webview UI.
- **Architecture Evaluation**:
  - *Option A*: Separate local gateway process (Node.js HTTP/WebSocket server).
  - *Option B*: Embedded gateway inside the VS Code Extension Host.
  - *Recommendation*: **Hybrid / Extension-Host Embedded Gateway** as primary to avoid port collisions, IPC serialization friction, and external process management on Windows, while preserving a modular adapter interface that can seamlessly run in a standalone daemon if required.
- **UI**: VS Code Webview Panel / Side View built with React, Tailwind/CSS variables supporting native VS Code Light and Dark themes.
- **Configuration & Metadata**:
  - Metadata, model lists, usage metrics: Embedded SQLite (`@vscode/sqlite3` or `sql.js`).
  - Secrets & Credentials: VS Code `ExtensionContext.secrets` (backed by Windows DPAPI/Credential Vault).

---

## 5. Fallback State Machine Rules
- Configurable fallback priority chain.
- Automatic retry on HTTP 429 (Rate Limit) respecting `Retry-After` headers.
- Transient server error retries (HTTP 500, 502, 503, 504) with exponential backoff and jitter.
- Circuit breaker pattern to prevent infinite retry loops.
- Clear non-retryable categorization:
  - HTTP 401/403 (Auth failed) -> Prompt user, do not retry.
  - HTTP 400/422 (Bad Request / Schema error) -> Surface error, do not retry blindly.
  - Insufficient credits -> Inform user, offer alternative funded provider.
- Context preservation within target model's context window limit (truncate or summarize safely).
- **Ambiguous Failure Rule**: If a network request times out or disconnects *after* bytes were transmitted without receiving response headers, treat the request as potentially billable. Do **not** blindly replay non-idempotent completion calls without user confirmation or idempotency keys where supported.

---

## 6. Phased Implementation Roadmap
- **Phase 1: Inspect & Compatibility Verification** (Current)
- **Phase 2: Architectural Design & Specifications** (Current)
- **Phase 3: Local Gateway & Core Pipeline**
- **Phase 4: Provider Configuration & Model Discovery**
- **Phase 5: Chat UI & Model Switching**
- **Phase 6: Resilient Fallback Engine & Error Handling**
- **Phase 7: Workspace Context & File Inspection**
- **Phase 8: File Editing, Diff Review & User Approval Engine**
- **Phase 9: Usage Analytics, Cost Tracking & Budget Guardrails**
- **Phase 10: Multi-Agent Task Coordination & Isolation**
- **Phase 11: Automated Test Suite & Security Auditing**
- **Phase 12: Packaging, Windows Distribution & User Manual**
