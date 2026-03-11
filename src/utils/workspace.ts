import * as path from 'path';
import * as vscode from 'vscode';

export function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.workspaceFolders?.[0];
}

export function getWorkspaceRelativePath(filePath: string): string | null {
    const workspaceFolder = getWorkspaceFolder();
    if (!workspaceFolder) {
        return null;
    }

    const relativePath = path.relative(workspaceFolder.uri.fsPath, filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return null;
    }

    return relativePath;
}

export function getActiveFilePath(): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return null;
    }

    return getWorkspaceRelativePath(editor.document.uri.fsPath);
}
