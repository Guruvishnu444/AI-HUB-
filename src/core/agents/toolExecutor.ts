import * as path from 'path';
import * as vscode from 'vscode';
import { WorkspaceGuardrails } from '../../workspace/guardrails';

/**
 * ToolExecutor
 * Implements the security-enforced file system operations that the
 * Gemini Function Calling agent loop is allowed to invoke.
 *
 * Security model:
 *   - All paths are validated through WorkspaceGuardrails (path traversal + blocked files)
 *   - readFile / listFiles: auto-allowed for non-blocked files
 *   - proposeFileEdit: NEVER auto-executed; always returns a pending diff for user approval
 *   - node_modules, .git, out/ directories are always excluded from list/search
 */

export type ToolName = 'listFiles' | 'readFile' | 'createFile' | 'proposeFileEdit' | 'searchFiles' | 'getActiveFileContext';

export interface ToolCall {
    name: ToolName | string;
    args: Record<string, any>;
}

export interface ToolResult {
    toolName: ToolName;
    success: boolean;
    output: string;
    /** Set only when proposeFileEdit is called — triggers user approval UI */
    pendingEdit?: PendingEdit;
    /** Set if read was blocked */
    blocked?: boolean;
}

export interface PendingEdit {
    editId: string;
    filePath: string;
    originalContent: string;
    proposedContent: string;
    description: string;
}

/** Directories permanently excluded from any AI tool operation */
const ALWAYS_EXCLUDED = ['node_modules', '.git', 'out', 'dist', '.vscode', '.next', '__pycache__', '.cache'];

export class ToolExecutor {
    private guardrails: WorkspaceGuardrails;
    private pendingEdits: Map<string, PendingEdit> = new Map();

    constructor(guardrails: WorkspaceGuardrails) {
        this.guardrails = guardrails;
    }

    /**
     * Execute a tool call from the agent.
     * Write operations (proposeFileEdit) are queued — never auto-executed.
     */
    public async execute(tool: ToolCall): Promise<ToolResult> {
        switch (tool.name) {
            case 'listFiles':
                return this.listFiles(tool.args.dirPath || '.');

            case 'readFile':
                return this.readFile(tool.args.filePath);

            case 'createFile':
            case 'create_file':
            case 'writeFile':
            case 'write_file':
                return this.createFile(
                    tool.args.filePath || tool.args.filename || tool.args.path,
                    tool.args.content !== undefined ? tool.args.content : (tool.args.newContent || ''),
                    tool.args.description || `Create new file: ${tool.args.filePath || tool.args.filename || ''}`
                );

            case 'proposeFileEdit':
                return this.proposeFileEdit(
                    tool.args.filePath,
                    tool.args.newContent,
                    tool.args.description || 'AI-proposed edit'
                );

            case 'searchFiles':
                return this.searchFiles(tool.args.query, tool.args.dirPath);

            case 'getActiveFileContext':
                return this.getActiveFileContext();

            default:
                return {
                    toolName: tool.name as ToolName,
                    success: false,
                    output: `Unknown tool: ${tool.name}`
                };
        }
    }

    // ─── Tool Implementations ─────────────────────────────────────────────────

    private async listFiles(dirPath: string): Promise<ToolResult> {
        const root = this.guardrails.getWorkspaceRoot();
        if (!root) {
            return { toolName: 'listFiles', success: false, output: 'No workspace folder selected. Ask the user to pick a project folder first.' };
        }

        const validation = this.guardrails.validatePath(dirPath === '.' ? '' : dirPath);
        if (!validation.allowed) {
            return { toolName: 'listFiles', success: false, output: validation.reason || 'Access denied.', blocked: true };
        }

        try {
            const absPath = dirPath === '.' ? root : path.resolve(root, dirPath);
            const uri = vscode.Uri.file(absPath);
            const entries = await vscode.workspace.fs.readDirectory(uri);

            const lines: string[] = [`Contents of ${dirPath === '.' ? '(workspace root)' : dirPath}:`];
            for (const [name, fileType] of entries) {
                if (ALWAYS_EXCLUDED.some(ex => name === ex)) continue;
                const icon = fileType === vscode.FileType.Directory ? '[DIR]' : '[FILE]';
                lines.push(`  ${icon} ${name}`);
            }

            return { toolName: 'listFiles', success: true, output: lines.join('\n') };
        } catch (err: any) {
            return { toolName: 'listFiles', success: false, output: `Failed to list files: ${err?.message || err}` };
        }
    }

    private async readFile(filePath: string): Promise<ToolResult> {
        if (!filePath) {
            return { toolName: 'readFile', success: false, output: 'No file path provided.' };
        }

        const validation = this.guardrails.validatePath(filePath);
        if (!validation.allowed) {
            return { toolName: 'readFile', success: false, output: validation.reason || 'Access denied.', blocked: true };
        }

        const uri = this.guardrails.resolveUri(filePath);
        if (!uri) {
            return { toolName: 'readFile', success: false, output: 'Could not resolve file path in workspace.' };
        }

        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            const content = new TextDecoder().decode(bytes);

            if (validation.isSensitive) {
                // Sensitive files: allow read but flag in output so agent notes the warning
                return {
                    toolName: 'readFile',
                    success: true,
                    output: `[SENSITIVE FILE WARNING: ${validation.reason}]\n\n--- ${filePath} ---\n${content.substring(0, 8000)}`
                };
            }

            // Limit to 12 KB to prevent huge files filling context window
            const truncated = content.length > 12000;
            const snippet = truncated ? content.substring(0, 12000) + '\n\n[... truncated — file is large. Ask to read a specific line range if needed]' : content;
            return { toolName: 'readFile', success: true, output: `--- ${filePath} ---\n${snippet}` };
        } catch (err: any) {
            return { toolName: 'readFile', success: false, output: `Could not read file "${filePath}": ${err?.message || err}` };
        }
    }

    private async createFile(filePath: string, content: string, description: string): Promise<ToolResult> {
        if (!filePath) {
            return { toolName: 'createFile', success: false, output: 'File path is required.' };
        }

        const validation = this.guardrails.validatePath(filePath);
        if (!validation.allowed) {
            return { toolName: 'createFile', success: false, output: validation.reason || 'Write access denied.', blocked: true };
        }

        const editId = `create_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const pending: PendingEdit = {
            editId,
            filePath,
            originalContent: '',
            proposedContent: content,
            description: description || `Create new file: ${filePath}`
        };

        this.pendingEdits.set(editId, pending);

        return {
            toolName: 'createFile',
            success: true,
            output: `New file creation prepared for "${filePath}". Prompting user to approve and save to workspace.`,
            pendingEdit: pending
        };
    }

    private async proposeFileEdit(filePath: string, newContent: string, description: string): Promise<ToolResult> {
        if (!filePath || newContent === undefined) {
            return { toolName: 'proposeFileEdit', success: false, output: 'filePath and newContent are required.' };
        }

        const validation = this.guardrails.validatePath(filePath);
        if (!validation.allowed) {
            return { toolName: 'proposeFileEdit', success: false, output: validation.reason || 'Write access denied.', blocked: true };
        }

        // Read original content (may not exist for new files)
        let originalContent = '';
        let isNewFile = false;
        const uri = this.guardrails.resolveUri(filePath);
        if (uri) {
            try {
                const bytes = await vscode.workspace.fs.readFile(uri);
                originalContent = new TextDecoder().decode(bytes);
            } catch {
                isNewFile = true;
            }
        }

        const editId = `edit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const pending: PendingEdit = {
            editId,
            filePath,
            originalContent,
            proposedContent: newContent,
            description
        };

        this.pendingEdits.set(editId, pending);

        // Return a result that tells the router to show the diff UI
        return {
            toolName: 'proposeFileEdit',
            success: true,
            output: isNewFile
                ? `New file proposed: ${filePath}\n${description}\nWaiting for user approval.`
                : `Edit proposed for ${filePath}\n${description}\nWaiting for user approval.`,
            pendingEdit: pending
        };
    }

    private async searchFiles(query: string, dirPath?: string): Promise<ToolResult> {
        if (!query) {
            return { toolName: 'searchFiles', success: false, output: 'Search query is required.' };
        }

        const root = this.guardrails.getWorkspaceRoot();
        if (!root) {
            return { toolName: 'searchFiles', success: false, output: 'No workspace folder selected.' };
        }

        try {
            const pattern = dirPath ? `${dirPath}/**` : '**';
            const exclude = `{${ALWAYS_EXCLUDED.map(d => `**/${d}/**`).join(',')}}`;
            const files = await vscode.workspace.findFiles(pattern, exclude, 50);

            const results: string[] = [];
            const lowerQuery = query.toLowerCase();

            for (const file of files) {
                const relPath = this.guardrails.toRelative(file.fsPath);
                const validation = this.guardrails.validatePath(relPath);
                if (!validation.allowed || validation.isBlocked) continue;

                try {
                    const bytes = await vscode.workspace.fs.readFile(file);
                    const text = new TextDecoder().decode(bytes);
                    const lines = text.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].toLowerCase().includes(lowerQuery)) {
                            results.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
                            if (results.length >= 20) break;
                        }
                    }
                } catch {
                    // skip unreadable files
                }
                if (results.length >= 20) break;
            }

            if (results.length === 0) {
                return { toolName: 'searchFiles', success: true, output: `No matches found for "${query}" in workspace.` };
            }

            return {
                toolName: 'searchFiles',
                success: true,
                output: `Search results for "${query}":\n${results.join('\n')}`
            };
        } catch (err: any) {
            return { toolName: 'searchFiles', success: false, output: `Search failed: ${err?.message || err}` };
        }
    }

    private async getActiveFileContext(): Promise<ToolResult> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return { toolName: 'getActiveFileContext', success: false, output: 'No active file open in the editor.' };
        }

        const document = editor.document;
        const filePath = this.guardrails.toRelative(document.fileName);
        const validation = this.guardrails.validatePath(filePath);

        if (!validation.allowed) {
            return { toolName: 'getActiveFileContext', success: false, output: validation.reason || 'Access denied.', blocked: true };
        }

        const content = document.getText();
        const cursor = editor.selection.active;
        const selection = editor.selection.isEmpty ? '' : document.getText(editor.selection);
        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        const errors = diagnostics
            .filter(d => d.severity === vscode.DiagnosticSeverity.Error || d.severity === vscode.DiagnosticSeverity.Warning)
            .map(d => `  Line ${d.range.start.line + 1}: [${d.severity === 0 ? 'ERROR' : 'WARN'}] ${d.message}`)
            .join('\n');

        const truncatedContent = content.length > 12000
            ? content.substring(0, 12000) + '\n[... truncated]'
            : content;

        const output = [
            `File: ${filePath}`,
            `Language: ${document.languageId}`,
            `Cursor: Line ${cursor.line + 1}, Column ${cursor.character + 1}`,
            selection ? `Selected text:\n${selection}` : '',
            errors ? `Diagnostics (errors/warnings):\n${errors}` : 'No diagnostics.',
            `\n--- File contents ---\n${truncatedContent}`
        ].filter(Boolean).join('\n');

        return { toolName: 'getActiveFileContext', success: true, output };
    }

    // ─── Pending Edit Management ──────────────────────────────────────────────

    public getPendingEdit(editId: string): PendingEdit | undefined {
        return this.pendingEdits.get(editId);
    }

    public async approveEdit(editId: string): Promise<{ success: boolean; bytesWritten: number; path: string }> {
        const edit = this.pendingEdits.get(editId);
        if (!edit) {
            throw new Error(`No pending edit found with ID: ${editId}`);
        }

        const uri = this.guardrails.resolveUri(edit.filePath);
        if (!uri) {
            throw new Error(`Cannot resolve file path: ${edit.filePath}`);
        }

        const bytes = new TextEncoder().encode(edit.proposedContent);
        await vscode.workspace.fs.writeFile(uri, bytes);
        this.pendingEdits.delete(editId);

        return { success: true, bytesWritten: bytes.length, path: edit.filePath };
    }

    public rejectEdit(editId: string): void {
        this.pendingEdits.delete(editId);
    }
}
