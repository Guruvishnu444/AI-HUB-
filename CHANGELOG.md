# Changelog

All notable changes to the "Antigravity Multi-AI Hub" project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added - 2026-11-17 (Phases 1 & 2 Completed)
- **Environment & Host Audit**:
  - Verified host operating system: Windows 11 (`NT 10.0.26200.0`).
  - Verified toolchain: Node.js `v24.18.0`, npm `11.16.0`, Git `2.54.0.windows.1`.
  - Located and verified installed Google Antigravity IDE: version `1.107.0`, commit `71bedb45...`.
  - Verified Open VSX registry configuration and CLI extension management support (`--install-extension`).
- **Compatibility Spike Extension (`spike/`)**:
  - Authored spike extension targeting VS Code API `^1.90.0` / `1.107.0`.
  - Implemented 4 runtime verification probes: Webview panel creation, `context.secrets` read/write (Windows DPAPI), workspace file read, and API version logging.
  - Authored comprehensive `spike/README.md` with step-by-step instructions (held pending user approval).
- **Architectural & Security Blueprint (`docs/`)**:
  - Authored `docs/01-compatibility-report.md` classifying all findings into `[VERIFIED]` and `[UNVERIFIED]`.
  - Authored `docs/02-architecture.md` detailing the gateway trade-off decision (Embedded Extension Host vs Standalone Process), provider adapter interface (`IProviderAdapter`), fallback state machine, ambiguous failure double-billing protection rule, and STRIDE threat model.
- **Project Foundation**:
  - Created `.gitignore` strictly blocking environment variables, credentials, keys, database files, and build outputs.
  - Created `PROJECT_BRIEF.md` preserving all user requirements and architectural constraints.
  - Created initial `README.md` and initialized local Git repository.
