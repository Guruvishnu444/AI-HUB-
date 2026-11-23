import * as vscode from 'vscode';
import { SecretVault } from './core/storage/secretVault';
import { HubDatabase } from './core/storage/database';
import { AdapterRegistry } from './core/adapters/registry';
import { GatewayRouter } from './core/gateway/router';
import { WorkspaceGuardrails } from './workspace/guardrails';
import { FileTreeExplorer } from './workspace/fileTree';
import { DiffEngine } from './workspace/diffEngine';
import { getWebviewHtml } from './webview/ui';

export async function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Antigravity Multi-AI Hub');
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('[Multi-AI Hub] Activating Extension Host subsystem...');

    // 1. Initialize Storage & Vault
    const vault = new SecretVault(context);
    const db = new HubDatabase(context);
    await db.initialize();
    outputChannel.appendLine('[Multi-AI Hub] Storage & SecretVault initialized.');

    // 2. Initialize Adapters
    const registry = new AdapterRegistry();
    registry.initializeDefaultAdapters(db.getProviders());
    outputChannel.appendLine('[Multi-AI Hub] Default adapters (Gemini, DeepSeek) registered.');

    // 3. Initialize Workspace subsystem
    const guardrails = new WorkspaceGuardrails();
    const fileTree = new FileTreeExplorer(guardrails);
    const diffEngine = new DiffEngine(guardrails);

    // Auto-set workspace root if a folder is open
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        guardrails.setWorkspaceRoot(workspaceFolders[0].uri.fsPath);
        outputChannel.appendLine(`[Multi-AI Hub] Workspace root set to: ${workspaceFolders[0].uri.fsPath}`);
    }

    // 4. Initialize Gateway Router (now with workspace subsystem)
    const router = new GatewayRouter(vault, db, registry, guardrails, fileTree, diffEngine);

    // Watch for workspace folder changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(async e => {
            const folders = vscode.workspace.workspaceFolders;
            if (folders && folders.length > 0) {
                const newPath = folders[0].uri.fsPath;
                guardrails.setWorkspaceRoot(newPath);
                await router.handleWorkspaceRootChanged(newPath);
                outputChannel.appendLine(`[Multi-AI Hub] Workspace root updated to: ${newPath}`);
            }
        })
    );

    // 5. Register WebviewViewProvider for Activity Bar Sidebar
    const viewProvider = new HubSidebarViewProvider(context.extensionUri, router);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('antigravityHub.mainView', viewProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // 6. Register Command to open beside editor
    context.subscriptions.push(
        vscode.commands.registerCommand('antigravityHub.openPanel', () => {
            const panel = vscode.window.createWebviewPanel(
                'antigravityHubPanel',
                'Antigravity Multi-AI Hub',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            panel.webview.html = getWebviewHtml();
            panel.webview.onDidReceiveMessage(async msg => {
                await router.handleWebviewMessage(msg, out => panel.webview.postMessage(out));
            });
        })
    );

    // 7. Register Health Check Command
    context.subscriptions.push(
        vscode.commands.registerCommand('antigravityHub.checkHealth', async () => {
            const geminiKey = await vault.hasKey('google-gemini');
            const deepseekKey = await vault.hasKey('deepseek');
            const models = db.getModels();
            const wsRoot = guardrails.getWorkspaceRoot();

            vscode.window.showInformationMessage(
                `Antigravity Multi-AI Hub v0.1.0 | Gemini Key: ${geminiKey ? 'YES' : 'NO'} | DeepSeek Key: ${deepseekKey ? 'YES' : 'NO'} | Models: ${models.length} | Workspace: ${wsRoot ? wsRoot : 'None'}`
            );
        })
    );

    // 8. Register command to pick a workspace folder manually
    context.subscriptions.push(
        vscode.commands.registerCommand('antigravityHub.pickWorkspace', async () => {
            const result = await vscode.window.showOpenDialog({
                canSelectFolders: true,
                canSelectFiles: false,
                canSelectMany: false,
                title: 'Select Project Folder for Antigravity Hub'
            });
            if (result && result.length > 0) {
                const newPath = result[0].fsPath;
                guardrails.setWorkspaceRoot(newPath);
                await router.handleWorkspaceRootChanged(newPath);
                vscode.window.showInformationMessage(`Antigravity Hub workspace set to: ${newPath}`);
            }
        })
    );

    outputChannel.appendLine('[Multi-AI Hub] Activation complete. Ready.');
}

class HubSidebarViewProvider implements vscode.WebviewViewProvider {
    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly router: GatewayRouter
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        webviewView.webview.options = {
            enableScripts: true
        };

        webviewView.webview.html = getWebviewHtml();

        webviewView.webview.onDidReceiveMessage(async msg => {
            await this.router.handleWebviewMessage(msg, out => webviewView.webview.postMessage(out));
        });
    }
}

export function deactivate() {}
