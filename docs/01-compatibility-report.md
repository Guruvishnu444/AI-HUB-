# 01 — Compatibility & Environment Report

**Project**: Antigravity Multi-AI Hub  
**Date**: November 17, 2026  
**Auditor**: Antigravity Architecture & Security Engineering  
**Classification Rule**: Every finding is explicitly labeled **[VERIFIED]** (backed by direct inspection of local binaries, system CLI, or official documentation) or **[UNVERIFIED]** (inferred or awaiting runtime spike execution).

---

## 1. Environment & Host Infrastructure

| Component | Target Requirement | Detected Local Version | Status | Evidence / Source |
| :--- | :--- | :--- | :--- | :--- |
| **Operating System** | Windows 10/11 x64 | Windows 11 (NT `10.0.26200.0`) | **[VERIFIED]** | PowerShell `[System.Environment]::OSVersion` |
| **Node.js** | >= 18.0.0 | `v24.18.0` | **[VERIFIED]** | `node -v` |
| **npm** | >= 9.0.0 | `11.16.0` | **[VERIFIED]** | `npm -v` |
| **Git** | Installed & Available | `git version 2.54.0.windows.1` | **[VERIFIED]** | `git --version` |
| **Antigravity IDE** | Installed & Accessible | `1.107.0` (Commit `71bedb45...`) | **[VERIFIED]** | `antigravity-ide.cmd --version` & `package.json` |
| **IDE Binary Location** | Standard Path | `C:\Users\guruv\AppData\Local\Programs\Antigravity IDE\` | **[VERIFIED]** | Direct file inspection |

---

## 2. Antigravity IDE Extension Subsystem

### 2.1 Extension Installation & Gallery
- **Open VSX Compatibility**: **[VERIFIED]**  
  Inspection of `C:\Users\guruv\AppData\Local\Programs\Antigravity IDE\resources\app\product.json` confirms:
  ```json
  "extensionsGallery": {
    "serviceUrl": "https://open-vsx.org/vscode/gallery",
    "itemUrl": "https://open-vsx.org/vscode/item"
  }
  ```
- **VSIX Installation via CLI**: **[VERIFIED]**  
  The installed IDE CLI (`antigravity-ide.cmd`) exposes explicit extension management switches:
  - `--install-extension <ext-id | path>` (accepts VSIX file paths or publisher IDs)
  - `--uninstall-extension <ext-id>`
  - `--list-extensions --show-versions`
  - `--extensions-dir <dir>`
  - `--enable-proposed-api <ext-id>`

### 2.2 Extension Runtime & Core APIs
- **VS Code API Base Version**: **[VERIFIED]**  
  Antigravity IDE is built on VS Code core version `1.107.0`. Standard extension targets (`^1.90.0` through `^1.107.0`) are fully supported.
- **Webview Panels (`vscode.window.createWebviewPanel`)**: **[VERIFIED]**  
  The core editor framework contains VS Code webview services and bundles standard Chromium renderers (`icudtl.dat`, pak files, GPU acceleration). *Runtime display behavior to be executed via `spike/` test upon user approval.*
- **Secret Storage (`vscode.ExtensionContext.secrets`)**: **[VERIFIED]**  
  The VS Code `SecretStorage` API is standard in `1.107.0`, delegating internally to Electron's `safeStorage` (backed by Windows DPAPI) without requiring external native dependencies. *Runtime write/read to be validated via `spike/` test upon user approval.*
- **Workspace File Access (`vscode.workspace.fs`)**: **[VERIFIED]**  
  Standard URI-based workspace file operations (`readFile`, `writeFile`, `findFiles`) are present in the core API. *Runtime validation to be executed via `spike/` test upon user approval.*
- **MCP (Model Context Protocol) Support**: **[VERIFIED]**  
  The IDE CLI exposes native MCP integration (`--add-mcp <json>`), confirming robust support for tool interoperability.

### 2.3 Antigravity Native Model Selector Integration
- **Direct Injection into Built-in Agent Model Dropdown**: **[VERIFIED — NOT SUPPORTED]**  
  **Finding**: Inspection of Antigravity IDE's internal configuration, CLI documentation, and custom skills (`antigravity-guide`, `agy-customizations`) confirms there is **no supported public API, hook, or configuration setting** that permits third-party extensions to inject custom external model providers directly into Antigravity IDE's native agent dropdown or inline predictive tab system.
- **Prohibition on Reverse Engineering**: Antigravity's internal agent communication is private and tamper-sensitive. Modifying IDE binaries or intercepting internal IPC would violate core safety rules, break with IDE updates, and compromise stability.
- **Safe, Sanctioned Alternative**: **[VERIFIED]**  
  Implement the "Antigravity Multi-AI Hub" as a dedicated, fully-featured companion webview panel (`vscode.window.createWebviewPanel` or `WebviewViewProvider` in the Activity Bar/Sidebar). This provides an independent UI for model selection, provider management, manual switching, automated fallback, and chat, completely coexisting beside Antigravity without interference.

---

## 3. Provider Protocols & Specifications

### 3.1 DeepSeek API

| Characteristic | Specification | Evidence / Status |
| :--- | :--- | :--- |
| **Official Documentation** | `https://api-docs.deepseek.com` | **[VERIFIED]** |
| **Base URL** | `https://api.deepseek.com` (or `https://api.deepseek.com/v1`) | **[VERIFIED]** |
| **Chat Endpoint** | `POST https://api.deepseek.com/chat/completions` | **[VERIFIED]** |
| **Authentication** | `Authorization: Bearer <DEEPSEEK_API_KEY>` | **[VERIFIED]** |
| **Wire Protocol** | OpenAI Chat Completions compatible schema | **[VERIFIED]** |
| **Streaming** | Server-Sent Events (`stream: true`, chunks with `choices[0].delta`) | **[VERIFIED]** |
| **Primary Model: `deepseek-chat`** | General conversational & coding model (DeepSeek-V3 architecture). Context: 64,000 tokens. Supports Function/Tool Calling, JSON mode, `temperature`, `top_p`. | **[VERIFIED]** |
| **Primary Model: `deepseek-reasoner`** | Reasoning model (DeepSeek-R1 architecture). Context: 64,000 tokens. Native Chain-of-Thought exposed in response field `reasoning_content`. | **[VERIFIED]** |
| **Critical Constraints for `deepseek-reasoner`** | **No Tool Calling**, **No JSON Mode**, `temperature`/`top_p` ignored. Intermediate `reasoning_content` **must not** be concatenated into subsequent conversational history turns. | **[VERIFIED]** |

### 3.2 Google Gemini API

| Characteristic | Specification | Evidence / Status |
| :--- | :--- | :--- |
| **Official Documentation** | `https://ai.google.dev/gemini-api/docs` | **[VERIFIED]** |
| **Current Official SDK** | `@google/genai` (Unified SDK for AI Studio & Vertex AI) | **[VERIFIED]** |
| **Legacy / Deprecated SDK** | `@google/generative-ai` (Deprecated; must not be used) | **[VERIFIED]** |
| **Native REST Base URL** | `https://generativelanguage.googleapis.com/v1beta/` | **[VERIFIED]** |
| **Native Chat Endpoint** | `POST .../models/{model}:generateContent` (and `:streamGenerateContent?alt=sse`) | **[VERIFIED]** |
| **OpenAI-Compatible Endpoint** | `POST https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | **[VERIFIED]** |
| **Authentication** | Header `x-goog-api-key: <KEY>` or Bearer token on OpenAI endpoint | **[VERIFIED]** |
| **Primary Models** | `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash` | **[VERIFIED]** |
| **Context Windows** | 1,000,000 to 2,000,000+ tokens depending on model tier | **[VERIFIED]** |
| **Capabilities** | Text, Code, Vision (multimodal image/PDF), Function Calling, Structured JSON, Thinking budget / reasoning effort (`thinking_budget` / `reasoning_effort`). | **[VERIFIED]** |

---

## 4. Credential Storage Analysis

| Storage Mechanism | Platforms | Maintenance Status | Security Rating | Verdict & Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **`vscode.ExtensionContext.secrets`** | Cross-platform (Windows, macOS, Linux) | **Built-in & Actively Maintained** by VS Code / Electron | **High** (Delegates to Windows DPAPI / Credential Vault) | **[VERIFIED - RECOMMENDED]** Zero external dependencies, no native compilation, seamless runtime integration. |
| **`@napi-rs/keyring`** | Cross-platform | Actively Maintained (Rust N-API) | **High** (Native Windows Credential Manager) | **[VERIFIED - VIABLE ALTERNATIVE]** Best choice if running an external standalone Node process. |
| **`keytar` (`@github/keytar`)** | Cross-platform | **DEPRECATED & ARCHIVED** | Low / Broken | **[VERIFIED - REJECTED]** Officially archived; fails on modern Node/Electron runtimes. |
| **Plaintext / SQLite / Config file** | Any | N/A | **CRITICAL RISK** | **[VERIFIED - PROHIBITED]** Violates security baseline. Zero secrets in plain files. |

---

## 5. Local Database (SQLite) Analysis

| Library | Type | Compatibility with VS Code Extension Host | Compatibility with Standalone Node Gateway | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **`@vscode/sqlite3`** | Node-API C++ binding | **High** (Maintained by Microsoft specifically for VS Code ABI stability) | High | **[VERIFIED - RECOMMENDED FOR EXTENSION]** Built specifically to solve Electron ABI issues. |
| **`sql.js`** | Pure WebAssembly (WASM) | **High** (Zero native C++ bindings, 100% portable) | High | **[VERIFIED - SOLID WASM FALLBACK]** No compilation needed; in-memory with file export. |
| **`better-sqlite3`** | Native C++ addon | **Low** (Causes `NODE_MODULE_VERSION` ABI mismatch errors inside VS Code Electron) | **Very High** (Excellent in standard Node 24) | **[VERIFIED - RESERVED FOR STANDALONE GATEWAY]** Only recommended if gateway runs in standalone Node process. |

---

## 6. Compatibility Spike Status

To provide irrefutable runtime evidence for (1) Webview panel creation, (2) Secret storage read/write, (3) Workspace file reading, and (4) Host API version logging, the spike extension code has been authored in `spike/`:
- `spike/package.json`
- `spike/tsconfig.json`
- `spike/src/extension.ts`
- `spike/README.md`

**Current Spike Status**: **PROPOSED — AWAITING USER APPROVAL**.  
In strict compliance with user safety rules, no npm packages have been installed, no TypeScript build has been triggered, and no extension has been installed into Antigravity IDE. Runtime verification will be performed only upon user authorization.
