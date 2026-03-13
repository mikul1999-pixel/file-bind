import * as vscode from 'vscode';
import { MAX_SLOT_COUNT } from './constants';

function getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('file-bind');
}

export function getSlotCount(): number {
    const count = getConfig().get<number>('slotCount', 3);
    return Math.min(Math.max(count, 1), MAX_SLOT_COUNT);
}

export function getPreviewLimit(): number {
    return Math.min(
        Math.max(getConfig().get<number>('statusPreviewLimit', 3), 0),
        getSlotCount()
    );
}
