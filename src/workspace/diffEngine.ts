import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceGuardrails } from './guardrails';

export interface DiffHunk {
    type: 'add' | 'remove' | 'unchanged';
    lineNumber: number;         // 1-based line number in original (for remove/unchanged) or new (for add)
    content: string;
}

export interface FileDiff {
    relativePath: string;
    originalContent: string;
    proposedContent: string;
    hunks: DiffHunk[];
    isNewFile: boolean;
    linesAdded: number;
    linesRemoved: number;
}

export interface PendingEdit {
    id: string;
    createdAt: number;
    diff: FileDiff;
    status: 'pending' | 'approved' | 'rejected';
}

/**
 * Produces a simple unified-diff style hunk list from two text strings.
 * Uses a line-by-line LCS diff — no external dependencies.
 */
function computeHunks(original: string, proposed: string): DiffHunk[] {
    const origLines = original.split('\n');
    const propLines = proposed.split('\n');

    // Simple Myers-style patience diff implementation
    const hunks: DiffHunk[] = [];

    // Build LCS table
    const m = origLines.length;
    const n = propLines.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (origLines[i - 1] === propLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Traceback
    let i = m, j = n;
    const ops: Array<{ type: 'unchanged' | 'add' | 'remove'; origLine?: number; newLine?: number; content: string }> = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && origLines[i - 1] === propLines[j - 1]) {
            ops.unshift({ type: 'unchanged', origLine: i, newLine: j, content: origLines[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            ops.unshift({ type: 'add', newLine: j, content: propLines[j - 1] });
            j--;
        } else {
            ops.unshift({ type: 'remove', origLine: i, content: origLines[i - 1] });
            i--;
        }
    }

    // Convert to DiffHunk array
    for (const op of ops) {
        hunks.push({
            type: op.type,
            lineNumber: op.type === 'add' ? (op.newLine ?? 0) : (op.origLine ?? 0),
            content: op.content
        });
    }

    return hunks;
}

export class DiffEngine {
    private pendingEdits: Map<string, PendingEdit> = new Map();

    constructor(private guardrails: WorkspaceGuardrails) {}

    /**
     * Proposes a file edit. Reads the current file content (or treats as new),
     * computes the diff, and stores it as a pending edit awaiting user approval.
     * Returns the PendingEdit for display in the webview.
     */
    public async proposeEdit(relativePath: string, proposedContent: string): Promise<PendingEdit> {
        const root = this.guardrails.getWorkspaceRoot();
        if (!root) throw new Error('No workspace folder selected.');

        const validation = this.guardrails.validatePath(relativePath);
        if (!validation.allowed) {
            throw new Error(validation.reason || 'Access denied.');
        }

        const absPath = path.resolve(root, relativePath);
        const uri = vscode.Uri.file(absPath);

        let originalContent = '';
        let isNewFile = false;

        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            originalContent = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        } catch {
            isNewFile = true;
        }

        const hunks = computeHunks(originalContent, proposedContent);
        const linesAdded = hunks.filter(h => h.type === 'add').length;
        const linesRemoved = hunks.filter(h => h.type === 'remove').length;

        const edit: PendingEdit = {
            id: `edit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            createdAt: Date.now(),
            diff: {
                relativePath,
                originalContent,
                proposedContent,
                hunks,
                isNewFile,
                linesAdded,
                linesRemoved
            },
            status: 'pending'
        };

        this.pendingEdits.set(edit.id, edit);
        return edit;
    }

    /**
     * User approved the edit. Writes the proposed content to disk.
     * Returns the number of bytes written.
     */
    public async approveEdit(editId: string): Promise<{ bytesWritten: number; path: string }> {
        const edit = this.pendingEdits.get(editId);
        if (!edit) throw new Error(`Edit ID "${editId}" not found.`);
        if (edit.status !== 'pending') throw new Error(`Edit "${editId}" is already ${edit.status}.`);

        const root = this.guardrails.getWorkspaceRoot();
        if (!root) throw new Error('No workspace folder selected.');

        const absPath = path.resolve(root, edit.diff.relativePath);
        const uri = vscode.Uri.file(absPath);

        // Ensure parent directory exists
        const parentUri = vscode.Uri.file(path.dirname(absPath));
        try {
            await vscode.workspace.fs.createDirectory(parentUri);
        } catch {
            // already exists
        }

        const bytes = new TextEncoder().encode(edit.diff.proposedContent);
        await vscode.workspace.fs.writeFile(uri, bytes);

        edit.status = 'approved';
        return { bytesWritten: bytes.byteLength, path: edit.diff.relativePath };
    }

    /**
     * User rejected the edit. Marks it rejected without writing anything.
     */
    public rejectEdit(editId: string): void {
        const edit = this.pendingEdits.get(editId);
        if (edit) {
            edit.status = 'rejected';
        }
    }

    public getPendingEdit(id: string): PendingEdit | undefined {
        return this.pendingEdits.get(id);
    }

    public getAllPendingEdits(): PendingEdit[] {
        return Array.from(this.pendingEdits.values()).filter(e => e.status === 'pending');
    }

    public clearCompleted(): void {
        for (const [id, edit] of this.pendingEdits) {
            if (edit.status !== 'pending') {
                this.pendingEdits.delete(id);
            }
        }
    }
}
