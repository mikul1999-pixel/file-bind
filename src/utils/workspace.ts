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
    if (!isWorkspaceRelativePath(relativePath)) {
        return null;
    }

    return relativePath;
}

export function isWorkspaceRelativePath(filePath: string): boolean {
    if (!filePath || path.isAbsolute(filePath)) {
        return false;
    }

    const normalized = path.normalize(filePath);
    if (normalized === '' || normalized === '.' || normalized === '..') {
        return false;
    }

    return !normalized.startsWith(`..${path.sep}`) && normalized !== '..';
}

export function resolveWorkspaceFilePath(filePath: string): string | null {
    const workspaceFolder = getWorkspaceFolder();
    if (!workspaceFolder || !isWorkspaceRelativePath(filePath)) {
        return null;
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;
    const resolvedPath = path.resolve(workspaceRoot, filePath);
    const relativeToRoot = path.relative(workspaceRoot, resolvedPath);
    if (relativeToRoot.startsWith(`..${path.sep}`) || relativeToRoot === '..' || path.isAbsolute(relativeToRoot)) {
        return null;
    }

    return resolvedPath;
}

export function getActiveFilePath(): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return null;
    }

    return getWorkspaceRelativePath(editor.document.uri.fsPath);
}
