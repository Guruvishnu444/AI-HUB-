# 02 — System Architecture & Design Specification

**Project**: Antigravity Multi-AI Hub  
**Date**: November 17, 2026  
**Status**: Architecture Design (Phase 2)  
**Authors**: Senior Architecture & Security Engineering Team  

---

## 1. Architectural Strategy & Evaluation

### 1.1 The Gateway Decision: Separate Process vs. In-Extension Host

A central architectural decision is whether the AI Gateway should run as:
- **Option A**: A standalone local background process (Node.js daemon bound to `127.0.0.1` using Fastify/Express).
- **Option B**: An in-process service embedded directly within the VS Code Extension Host.

#### Comprehensive Trade-Off Comparison

| Evaluation Dimension | Option A: Standalone Gateway Process | Option B: In-Extension Host Gateway |
| :--- | :--- | :--- |
| **Process Lifecycle & Management** | High complexity. Extension must spawn, monitor, health-check, restart, and cleanly terminate a child Node process on Windows. Orphaned background processes can linger on editor crashes. | **Zero overhead.** Lifecycle is 100% bound to the VS Code Extension Host. Shuts down automatically when the window or IDE closes. |
| **Network & Port Management** | Risk of port collisions (e.g. port `4040` in use), firewall alerts on Windows, requires dynamic port discovery, IPC handshake, and local loopback token authentication. | **Zero networking friction.** Internal calls use direct TypeScript in-memory interfaces; Webview communicates via standard, secure `vscode.postMessage` IPC. |
| **Attack Surface & Exposure** | Opens a local TCP socket (`127.0.0.1`). Requires strict CORS, Origin checks (`vscode-webview://`), CSRF tokens, and DNS rebinding protections to prevent malicious local processes from abusing API keys. | **Minimal attack surface.** No open TCP ports or listening sockets on the host OS. Zero risk of local port hijacking, DNS rebinding, or unauthorized local socket probing. |
| **Credential Storage Integration** | Requires external native modules like `@napi-rs/keyring` or inter-process IPC to request secrets from the extension. | **Direct native access.** Direct access to `context.secrets` (`SecretStorage`), backed by Electron's native Windows DPAPI integration with zero external libraries. |
| **SQLite Integration & ABI Stability** | Runs standard Node.js (`v24.18.0`), allowing native compilation (`better-sqlite3`). | Runs inside Electron runtime (`Node 22.x`); requires Node-API compatible SQLite (`@vscode/sqlite3`) or pure WebAssembly (`sql.js`). |
| **Heavy Computation / Streaming** | Isolates CPU-intensive stream parsing and tool executions from the editor UI thread. | Extension host is already a separate dedicated Node process from the UI renderer. Streaming JSON/SSE chunks in Node is lightweight and non-blocking. |

#### Architectural Recommendation: Embedded Gateway with Decoupled Core

**Decision**: **Implement Option B (In-Extension Host Gateway) as the primary execution engine**, while maintaining a strictly decoupled, protocol-agnostic core pipeline.
- The core router, fallback engine, and provider adapters will be designed as independent TypeScript library modules (`@hub/core`).
- In the primary configuration, the extension host instantiates the core pipeline directly in-memory, routing messages from the React Webview via `vscode.postMessage`.
- Should an external CLI, background automation daemon, or external tool require HTTP access in later phases, the exact same core pipeline can be instantiated inside a standalone Fastify server listening on `127.0.0.1` with zero refactoring of adapters or fallback logic.

---

## 2. System Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                            GOOGLE ANTIGRAVITY IDE                                 |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                     Webview Panel (React UI / HTML5)                         |  |
|  |  - Model Selector (Provider, Model, Connection, Verified Capabilities)      |  |
|  |  - Provider Manager (Add/Edit/Remove, Test Connection, Custom Model IDs)    |  |
|  |  - Fallback Settings & Circuit Breaker Dashboard                            |  |
|  |  - Chat Stream Canvas & Model Indicator                                     |  |
|  |  - Workspace File Picker & Diff Approval Modal                              |  |
|  +-----------------------------------------------------------------------------+  |
|                                       |                                           |
|                  Bidirectional Typed IPC (vscode.postMessage)                     |
|                                       v                                           |
|  +-----------------------------------------------------------------------------+  |
|  |                  VS Code Extension Host (TypeScript Runtime)                 |  |
|  |                                                                             |  |
|  |  +-----------------------------------------------------------------------+  |  |
|  |  |                         Gateway Controller                            |  |  |
|  |  |  - Request Validation (Zod schemas)                                   |  |  |
|  |  |  - Stream Coordinator & Context Trimmer                               |  |  |
|  |  +-----------------------------------------------------------------------+  |  |
|  |                                    |                                        |  |
|  |  +---------------------------------+-------------------------------------+  |  |
|  |  |                                                                       |  |  |
|  |  v                                                                       v  |  |
|  | +-----------------------+                           +--------------------+  |  |
|  | | Fallback Engine       |                           | Storage Services   |  |  |
|  | | - Priority Chain      |                           | - context.secrets  |  |  |
|  | | - Circuit Breaker     |                           |   (Windows DPAPI)  |  |  |
|  | | - 429 Retry-After     |                           | - SQLite DB        |  |  |
|  | | - Ambiguous Failure   |                           |   (@vscode/sqlite3)|  |  |
|  | +-----------------------+                           +--------------------+  |  |
|  |            |                                                                |  |
|  |            v                                                                |  |
|  |  +-----------------------------------------------------------------------+  |  |
|  |  |                       Provider Adapter Registry                       |  |  |
|  |  |                                                                       |  |  |
|  |  |   +--------------------------+       +----------------------------+   |  |  |
|  |  |   |   GeminiAdapter (v1)     |       |    DeepSeekAdapter (v1)    |   |  |  |
|  |  |   |   - SDK: @google/genai   |       |    - Protocol: OpenAI REST |   |  |  |
|  |  |   |   - Multimodal / 1M+ Ctx |       |    - reasoning_content CoT |   |  |  |
|  |  +---|--------------------------|-------|----------------------------|---+  |  |
|  +------|--------------------------|-------|----------------------------|------+  |
+---------|--------------------------|-------|----------------------------|---------+
          | (HTTPS Outbound)         |       | (HTTPS Outbound)           |
          v                          v       v                            v
   +--------------+           +--------------+                     +--------------+
   |  Google AI   |           |   DeepSeek   |                     | Anthropic /  |
   |  Gemini API  |           |   Platform   |                     | OpenAI / etc |
   +--------------+           +--------------+                     +--------------+
```

---

## 3. Project Directory Structure

```
antigravity-multi-ai-hub/
├── .gitignore                      # Environment, secret, log, and node_modules exclusions
├── PROJECT_BRIEF.md                # Permanent reference of project vision & constraints
├── README.md                       # Project overview, installation, and usage instructions
├── CHANGELOG.md                    # Release history and audit log
├── package.json                    # Extension manifest & workspace script orchestration
├── tsconfig.json                   # Root TypeScript compiler configuration
├── docs/                           # Architectural and verification specifications
│   ├── 01-compatibility-report.md # Environment audit and verified findings
│   └── 02-architecture.md         # Comprehensive architecture and security specification
├── spike/                          # Phase 1 runtime verification probe
│   ├── package.json
│   ├── tsconfig.json
│   ├── README.md
│   └── src/
│       └── extension.ts            # Tests webview, secret storage, fs access, version
├── src/
│   ├── extension.ts                # Main extension activation, commands, panel lifecycle
│   ├── core/                       # Decoupled gateway logic & routing engine
│   │   ├── types/                  # Unified domain interfaces and Zod schemas
│   │   │   ├── provider.ts         # IProviderAdapter and capabilities
│   │   │   ├── model.ts            # ModelMetadata and parameter specifications
│   │   │   ├── chat.ts             # Messages, stream chunks, tokens
│   │   │   └── errors.ts           # Standardized, user-friendly error taxonomy
│   │   ├── gateway/                # Router, request validator, and dispatcher
│   │   │   ├── router.ts           # Request dispatch and session orchestrator
│   │   │   └── validator.ts        # Input sanitization and payload validation
│   │   ├── fallback/               # Resilient fallback state machine
│   │   │   ├── engine.ts           # Fallback orchestrator and step execution
│   │   │   ├── circuitBreaker.ts   # Error threshold monitor and cool-down timer
│   │   │   └── contextTrimmer.ts   # Context window preservation & token budgeting
│   │   ├── adapters/               # Native provider protocol implementations
│   │   │   ├── base.ts             # Abstract provider adapter with standard hooks
│   │   │   ├── gemini.ts           # Google Gemini native adapter (@google/genai)
│   │   │   ├── deepseek.ts         # DeepSeek OpenAI-compatible adapter
│   │   │   └── registry.ts         # Dynamic adapter catalog and factory
│   │   └── storage/                # Configuration and metadata persistence
│   │       ├── secretVault.ts      # Abstraction over vscode.SecretStorage
│   │       ├── database.ts         # SQLite metadata initialization (@vscode/sqlite3)
│   │       └── schema.sql          # Tables: providers, models, usage_metrics, audit_log
│   ├── workspace/                  # Phase 7 & 8: Safe file and diff engine
│   │   ├── guardrails.ts           # Path traversal protection & sensitive file filter
│   │   ├── fileTree.ts             # Confined workspace directory explorer
│   │   └── diffEngine.ts           # Unified diff generation and user approval hooks
│   └── webview/                    # React frontend application
│       ├── index.html              # Webview root host
│       ├── src/
│       │   ├── App.tsx             # Root layout & view controller
│       │   ├── components/         # Modular UI elements
│       │   │   ├── ModelSelector.tsx
│       │   │   ├── ProviderManager.tsx
│       │   │   ├── FallbackConfig.tsx
│       │   │   ├── ChatCanvas.tsx
│       │   │   ├── DiffModal.tsx
│       │   │   └── ErrorBanner.tsx
│       │   ├── hooks/              # State & VS Code IPC messaging hooks
│       │   │   └── useExtensionIPC.ts
│       │   └── styles/             # VS Code native theme CSS mappings
└── tests/                          # Automated unit and integration test suite
    ├── mocks/                      # Recorded/mocked provider HTTP fixtures
    ├── adapters/                   # Protocol transformation tests
    ├── fallback/                   # Fallback state machine & retry tests
    └── security/                   # Path traversal and injection defense tests
```

---

## 4. Provider Adapter Interface Definition

Every provider communicates through a strictly typed, native adapter interface. Adapters do not assume shared features or leak provider-specific anomalies into the core router.

```typescript
/**
 * Verified model capabilities matrix.
 * No capability is asserted unless explicitly verified against official provider specs.
 */
export interface ProviderCapabilities {
    supportsStreaming: boolean;
    supportsVision: boolean;
    supportsTools: boolean;
    supportsJsonMode: boolean;
    supportsReasoningContent: boolean; // e.g. DeepSeek-R1 / Gemini thinking
    maxContextTokens: number;
    maxOutputTokens: number;
}

export interface ModelMetadata {
    id: string;                      // Wire model identifier (e.g. "gemini-2.5-flash", "deepseek-reasoner")
    displayName: string;             // Human-readable title
    providerId: string;              // Owning provider key (e.g. "google", "deepseek")
    capabilities: ProviderCapabilities;
    isCustom: boolean;               // User-added custom model identifier
    isEnabled: boolean;
    defaultTemperature?: number;
    defaultTopP?: number;
}

export interface ProviderConfig {
    id: string;                      // Unique provider instance ID
    name: string;                    // e.g. "Google Gemini", "DeepSeek Official"
    protocol: 'google-native' | 'openai-compatible' | 'anthropic-native' | 'ollama-native';
    baseUrl?: string;                // Customizable base endpoint URL
    isEnabled: boolean;
    timeoutMs: number;               // Request timeout limit (default: 30,000ms)
    maxRetries: number;              // Max immediate retries for 429/503 (default: 2)
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    reasoningContent?: string;       // Preserved Chain-of-Thought for deepseek-reasoner
    attachments?: Array<{
        mimeType: string;
        dataBase64: string;
    }>;
}

export interface ChatCompletionRequest {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    stream?: boolean;
    stopSequences?: string[];
    requestId: string;
}

export interface StreamChunk {
    deltaContent: string;
    deltaReasoning?: string;         // Emitted for reasoning models
    isComplete: boolean;
    finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface ChatCompletionResponse {
    content: string;
    reasoningContent?: string;
    finishReason: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

/**
 * Universal Provider Adapter Interface.
 * Concrete adapters (GeminiAdapter, DeepSeekAdapter) implement this contract.
 */
export interface IProviderAdapter {
    readonly providerId: string;
    readonly config: ProviderConfig;

    /**
     * Authenticate and verify network reachability using the stored credential.
     */
    testConnection(apiKey: string): Promise<{ success: boolean; latencyMs: number; errorMessage?: string }>;

    /**
     * Query remote provider catalog for available models.
     */
    discoverModels(apiKey: string): Promise<ModelMetadata[]>;

    /**
     * Execute a non-streaming completion request.
     */
    sendChatCompletion(
        apiKey: string,
        request: ChatCompletionRequest,
        abortSignal: AbortSignal
    ): Promise<ChatCompletionResponse>;

    /**
     * Execute a streaming completion request, emitting chunks over an async generator.
     */
    streamChatCompletion(
        apiKey: string,
        request: ChatCompletionRequest,
        abortSignal: AbortSignal
    ): AsyncIterable<StreamChunk>;
}
```

---

## 5. Fallback State Machine & Ambiguous Failure Rule

### 5.1 Fallback State Machine

```
     [User Submits Prompt]
               |
               v
     +-------------------+
     | PRIMARY_SELECTED  |<----------------------------------+
     +-------------------+                                  |
               |                                            |
               v                                            |
     +-------------------+                                  |
     | CHECK_CIRCUIT     |---(Circuit OPEN)---> [Prompt User / Trip]
     +-------------------+                                  |
               | (Circuit CLOSED / HALF-OPEN)               |
               v                                            |
     +-------------------+                                  |
     | DISPATCH_REQUEST  |                                  |
     +-------------------+                                  |
        /      |       \                                    |
(Success)  (429/5xx)   (401/403/400)                        |
      /        |         \                                  |
     v         |          v                                 |
[COMPLETE]     |     [FATAL_NON_RETRYABLE]                  |
               |      - Explain reason to user              |
               |      - Offer alternative funded provider   |
               |      - HALT (No silent retry)              |
               v                                            |
      +------------------+                                  |
      | RETRY_EVALUATION |                                  |
      +------------------+                                  |
         /             \                                    |
(Within limit)     (Exhausted)                              |
       /                 \                                  |
      v                   v                                 |
[SLEEP & RETRY]    +--------------------+                   |
- Respect          | FALLBACK_EVALUATION|                   |
  Retry-After      +--------------------+                   |
- Exp. Backoff         /            \                       |
- Jitter       (Fallback ON)     (Fallback OFF)             |
                     /                \                     |
                    v                  v                    |
          +--------------------+  [HALT & NOTIFY]           |
          | SWITCH_NEXT_MODEL  |  - Display provider error  |
          +--------------------+                            |
                    |                                       |
                    |-- Truncate context to target window   |
                    |-- Record fallback event in audit log  |
                    +---------------------------------------+
```

### 5.2 Error Classification Taxonomy

1. **Retryable Errors**:
   - **HTTP 429 (Too Many Requests)**: Read `Retry-After` header. If <= 10 seconds, pause and retry primary provider up to `maxRetries` times. If > 10 seconds or retries exhausted, trigger fallback.
   - **HTTP 500, 502, 503, 504 (Server Outage / Bad Gateway)**: Apply exponential backoff ($T = \text{base} \times 2^{\text{attempt}} + \text{jitter}$), retry up to 2 times, then fallback.
   - **TCP Connection Reset / DNS Temporary Resolution Failure**: Fall back immediately.
2. **Non-Retryable Errors (Must NOT Fall Back Silently)**:
   - **HTTP 401 / 403 (Authentication & Authorization Failure)**: Invalid key or unauthorized scope. Explain cleanly: *"Authentication failed for provider X. Please verify your API key."*
   - **HTTP 400 / 422 (Bad Request / Schema Rejection)**: Malformed payload or unsupported parameter. Never retry blindly.
   - **Insufficient Balance / Quota Expired**: Provider account out of credit. Notify user clearly: *"Provider X reports insufficient credit balance. Would you like to switch to Provider Y?"*

### 5.3 Circuit Breaker Design
- **States**: `CLOSED` (Normal operation), `OPEN` (Tripped; traffic blocked), `HALF_OPEN` (Probe trial).
- **Threshold**: 3 consecutive fatal failures (rate limit exhaustion or 5xx) trips the breaker to `OPEN`.
- **Cool-Down Period**: 60 seconds.
- **Probe**: In `HALF_OPEN`, a single test completion is dispatched. If successful, resets to `CLOSED`; if failed, resets cool-down timer.

### 5.4 The Ambiguous Failure Rule (Double-Billing Defense)
> **Problem Definition**: When a client sends an HTTP POST completion request and the socket times out or terminates *after* request headers and body have been flushed to the network, but *before* receiving response headers, the provider may have already generated tokens and billed the account. Blindly retrying on another provider causes duplicate financial charges and disjointed conversational state.

**Architectural Rule**:
1. **Differentiate Disconnect Stages**:
   - *Pre-transmission failure* (TCP connect timeout, DNS failure): 100% safe to retry or fall back immediately; no bytes were consumed by the remote server.
   - *Post-transmission failure* (Socket drop or timeout after write completion): Labeled **Ambiguous Billable State**.
2. **Ambiguous State Action Protocol**:
   - The engine **HALTS** automatic fallback for this specific turn.
   - A distinct warning is presented to the user:
     > *"⚠️ Connection dropped after request was transmitted to [Provider Name]. The model may have processed this request and incurred API charges. Would you like to (1) Resend with fallback, or (2) Cancel and check usage dashboard?"*
   - Never charge user credits twice without explicit intent confirmation.

---

## 6. Security Architecture & Threat Model

### 6.1 STRIDE Threat Analysis

| Threat Category | Identified Attack Vector | Architectural Mitigation & Control |
| :--- | :--- | :--- |
| **Spoofing** | Rogue extension or local malware impersonating user or gateway. | Embedded gateway architecture eliminates network listeners. Webview IPC validated against VS Code origin and extension-generated nonces. |
| **Tampering** | Modifying SQLite usage records or altering model system instructions. | Database stored in protected user app data directory. Integrity checked via schema validation. No external write access permitted. |
| **Repudiation** | Ambiguous API spend disputes or unexplained file modifications. | Local append-only audit log records every tool call, provider dispatch, fallback transition, and diff approval with exact timestamps and model IDs. |
| **Information Disclosure** | API keys leaked in git commits, error stack traces, SQLite, or frontend webview state. | API keys stored strictly in `context.secrets` (Windows DPAPI). Zero secrets stored in SQLite or logs. Sensitive regex sanitizers scrub keys from all outbound errors and logs. |
| **Denial of Service** | Infinite fallback loops consuming entire account credit balance; memory exhaustion. | Strict circuit breaker, maximum fallback hop limit ($N \le 3$), and token context budgeting. |
| **Elevation of Privilege** | Path traversal escaping workspace folder; arbitrary command execution. | Strict workspace root containment (`path.resolve` check against workspace boundary). No terminal command execution without explicit user approval dialog. |

### 6.2 Key & Secret Storage Hygiene
- Keys never cross the boundary into Webview DOM, React state, or HTML storage (`localStorage` / `sessionStorage`).
- Webview only receives boolean flags: `{ providerId: "deepseek", isKeyConfigured: true }`.
- When an API call is made, the Extension Host fetches the secret from `context.secrets` immediately before dispatch, passes it via encrypted TLS headers, and eliminates the reference.
- Error handlers sanitize strings through an automated scrubber:
  ```typescript
  export function sanitizeError(message: string, keys: string[]): string {
      let scrubbed = message;
      for (const key of keys) {
          if (key && key.length > 5) {
              scrubbed = scrubbed.split(key).join('[REDACTED_API_KEY]');
          }
      }
      return scrubbed;
  }
  ```

### 6.3 Prompt Injection Defense & Untrusted Boundaries
- All workspace files read by the extension are treated as **Untrusted Data**.
- Model responses are treated as **Untrusted Data**.
- System prompts are isolated using clear delimiter enclosures (e.g. `<user_code>`, `<instructions>`) to prevent user code files from overriding tool authorization policies.

---

## 7. Required Dependencies & Verified Licenses

Every dependency proposed below has been verified against official package registries for licensing, security status, and runtime compatibility.

| Package | Version Target | License | Maintenance Status | Justification / Role |
| :--- | :--- | :--- | :--- | :--- |
| **`@google/genai`** | `^0.1.1` | **Apache-2.0** | Active (Google Official) | Official unified SDK for Gemini API (replaces deprecated `@google/generative-ai`). |
| **`openai`** | `^4.80.0` | **Apache-2.0** | Active (OpenAI Official) | Industry-standard SDK for DeepSeek and all OpenAI-compatible endpoints. |
| **`@vscode/sqlite3`** | `^5.1.8` | **BSD-3-Clause** | Active (Microsoft Official) | Node-API built SQLite for stable ABI compatibility inside VS Code Electron. |
| **`zod`** | `^3.24.0` | **MIT** | Active | Runtime schema validation for request payloads, configurations, and IPC messages. |
| **`react`** | `^18.3.1` | **MIT** | Active | Declarative UI components inside the Webview panel. |
| **`react-dom`** | `^18.3.1` | **MIT** | Active | React renderer for Webview HTML DOM. |
| **`lucide-react`** | `^0.460.0` | **ISC** | Active | Lightweight, clean UI icons matching VS Code styling. |
| **`@types/vscode`** | `^1.90.0` | **MIT** | Active | TypeScript typing definitions for VS Code extension host. |
| **`typescript`** | `^5.4.5` | **Apache-2.0** | Active | Type safety and build compiler across the entire codebase. |
| **`esbuild`** | `^0.24.0` | **MIT** | Active | Blazing fast extension and webview bundler. |

*Note: No deprecated libraries (such as `keytar` or `@google/generative-ai`) are permitted in the dependency tree.*

---

## 8. Development Roadmap: All 12 Phases

```
Phase 1: Environment Inspection & Spike Validation  [CURRENT - COMPLETED DESIGN]
Phase 2: Architectural & Security Blueprint         [CURRENT - COMPLETED DESIGN]
Phase 3: Core Gateway & IPC Dispatcher
Phase 4: Provider Configuration & Model Discovery
Phase 5: React Chat UI & Manual Model Switching
Phase 6: Resilient Fallback Engine & Circuit Breaker
Phase 7: Workspace Context & File Boundary Protection
Phase 8: File Modification, Diff Preview & Approval Engine
Phase 9: Usage Analytics, Token Tracking & Spending Limits
Phase 10: Multi-Agent Task Isolation & Coordination
Phase 11: Automated Test Suite & Security Audit
Phase 12: Windows Packaging (VSIX), Diagnostics & User Manual
```

### Milestone Specifications

- **Phase 3: Core Gateway & IPC Dispatcher**:
  - Implement bidirectional typed IPC between Extension Host and Webview.
  - Establish `SecretVault` over `context.secrets`.
  - Initialize SQLite database using `@vscode/sqlite3` for configuration and metadata.
- **Phase 4: Provider Configuration & Model Discovery**:
  - Build `GeminiAdapter` (`@google/genai`) and `DeepSeekAdapter` (`openai` REST).
  - Implement dynamic model discovery and manual custom model additions.
  - Implement connection test probes with latency benchmarks.
- **Phase 5: React Chat UI & Manual Model Switching**:
  - Build responsive React webview panel matching VS Code light/dark theme variables.
  - Model selector displaying verified capabilities (vision, tools, reasoning, context).
  - Multi-turn conversation rendering with markdown, code syntax highlighting, and SSE streaming.
- **Phase 6: Resilient Fallback Engine & Circuit Breaker**:
  - Implement fallback priority queue.
  - Add 429 `Retry-After` parser and exponential backoff retryer.
  - Implement 3-state circuit breaker and ambiguous failure protection prompt.
- **Phase 7: Workspace Context & File Boundary Protection**:
  - Workspace directory tree browser with path traversal sandbox validation.
  - Sensitive file blocker (`.env*`, private keys, certificates).
  - Token context trimmer preserving target model limits.
- **Phase 8: File Modification, Diff Preview & Approval Engine**:
  - Unified diff generator for proposed code modifications.
  - Interactive side-by-side diff preview in editor canvas.
  - Explicit user approval modal before any disk write.
- **Phase 9: Usage Analytics, Token Tracking & Spending Limits**:
  - Local SQLite tracking of input/output token counts per provider/model.
  - Cost estimator with clear disclaimer separating estimates from official billing.
  - Configurable daily/monthly spending ceiling alerts.
- **Phase 10: Multi-Agent Task Isolation & Coordination**:
  - Isolated subagent contexts for parallel coding tasks.
  - Git branch/worktree isolation to prevent concurrent write collisions.
- **Phase 11: Automated Test Suite & Security Audit**:
  - Unit tests for adapters using mocked HTTP response fixtures.
  - Fallback engine simulations (rate limit spikes, network disconnects).
  - Path traversal and prompt injection vulnerability fuzzing.
- **Phase 12: Windows Packaging (VSIX), Diagnostics & User Manual**:
  - Package clean `.vsix` bundle via `@vscode/vsce`.
  - Add self-diagnostic troubleshooting command (`Antigravity Hub: Check Health`).
  - Author comprehensive Windows installation guide and user manual.

---

## 9. Antigravity IDE: Supported vs. Unsupported Boundaries

| Feature / Capability | Supported Inside Antigravity IDE? | Operational Mechanism / Safe Alternative |
| :--- | :--- | :--- |
| **VSIX Extension Installation** | **YES [VERIFIED]** | CLI command `antigravity-ide.cmd --install-extension <path>` or Open VSX. |
| **Dedicated Side Panel / Webview** | **YES [VERIFIED]** | `vscode.window.createWebviewPanel` / `WebviewViewProvider`. |
| **Secure Credential Storage** | **YES [VERIFIED]** | `vscode.ExtensionContext.secrets` (delegates to Windows DPAPI). |
| **Workspace File Access** | **YES [VERIFIED]** | `vscode.workspace.fs` with workspace boundary containment. |
| **Inject into IDE's Built-in Model Selector** | **NO [VERIFIED]** | **Prohibited & Unsupported**. Antigravity's internal model selector is private. The Hub provides its own rich, dedicated model selector inside its companion panel. |
| **Silent Overwrite of Workspace Files** | **NO [BY DESIGN]** | Blocked by architecture. Requires explicit diff preview and user approval. |
| **Arbitrary Background Port Listening** | **AVOIDED [BY DESIGN]**| In-extension host gateway eliminates open TCP ports, guaranteeing maximum host security. |
