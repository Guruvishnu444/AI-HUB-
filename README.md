# Antigravity Multi-AI Hub

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Target Editor](https://img.shields.io/badge/Editor-Google%20Antigravity%20IDE%20(v1.107.0)-purple.svg)](https://antigravity.google)
[![Security Baseline](https://img.shields.io/badge/Security-Zero%20Secrets%20Logged-success.svg)](#security-baseline)

A companion AI coding assistant that runs beside **Google Antigravity IDE** on Windows. Connect your own API keys for multiple AI providers (Google Gemini, DeepSeek, Anthropic Claude, OpenAI, and local models), manually select models with verified capability indicators, and leverage automatic, resilient fallback when a provider is rate-limited or experiencing downtime.

> **Important Boundary**: Antigravity Multi-AI Hub is an independent companion extension. It does **NOT** replace, modify, or interfere with Antigravity IDE's built-in models, internal agents, or system files.

---

## Key Features (Full Project Scope)

- **Multi-Provider Hub (v1)**:
  - **Google Gemini API**: Utilizing the official, active `@google/genai` unified SDK (supporting `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash` with 1M+ token context and vision).
  - **DeepSeek API**: Utilizing official OpenAI-compatible endpoints at `api.deepseek.com` (supporting `deepseek-chat` and `deepseek-reasoner` with full Chain-of-Thought handling).
  - **Extensible Adapters**: Ready for Anthropic Claude, OpenAI, OpenRouter, Ollama, and LM Studio.
- **Companion Webview Panel**:
  - Interactive React-based panel rendered directly beside your code in Antigravity IDE.
  - Model selector displaying verified capabilities: context window, vision, tools, and reasoning.
  - Provider manager to add, edit, test connections, and register custom model IDs.
- **Resilient Fallback Engine**:
  - Configurable priority queue and automatic retry on HTTP 429 respecting `Retry-After`.
  - Circuit breaker to prevent infinite retry loops.
  - Ambiguous failure protection: prompts user before resending if connection drops after request transmission, preventing double-billing.
  - Context retention preserving target model token limits upon provider switch.
- **Strict Security Baseline**:
  - API keys stored exclusively in the Windows Credential Store / DPAPI via VS Code `SecretStorage`.
  - Zero plaintext secrets in Git, logs, SQLite, or frontend webview state.
  - Strict workspace directory containment: blocks path traversal, protects `.env` files and private keys.
  - Explicit user approval required for any file modifications or terminal command executions.

---

## Project Structure

```
├── docs/                           # Architecture, compatibility audit & security specs
│   ├── 01-compatibility-report.md # Environment audit and verified findings
│   └── 02-architecture.md         # Full architecture, threat model & fallback state machine
├── spike/                          # Phase 1 verification probe
│   ├── package.json
│   ├── tsconfig.json
│   ├── README.md
│   └── src/extension.ts            # Tests webview, secret storage, fs access & API version
├── src/                            # Application source (Phases 3-12)
├── tests/                          # Automated test suite
├── PROJECT_BRIEF.md                # Permanent project specifications reference
├── CHANGELOG.md                    # Release history and audit log
└── .gitignore                      # Secrets, environment, and build exclusions
```

---

## Compatibility Findings (Phase 1 & 2 Summary)

| Item | Finding | Status |
| :--- | :--- | :--- |
| **Host Environment** | Windows 11, Node.js `v24.18.0`, npm `11.16.0`, Git `2.54.0` | **[VERIFIED]** |
| **Antigravity IDE** | Version `1.107.0`, Open VSX extension gallery, CLI extension manager | **[VERIFIED]** |
| **Extension Support** | Supports standard VS Code VSIX packaging and Webview panels | **[VERIFIED]** |
| **Credential Storage** | `context.secrets` delegates directly to Windows DPAPI with zero external native dependencies | **[VERIFIED]** |
| **IDE Model Selector** | No public API exists to inject 3rd party models into IDE's built-in dropdown | **[VERIFIED - NOT SUPPORTED]** |
| **Recommended Path** | Independent companion Webview panel operating alongside editor | **[VERIFIED - RECOMMENDED]** |

---

## 12-Phase Development Roadmap

1. **Phase 1: Inspect & Compatibility Verification** *(Completed)*
2. **Phase 2: Architectural Design & Security Specifications** *(Completed)*
3. **Phase 3: Core Gateway & IPC Dispatcher**
4. **Phase 4: Provider Configuration & Model Discovery**
5. **Phase 5: React Chat UI & Manual Model Switching**
6. **Phase 6: Resilient Fallback Engine & Circuit Breaker**
7. **Phase 7: Workspace Context & File Boundary Protection**
8. **Phase 8: File Modification, Diff Preview & Approval Engine**
9. **Phase 9: Usage Analytics, Token Tracking & Spending Limits**
10. **Phase 10: Multi-Agent Task Isolation & Coordination**
11. **Phase 11: Automated Test Suite & Security Audit**
12. **Phase 12: Windows Packaging (VSIX), Diagnostics & User Manual**

---

## License

This project is licensed under the MIT License.
