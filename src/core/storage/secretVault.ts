import * as vscode from 'vscode';

export function cleanApiKey(raw: string): string {
    if (!raw) return '';
    let key = raw.trim();
    // If user pasted key assignment from .env (e.g. KEY=sk-...)
    if (key.includes('=')) {
        key = key.split('=').pop()!.trim();
    }
    // If user pasted with "Bearer " prefix
    if (key.toLowerCase().startsWith('bearer ')) {
        key = key.substring(7).trim();
    }
    // Strip surrounding quotes
    key = key.replace(/^["'`]|["'`]$/g, '').trim();
    // Strip trailing semicolons or commas
    key = key.replace(/[;,]$/, '').trim();
    return key;
}

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
        const cleaned = cleanApiKey(apiKey);
        if (!cleaned) {
            throw new Error('Cannot save an empty API key.');
        }
        await this.secrets.store(this.makeKey(providerId), cleaned);
    }

    public async getKey(providerId: string): Promise<string | undefined> {
        const raw = await this.secrets.get(this.makeKey(providerId));
        return raw ? cleanApiKey(raw) : undefined;
    }

    public async hasKey(providerId: string): Promise<boolean> {
        const key = await this.getKey(providerId);
        return !!key && key.length > 0;
    }

    public async deleteKey(providerId: string): Promise<void> {
        await this.secrets.delete(this.makeKey(providerId));
    }
}
