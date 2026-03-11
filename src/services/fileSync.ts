import * as path from 'path';
import * as vscode from 'vscode';
import type { SlotStore } from './slotStore';
import type { SlotUpdate } from '../types/slots';
import { getWorkspaceFolder } from '../utils/workspace';

export function registerFileWatchers(
    context: vscode.ExtensionContext,
    slotStore: SlotStore,
    updateStatusBar: () => void
): void {
    // File watchers
    context.subscriptions.push(
        vscode.workspace.onDidDeleteFiles(async (e) => {
            await handleFileDeletes(e, slotStore, updateStatusBar);
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidRenameFiles(async (e) => {
            await handleFileRenames(e, slotStore, updateStatusBar);
        })
    );
}

async function handleFileDeletes(
    e: vscode.FileDeleteEvent,
    slotStore: SlotStore,
    updateStatusBar: () => void
): Promise<void> {
    // Clear slots for deleted files
    const slots = slotStore.getSlots();
    const workspaceFolder = getWorkspaceFolder();
    if (!workspaceFolder) {
        return;
    }

    const clearedSlots: string[] = [];
    const updatedSlots = { ...slots };

    for (const [slot, binding] of Object.entries(slots)) {
        const fullPath = path.join(workspaceFolder.uri.fsPath, binding.filePath);
        const deletedFile = e.files.find((uri) => uri.fsPath === fullPath);

        if (deletedFile) {
            delete updatedSlots[slot];
            clearedSlots.push(slot);
        }
    }

    if (clearedSlots.length === 0) {
        return;
    }

    await slotStore.saveSlots(updatedSlots);
    updateStatusBar();
    showDeletionMessage(clearedSlots);
}

async function handleFileRenames(
    e: vscode.FileRenameEvent,
    slotStore: SlotStore,
    updateStatusBar: () => void
): Promise<void> {
    // Update slot paths for renamed files
    const slots = slotStore.getSlots();
    const workspaceFolder = getWorkspaceFolder();
    if (!workspaceFolder) {
        return;
    }

    const updatedSlots = { ...slots };
    const updates: SlotUpdate[] = [];

    for (const [slot, binding] of Object.entries(slots)) {
        const fullPath = path.join(workspaceFolder.uri.fsPath, binding.filePath);
        const renamedFile = e.files.find((file) => file.oldUri.fsPath === fullPath);

        if (!renamedFile) {
            continue;
        }

        const newRelativePath = path.relative(
            workspaceFolder.uri.fsPath,
            renamedFile.newUri.fsPath
        );

        updatedSlots[slot] = {
            ...binding,
            filePath: newRelativePath
        };

        updates.push({
            slot,
            oldName: path.basename(binding.filePath),
            newName: path.basename(newRelativePath)
        });
    }

    if (updates.length === 0) {
        return;
    }

    await slotStore.saveSlots(updatedSlots);
    updateStatusBar();
    showRenameMessage(updates);
}

function showDeletionMessage(clearedSlots: string[]): void {
    // Delete notifications
    if (clearedSlots.length === 1) {
        vscode.window.showWarningMessage(
            `File Bind: Slot ${clearedSlots[0]} file deleted`
        );
        return;
    }

    vscode.window.showWarningMessage(
        `File Bind: Slots ${clearedSlots.join(', ')} files deleted`
    );
}

function showRenameMessage(updates: SlotUpdate[]): void {
    // Rename notifications
    if (updates.length === 1) {
        const update = updates[0];
        vscode.window.showInformationMessage(
            `File Bind: Slot ${update.slot} updated (${update.oldName} -> ${update.newName})`
        );
        return;
    }

    vscode.window.showInformationMessage(
        `File Bind: ${updates.length} slots updated for renamed files`
    );
}
