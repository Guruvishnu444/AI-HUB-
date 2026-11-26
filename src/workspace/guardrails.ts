import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';

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
    /(^|\/ )tokens?\.(json|txt)$/i,
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
    private realRoot: string | null = null;

    private static resolveReal(p: string): string {
        let current = p;
        const rest: string[] = [];
        for (;;) {
            try {
                const real = fs.realpathSync(current);
                return rest.length ? path.join(real, ...rest.reverse()) : real;
            } catch (_) {
                const parent = path.dirname(current);
                if (parent === current) return p;
                rest.push(path.basename(current));
                current = parent;
            }
        }
    }

    private static isInside(base: string, target: string): boolean {
        const rel = path.relative(base, target);
        return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
    }

    public setWorkspaceRoot(root: string): void {
        this.workspaceRoot = path.normalize(root);
        this.realRoot = WorkspaceGuardrails.resolveReal(this.workspaceRoot);
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

        // Resolve symlinks
        const realPath = WorkspaceGuardrails.resolveReal(normalizedRequest);

        // Path traversal checks
        if (!WorkspaceGuardrails.isInside(this.workspaceRoot, normalizedRequest) ||
            !WorkspaceGuardrails.isInside(this.realRoot ?? this.workspaceRoot, realPath)) {
            return {
                allowed: false,
                isBlocked: true,
                isSensitive: false,
                reason: `Access denied: path "${requestedPath}" is outside the workspace folder.`
            };
        }

        const filename = path.basename(normalizedRequest);
        const realFilename = path.basename(realPath);
        const rel = path.relative(this.workspaceRoot, normalizedRequest).split(path.sep).join('/');
        const realRel = this.realRoot ? path.relative(this.realRoot, realPath).split(path.sep).join('/') : '';

        const candidates = [filename, realFilename, rel, realRel];

        // Blocked patterns — hard deny
        for (const pattern of BLOCKED_PATTERNS) {
            if (candidates.some(c => pattern.test(c))) {
                return {
                    allowed: false,
                    isBlocked: true,
                    isSensitive: true,
                    reason: `Access denied: "${filename}" matches a blocked credential/secret pattern. This file will never be sent to any AI provider.`
                };
            }
        }

        // Sensitive patterns — warn but allow
        for (const pattern of SENSITIVE_PATTERNS) {
            if (candidates.some(c => pattern.test(c))) {
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
