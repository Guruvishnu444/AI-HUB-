import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceGuardrails } from './guardrails';

export interface FileTreeNode {
    name: string;
    relativePath: string;
    type: 'file' | 'directory';
    isBlocked: boolean;
    isSensitive: boolean;
    children?: FileTreeNode[];
    sizeBytes?: number;
}

export interface FileTreeNode {
    name: string;
    relativePath: string;
    type: 'file' | 'directory';
    isBlocked: boolean;
    isSensitive: boolean;
    children?: FileTreeNode[];
    sizeBytes?: number;
}

/** Max files returned per directory to avoid flooding the UI. */
const MAX_DIR_ENTRIES = 500;
/** Max file size that can be read and sent to AI (100 KB). */
export const MAX_FILE_READ_BYTES = 100 * 1024;

/** Extensions that are almost certainly binary and should not be read as text. */
const BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.svg',
    '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z', '.exe', '.dll',
    '.so', '.dylib', '.wasm', '.node', '.bin', '.dat', '.db', '.sqlite'
]);

export class FileTreeExplorer {
    constructor(private guardrails: WorkspaceGuardrails) {}

    /**
     * Builds a file tree for the workspace root, one level deep by default.
     * Respects guardrails — blocked files are flagged but still listed (name only).
     */
    public async buildTree(relDir: string = '', depth: number = 2): Promise<FileTreeNode[]> {
        const root = this.guardrails.getWorkspaceRoot();
        if (!root) return [];

        const absDir = relDir ? path.resolve(root, relDir) : root;

        // Safety: ensure we're inside workspace
        if (!absDir.startsWith(root)) return [];

        try {
            const dirUri = vscode.Uri.file(absDir);
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            const nodes: FileTreeNode[] = [];

            let count = 0;
            for (const [name, fileType] of entries) {
                if (count++ >= MAX_DIR_ENTRIES) break;

                // Skip hidden directories (node_modules, .git, etc.)
                if (name === 'node_modules' || name === '.git' || name === '.next' || name === 'dist' || name === 'build' || name === '__pycache__') {
                    continue;
                }

                const relativePath = relDir ? `${relDir}/${name}` : name;
                const validation = this.guardrails.validatePath(relativePath);

                const node: FileTreeNode = {
                    name,
                    relativePath,
                    type: fileType === vscode.FileType.Directory ? 'directory' : 'file',
                    isBlocked: validation.isBlocked,
                    isSensitive: validation.isSensitive
                };

                if (node.type === 'directory' && depth > 1) {
                    node.children = await this.buildTree(relativePath, depth - 1);
                }

                if (node.type === 'file') {
                    try {
                        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(path.resolve(root, relativePath)));
                        node.sizeBytes = stat.size;
                    } catch {
                        // non-critical
                    }
                }

                nodes.push(node);
            }

            return nodes.sort((a, b) => {
                // Directories first, then files, both alphabetically
                if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
        } catch {
            return [];
        }
    }

    /**
     * Reads a workspace file and returns its text content.
     * Enforces: path validation, block check, size limit, binary check.
     */
    public async readFile(relativePath: string): Promise<{ content: string; sizeBytes: number; truncated: boolean; warning?: string }> {
        const root = this.guardrails.getWorkspaceRoot();
        if (!root) throw new Error('No workspace folder selected.');

        const validation = this.guardrails.validatePath(relativePath);
        if (!validation.allowed) {
            throw new Error(validation.reason || 'Access denied.');
        }

        const ext = path.extname(relativePath).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) {
            throw new Error(`"${path.basename(relativePath)}" is a binary file and cannot be read as text.`);
        }

        const absPath = path.resolve(root, relativePath);
        const uri = vscode.Uri.file(absPath);

        const stat = await vscode.workspace.fs.stat(uri);
        const sizeBytes = stat.size;

        let truncated = false;
        let bytes: Uint8Array;

        if (sizeBytes > MAX_FILE_READ_BYTES) {
            // Read first MAX_FILE_READ_BYTES only
            const full = await vscode.workspace.fs.readFile(uri);
            bytes = full.slice(0, MAX_FILE_READ_BYTES);
            truncated = true;
        } else {
            bytes = await vscode.workspace.fs.readFile(uri);
        }

        const content = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

        return {
            content,
            sizeBytes,
            truncated,
            warning: validation.isSensitive ? validation.reason : undefined
        };
    }

    /**
     * Searches for a text pattern across workspace files (simple grep-style).
     * Returns at most maxResults matching lines with file and line number.
     */
    public async searchFiles(query: string, maxResults: number = 50): Promise<Array<{ file: string; line: number; text: string }>> {
        const results: Array<{ file: string; line: number; text: string }> = [];
        const root = this.guardrails.getWorkspaceRoot();
        if (!root || !query.trim()) return results;

        const pattern = new vscode.RelativePattern(root, '**/*');
        const files = await vscode.workspace.findFiles(pattern, '{node_modules,.git,dist,build}/**', 200);

        const queryLower = query.toLowerCase();

        for (const fileUri of files) {
            if (results.length >= maxResults) break;

            const relativePath = vscode.workspace.asRelativePath(fileUri);
            const validation = this.guardrails.validatePath(relativePath);
            if (!validation.allowed) continue;

            const ext = path.extname(relativePath).toLowerCase();
            if (BINARY_EXTENSIONS.has(ext)) continue;

            try {
                const stat = await vscode.workspace.fs.stat(fileUri);
                if (stat.size > MAX_FILE_READ_BYTES) continue;

                const bytes = await vscode.workspace.fs.readFile(fileUri);
                const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
                const lines = text.split('\n');

                for (let i = 0; i < lines.length && results.length < maxResults; i++) {
                    if (lines[i].toLowerCase().includes(queryLower)) {
                        results.push({ file: relativePath, line: i + 1, text: lines[i].trim() });
                    }
                }
            } catch {
                // Skip unreadable files
            }
        }

        return results;
    }
}
