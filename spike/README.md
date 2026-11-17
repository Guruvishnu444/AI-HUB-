# Antigravity Multi-AI Hub — Spike Test Extension

## Purpose
This spike extension is a lightweight "hello world" probe designed to test and provide concrete runtime evidence for four core compatibility requirements inside **Google Antigravity IDE**:
1. **Webview Panel**: Tests opening an interactive HTML webview panel beside the editor.
2. **Secret Storage**: Tests storing, retrieving, and deleting a secret payload via `context.secrets` (backing into Windows DPAPI / Credential Vault).
3. **Workspace File Access**: Tests reading files from the active workspace directory using `vscode.workspace.fs.readFile`.
4. **VS Code API Version**: Logs and verifies the exact API version reported by `vscode.version`.

---

## File Contents
- `package.json`: Extension manifest targeting VS Code `^1.90.0` with command `antigravity-spike.runTests`.
- `tsconfig.json`: TypeScript configuration targeting `ES2022` with CommonJS module output.
- `src/extension.ts`: Implementation of the 4 test cases and result output UI.

---

## Installation & Execution Instructions (Requires User Approval)

> **Rule Compliance**: As per user safety rules, no dependencies will be installed and no extension will be compiled or registered without explicit user approval.

When approved by the user, the compilation and installation flow proceeds as follows:

1. **Install Dev Dependencies inside `spike/`**:
   ```bash
   cd spike
   npm install --save-dev @types/vscode@^1.90.0 @types/node@^22.0.0 typescript@^5.4.5
   ```

2. **Compile TypeScript**:
   ```bash
   npm run compile
   ```

3. **Install into Antigravity IDE**:
   - *Option A (Direct VSIX Package)*:
     Package via `@vscode/vsce`:
     ```bash
     npx @vscode/vsce package
     "C:\Users\guruv\AppData\Local\Programs\Antigravity IDE\bin\antigravity-ide.cmd" --install-extension antigravity-hub-spike-0.0.1.vsix
     ```
   - *Option B (Local Extension Symlink/Folder)*:
     Symlink or copy the `spike` directory into Antigravity IDE's extensions folder:
     `%USERPROFILE%\.antigravity-ide\extensions\antigravity-hub-spike`

4. **Run Verification Command**:
   Open Command Palette in Antigravity IDE (`Ctrl+Shift+P`), type and run:
   `Antigravity Hub Spike: Run Compatibility Tests`
   
   View the output in the Output Channel dropdown (`Antigravity Hub Spike`) and inspect the opened Webview side panel.
