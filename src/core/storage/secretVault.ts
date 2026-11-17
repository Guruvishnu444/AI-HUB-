import * as vscode from 'vscode';

/**
 * SecretVault
 * Wraps VS Code's native SecretStorage API, backed by Windows DPAPI / Credential Vault.
 * Ensures zero plaintext keys in SQLite, memory leaks, or Webview state.
 */
export class SecretVault {
    private secrets: vscode.SecretStorage;
    private static readonly KEY_PREFIX = 'antigravity_hub_api_key_';

    constructor(context: vscode.ExtensionContext) {
        this.secrets = context.secrets;
    }

    private makeKey(providerId: string): string {
        return `${SecretVault.KEY_PREFIX}${providerId}`;
    }

    public async saveKey(providerId: string, apiKey: string): Promise<void> {
        const trimmed = apiKey.trim();
        if (!trimmed) {
            throw new Error('Cannot save an empty API key.');
        }
        await this.secrets.store(this.makeKey(providerId), trimmed);
    }

    public async getKey(providerId: string): Promise<string | undefined> {
        return await this.secrets.get(this.makeKey(providerId));
    }

    public async hasKey(providerId: string): Promise<boolean> {
        const key = await this.getKey(providerId);
        return !!key && key.length > 0;
    }

    public async deleteKey(providerId: string): Promise<void> {
        await this.secrets.delete(this.makeKey(providerId));
    }
}
