import * as path from 'path';
import * as vscode from 'vscode';

/**
 * File patterns that must never be read or sent to any AI provider.
 * Covers credentials, secrets, private keys, and common secret files.
 */
const BLOCKED_PATTERNS: RegExp[] = [
    /\.env(\..+)?$/i,
    /\.pem$/i,
    /\.key$/i,
    /\.p12$/i,
    /\.pfx$/i,
    /\.jks$/i,
    /\.pkcs12$/i,
    /id_rsa(\.pub)?$/i,
    /id_ed25519(\.pub)?$/i,
    /id_ecdsa(\.pub)?$/i,
    /id_dsa(\.pub)?$/i,
    /authorized_keys$/i,
    /known_hosts$/i,
    /\.npmrc$/i,
    /\.netrc$/i,
    /(^|\/ )credentials(\.json)?$/i,
    /service[-_]account(\.json)?$/i,
    /gcloud\/application_default_credentials\.json$/i,
    /\.aws\/credentials$/i,
    /\.kube\/config$/i,
    /secrets?\.(json|yaml|yml|toml)$/i,
    /private[-_]?key\.(json|pem|key)$/i,
    /(^|\/)tokens?\.(json|txt)$/i,
    /(^|\/ )\.git\/config$/i,
    /\.git-credentials$/i,
    /\.pypirc$/i
];

/**
 * Patterns that trigger a user warning (but can still be sent after confirmation).
 */
const SENSITIVE_PATTERNS: RegExp[] = [
    /config\.(json|yaml|yml|toml|ini)$/i,
    /settings\.(json|yaml|yml)$/i,
    /\.htpasswd$/i,
    /dockerfile$/i,
    /docker-compose\.(yml|yaml)$/i,
    /\.github\/workflows\/.+\.yml$/i,
    /\.gitconfig$/i
];

export interface PathValidationResult {
    allowed: boolean;
    isBlocked: boolean;
    isSensitive: boolean;
    reason?: string;
}

export class WorkspaceGuardrails {
    private workspaceRoot: string | null = null;

    public setWorkspaceRoot(root: string): void {
        this.workspaceRoot = path.normalize(root);
    }

    public getWorkspaceRoot(): string | null {
        return this.workspaceRoot;
    }

    /**
     * Validates that a requested path is:
     * 1. Within the designated workspace root (no path traversal)
     * 2. Not a blocked credential/secret file
     */
    public validatePath(requestedPath: string): PathValidationResult {
        if (!this.workspaceRoot) {
            return { allowed: false, isBlocked: true, isSensitive: false, reason: 'No workspace folder selected. Open a folder first.' };
        }

        const normalizedRequest = path.normalize(path.resolve(this.workspaceRoot, requestedPath));

        // Resolve symlinks if possible (optional improvement)
        let realPath: string;
        try {
            const fs = require('fs');
            realPath = fs.realpathSync(normalizedRequest);
        } catch (_) {
            realPath = normalizedRequest;
        }

        // 1. Path traversal check using relative calculation (case‑insensitive on Windows)
        const rel = path.relative(this.workspaceRoot, realPath);
        const inside = rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
        if (!inside) {
            return {
                allowed: false,
                isBlocked: true,
                isSensitive: false,
                reason: `Access denied: path "${requestedPath}" is outside the workspace folder.`
            };
        }

        const filename = path.basename(realPath);
        // Normalise for pattern matching on Windows (use forward slashes)
        const relForMatch = rel.split(path.sep).join('/');

        // 2. Blocked patterns — hard deny (test both filename and relative path)
        for (const pattern of BLOCKED_PATTERNS) {
            if (pattern.test(filename) || pattern.test(relForMatch)) {
                return {
                    allowed: false,
                    isBlocked: true,
                    isSensitive: true,
                    reason: `Access denied: "${filename}" matches a blocked credential/secret pattern. This file will never be sent to any AI provider.`
                };
            }
        }

        // 3. Sensitive patterns — warn but allow
        for (const pattern of SENSITIVE_PATTERNS) {
            if (pattern.test(filename) || pattern.test(relForMatch)) {
                return {
                    allowed: true,
                    isBlocked: false,
                    isSensitive: true,
                    reason: `Warning: "${filename}" may contain sensitive configuration. You will be asked to confirm before sending it to an AI provider.`
                };
            }
        }

        return { allowed: true, isBlocked: false, isSensitive: false };
    }

    /**
     * Resolves a relative workspace path to an absolute vscode.Uri.
     * Returns null if validation fails.
     */
    public resolveUri(relativePath: string): vscode.Uri | null {
        if (!this.workspaceRoot) return null;
        const result = this.validatePath(relativePath);
        if (!result.allowed) return null;
        const absolute = path.resolve(this.workspaceRoot, relativePath);
        return vscode.Uri.file(absolute);
    }

    /**
     * Returns the relative path from workspace root, or the absolute path if
     * the file is somehow outside (should not happen after validatePath).
     */
    public toRelative(absolutePath: string): string {
        if (!this.workspaceRoot) return absolutePath;
        const rel = path.relative(this.workspaceRoot, absolutePath);
        return rel.startsWith('..') ? absolutePath : rel;
    }
}
