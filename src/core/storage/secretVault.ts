import * as vscode from 'vscode';

export function cleanApiKey(raw: string): string {
    if (!raw) return '';
    let key = String(raw);
    // Strip zero-width spaces, byte order marks, and non-printable control characters
    key = key.replace(/[\u200B-\u200D\uFEFF]/g, '');
    key = key.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    key = key.replace(/[\r\n\t]/g, '');
    key = key.trim();

    // Only strip variable assignment prefix if it matches an env var pattern like API_KEY= or KEY =
    if (/^[A-Za-z0-9_-]{2,}\s*=\s*/.test(key)) {
        key = key.replace(/^[A-Za-z0-9_-]{2,}\s*=\s*/, '');
    }
    // If user pasted with "Bearer " prefix
    if (key.toLowerCase().startsWith('bearer ')) {
        key = key.substring(7).trim();
    }
    // Strip trailing semicolons or commas
    key = key.replace(/[;,]+$/, '').trim();
    // Strip surrounding quotes
    key = key.replace(/^["'`]+|["'`]+$/g, '').trim();
    // Strip trailing semicolons or commas again if quotes were inside
    key = key.replace(/[;,]+$/, '').trim();
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
