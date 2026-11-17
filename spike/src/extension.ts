import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Antigravity Hub Spike');
    context.subscriptions.push(outputChannel);

    outputChannel.appendLine('=== Antigravity Multi-AI Hub Spike Activation ===');
    
    // (4) Log reported VS Code API version
    const apiVersion = vscode.version;
    outputChannel.appendLine(`[Test 4] Reported VS Code API Version: ${apiVersion}`);

    const disposable = vscode.commands.registerCommand('antigravity-spike.runTests', async () => {
        outputChannel.show(true);
        outputChannel.appendLine('\n--- Running Compatibility Verification Tests ---');

        const results = {
            apiVersion: apiVersion,
            secretStorageWorking: false,
            workspaceFileReadWorking: false,
            webviewPanelWorking: false,
            details: [] as string[]
        };

        // (2) Test Secret Storage (store and read a test secret)
        try {
            const testKey = 'spike_test_secret_key';
            const testValue = `test_secret_payload_${Date.now()}`;
            
            outputChannel.appendLine('[Test 2] Storing test secret into context.secrets...');
            await context.secrets.store(testKey, testValue);

            outputChannel.appendLine('[Test 2] Reading test secret back from context.secrets...');
            const retrievedValue = await context.secrets.get(testKey);

            if (retrievedValue === testValue) {
                results.secretStorageWorking = true;
                results.details.push('SecretStorage: PASS (stored and successfully matched retrieved value)');
                outputChannel.appendLine('  -> PASS: Secret correctly stored and retrieved via Windows Credential Manager / DPAPI.');
            } else {
                results.details.push(`SecretStorage: FAIL (value mismatch: expected "${testValue}", got "${retrievedValue}")`);
                outputChannel.appendLine('  -> FAIL: Secret retrieved did not match stored value.');
            }

            // Cleanup test secret
            await context.secrets.delete(testKey);
            outputChannel.appendLine('  -> Cleaned up test secret.');
        } catch (err: any) {
            results.details.push(`SecretStorage: ERROR (${err?.message || err})`);
            outputChannel.appendLine(`  -> ERROR: ${err?.message || err}`);
        }

        // (3) Test Reading one file from the opened folder
        try {
            outputChannel.appendLine('[Test 3] Testing workspace file access...');
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                results.details.push('WorkspaceFileRead: SKIP (No workspace folder is currently open)');
                outputChannel.appendLine('  -> SKIP: No workspace folder opened.');
            } else {
                const rootUri = workspaceFolders[0].uri;
                // Attempt to find or read a file in the workspace root
                const files = await vscode.workspace.findFiles('*', '**/node_modules/**', 5);
                if (files.length > 0) {
                    const sampleFileUri = files[0];
                    const fileBytes = await vscode.workspace.fs.readFile(sampleFileUri);
                    const fileContent = new TextDecoder().decode(fileBytes);
                    results.workspaceFileReadWorking = true;
                    results.details.push(`WorkspaceFileRead: PASS (Read ${sampleFileUri.fsPath}, length: ${fileContent.length} chars)`);
                    outputChannel.appendLine(`  -> PASS: Successfully read file ${sampleFileUri.fsPath} (${fileContent.length} bytes)`);
                } else {
                    results.details.push('WorkspaceFileRead: SKIP (Workspace folder is empty; please create a dummy file to test)');
                    outputChannel.appendLine('  -> SKIP: Workspace folder has no files to read.');
                }
            }
        } catch (err: any) {
            results.details.push(`WorkspaceFileRead: ERROR (${err?.message || err})`);
            outputChannel.appendLine(`  -> ERROR: ${err?.message || err}`);
        }

        // (1) Open a Webview Panel
        try {
            outputChannel.appendLine('[Test 1] Creating and opening Webview Panel...');
            const panel = vscode.window.createWebviewPanel(
                'antigravitySpikeWebview',
                'Antigravity Hub Spike Verification',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            panel.webview.html = getWebviewContent(results);
            results.webviewPanelWorking = true;
            results.details.push('WebviewPanel: PASS (Successfully rendered webview panel beside editor)');
            outputChannel.appendLine('  -> PASS: Webview panel created and HTML loaded.');
        } catch (err: any) {
            results.details.push(`WebviewPanel: ERROR (${err?.message || err})`);
            outputChannel.appendLine(`  -> ERROR: ${err?.message || err}`);
        }

        vscode.window.showInformationMessage(
            `Spike Completed! VS Code API: ${results.apiVersion} | Secrets: ${results.secretStorageWorking ? 'OK' : 'FAIL'} | Webview: ${results.webviewPanelWorking ? 'OK' : 'FAIL'}`
        );
    });

    context.subscriptions.push(disposable);
}

function getWebviewContent(results: {
    apiVersion: string;
    secretStorageWorking: boolean;
    workspaceFileReadWorking: boolean;
    webviewPanelWorking: boolean;
    details: string[];
}): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Antigravity Hub Spike</title>
    <style>
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 24px;
            line-height: 1.6;
        }
        h1 {
            color: var(--vscode-foreground);
            font-size: 1.4rem;
            margin-bottom: 12px;
            border-bottom: 1px solid var(--vscode-panel-border, #444);
            padding-bottom: 8px;
        }
        .status-card {
            background-color: var(--vscode-sideBar-background, #252526);
            border: 1px solid var(--vscode-widget-border, #3c3c3c);
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 16px;
        }
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: 600;
            font-size: 0.85rem;
        }
        .pass { background-color: #0e7039; color: #ffffff; }
        .fail { background-color: #a82424; color: #ffffff; }
        .skip { background-color: #b8860b; color: #ffffff; }
        ul { padding-left: 20px; }
        li { margin-bottom: 6px; }
        code {
            background: var(--vscode-textCodeBlock-background, #1e1e1e);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family, monospace);
        }
    </style>
</head>
<body>
    <h1>Antigravity Multi-AI Hub — Compatibility Spike</h1>
    <div class="status-card">
        <h3>Host Environment Verification</h3>
        <p><strong>Reported VS Code Version:</strong> <code>${results.apiVersion}</code></p>
        <p><strong>Extension Host:</strong> Antigravity IDE (Electron base)</p>
    </div>

    <div class="status-card">
        <h3>Feature Verification Results</h3>
        <ul>
            <li><strong>(1) Webview Panel:</strong> <span class="badge ${results.webviewPanelWorking ? 'pass' : 'fail'}">${results.webviewPanelWorking ? 'PASS' : 'FAIL'}</span></li>
            <li><strong>(2) Secret Storage:</strong> <span class="badge ${results.secretStorageWorking ? 'pass' : 'fail'}">${results.secretStorageWorking ? 'PASS' : 'FAIL'}</span></li>
            <li><strong>(3) Workspace File Access:</strong> <span class="badge ${results.workspaceFileReadWorking ? 'pass' : 'skip'}">${results.workspaceFileReadWorking ? 'PASS' : 'PENDING / EMPTY'}</span></li>
            <li><strong>(4) Host Version Query:</strong> <span class="badge pass">PASS (${results.apiVersion})</span></li>
        </ul>
    </div>

    <div class="status-card">
        <h3>Execution Log</h3>
        <ul>
            ${results.details.map(d => `<li><code>${d}</code></li>`).join('')}
        </ul>
    </div>
</body>
</html>`;
}

export function deactivate() {}
