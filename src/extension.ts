import * as vscode from 'vscode';
import { SecretVault } from './core/storage/secretVault';
import { HubDatabase } from './core/storage/database';
import { AdapterRegistry } from './core/adapters/registry';
import { GatewayRouter } from './core/gateway/router';
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

    // 3. Initialize Gateway Router
    const router = new GatewayRouter(vault, db, registry);

    // 4. Register WebviewViewProvider for Activity Bar Sidebar
    const viewProvider = new HubSidebarViewProvider(context.extensionUri, router);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('antigravityHub.mainView', viewProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // 5. Register Command to open beside editor
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

    // 6. Register Health Check Command
    context.subscriptions.push(
        vscode.commands.registerCommand('antigravityHub.checkHealth', async () => {
            const geminiKey = await vault.hasKey('google-gemini');
            const deepseekKey = await vault.hasKey('deepseek');
            const models = db.getModels();

            vscode.window.showInformationMessage(
                `Antigravity Multi-AI Hub Healthy! (VS Code ${vscode.version} | Gemini Key: ${geminiKey ? 'YES' : 'NO'} | DeepSeek Key: ${deepseekKey ? 'YES' : 'NO'} | Models: ${models.length})`
            );
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
