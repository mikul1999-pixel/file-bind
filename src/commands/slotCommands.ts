import * as path from 'path';
import * as vscode from 'vscode';
import type { SlotBinding, SlotRecord } from '../types/slots';
import type { SlotStore } from '../services/slotStore';
import { clampPosition } from '../utils/positions';
import { findSlotByPath, getSlotKey, isSlotEnabled } from '../utils/slots';
import { getSlotCount } from '../config/settings';
import {
    getWorkspaceFolder,
    getWorkspaceRelativePath,
    resolveWorkspaceFilePath
} from '../utils/workspace';

export function registerSlotCommands(
    context: vscode.ExtensionContext,
    slotStore: SlotStore,
    updateStatusBar: () => void
): void {
    // Slot commands
    context.subscriptions.push(registerPinCommand(slotStore, updateStatusBar));
    context.subscriptions.push(registerJumpCommand(slotStore, updateStatusBar));
    context.subscriptions.push(registerClearCommand(slotStore, updateStatusBar));
}

// Pin current file to slot
function registerPinCommand(
    slotStore: SlotStore,
    updateStatusBar: () => void
): vscode.Disposable {
    return vscode.commands.registerCommand('file-bind.pinToSlot', async (slotNumber?: number) => {
        const resolvedSlotNumber = await resolveSlot(slotStore, slotNumber);
        if (!resolvedSlotNumber) {
            return;
        }

        if (!isSlotEnabled(resolvedSlotNumber)) {
            showSlotDisabledWarning(resolvedSlotNumber);
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active file to bind');
            return;
        }

        const filePath = editor.document.uri.fsPath;
        const relativePath = getWorkspaceRelativePath(filePath);
        if (!relativePath) {
            vscode.window.showWarningMessage('File must be in workspace');
            return;
        }

        const position = editor.selection.active;
        await pinFileToSlot(slotStore, resolvedSlotNumber, relativePath, filePath, position);
        updateStatusBar();
    });
}

async function pinFileToSlot(
    slotStore: SlotStore,
    slotNumber: number,
    relativePath: string,
    fullPath: string,
    position: vscode.Position
): Promise<void> {
    // Move existing binding if file is already pinned
    const slots = slotStore.getSlots();
    const fileName = path.basename(fullPath);

    const existingSlot = findSlotByPath(slots, relativePath)?.[0];
    if (existingSlot && existingSlot !== getSlotKey(slotNumber)) {
        await moveSlot(slotStore, slots, existingSlot, slotNumber, relativePath, fileName, position);
        return;
    }

    await updateSlot(slotStore, slotNumber, relativePath, fileName, position, slots);
}

async function moveSlot(
    slotStore: SlotStore,
    slots: SlotRecord,
    fromSlot: string,
    toSlot: number,
    relativePath: string,
    fileName: string,
    position: vscode.Position
): Promise<void> {
    const updatedSlots = { ...slots };
    delete updatedSlots[fromSlot];
    updatedSlots[getSlotKey(toSlot)] = {
        filePath: relativePath,
        line: position.line,
        character: position.character,
        mode: slots[fromSlot]?.mode ?? 'auto'
    };

    await slotStore.saveSlots(updatedSlots);
    vscode.window.showInformationMessage(
        `Moved ${fileName} (line ${position.line + 1}) from Slot ${fromSlot} to Slot ${toSlot}`
    );
}

async function updateSlot(
    slotStore: SlotStore,
    slotNumber: number,
    relativePath: string,
    fileName: string,
    position: vscode.Position,
    slots: SlotRecord
): Promise<void> {
    const slotKey = getSlotKey(slotNumber);
    const oldBinding = slots[slotKey];
    const updatedSlots = { ...slots };
    updatedSlots[slotKey] = {
        filePath: relativePath,
        line: position.line,
        character: position.character,
        mode: oldBinding?.mode ?? 'auto'
    };

    await slotStore.saveSlots(updatedSlots);

    if (oldBinding) {
        const oldFileName = path.basename(oldBinding.filePath);
        vscode.window.showInformationMessage(
            `Slot ${slotNumber}: ${oldFileName} -> ${fileName} (line ${position.line + 1})`
        );
        return;
    }

    vscode.window.showInformationMessage(
        `Bound ${fileName} (line ${position.line + 1}) to Slot ${slotNumber}`
    );
}

// Jump to slot
function registerJumpCommand(
    slotStore: SlotStore,
    updateStatusBar: () => void
): vscode.Disposable {
    return vscode.commands.registerCommand('file-bind.jumpToSlot', async (slotNumber?: number) => {
        const resolvedSlotNumber = await resolveSlot(slotStore, slotNumber);
        if (!resolvedSlotNumber) {
            return;
        }

        if (!isSlotEnabled(resolvedSlotNumber)) {
            showSlotDisabledWarning(resolvedSlotNumber);
            return;
        }

        const slots = slotStore.getSlots();
        const binding = slots[getSlotKey(resolvedSlotNumber)];
        if (!binding) {
            vscode.window.showWarningMessage(
                `Slot ${resolvedSlotNumber} is empty. Bind a file with Alt+Shift+${resolvedSlotNumber}`
            );
            return;
        }

        if (!getWorkspaceFolder()) {
            vscode.window.showWarningMessage('No workspace folder open');
            return;
        }

        await openFile(binding.filePath, binding, resolvedSlotNumber, slots, slotStore, updateStatusBar);
    });
}

// Open file and restore saved cursor
async function openFile(
    relativePath: string,
    binding: SlotBinding,
    slotNumber: number,
    slots: SlotRecord,
    slotStore: SlotStore,
    updateStatusBar: () => void
): Promise<void> {
    const fullPath = resolveWorkspaceFilePath(relativePath);
    if (!fullPath) {
        await clearSlot(slotStore, slotNumber, slots);
        updateStatusBar();
        vscode.window.showWarningMessage(
            `File Bind: Slot ${slotNumber} had an invalid path and was cleared`
        );
        return;
    }

    const uri = vscode.Uri.file(fullPath);

    try {
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);
        const position = clampPosition(document, binding.line, binding.character);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
        );
    } catch (error) {
        if (error instanceof vscode.FileSystemError) {
            await handleOpenFileError(fullPath, slotNumber, slots, slotStore, updateStatusBar);
            return;
        }

        vscode.window.showErrorMessage(`Unexpected error opening file: ${error}`);
    }
}

// Ask to clear slot when file cannot be opened
async function handleOpenFileError(
    fullPath: string,
    slotNumber: number,
    slots: SlotRecord,
    slotStore: SlotStore,
    updateStatusBar: () => void
): Promise<void> {
    // Offer cleanup when a bound file no longer exists.
    const fileName = path.basename(fullPath);
    vscode.window.showErrorMessage(
        `Could not open ${fileName}. File may have been deleted.`
    );

    const choice = await vscode.window.showWarningMessage(
        `Clear Slot ${slotNumber}?`,
        'Yes',
        'No'
    );

    if (choice !== 'Yes') {
        return;
    }

    await clearSlot(slotStore, slotNumber, slots);
    updateStatusBar();
    vscode.window.showInformationMessage(`Slot ${slotNumber} cleared`);
}

// Clear slot
function registerClearCommand(
    slotStore: SlotStore,
    updateStatusBar: () => void
): vscode.Disposable {
    return vscode.commands.registerCommand('file-bind.clearSlot', async (slotNumber?: number) => {
        const resolvedSlotNumber = await resolveSlot(slotStore, slotNumber);
        if (!resolvedSlotNumber) {
            return;
        }

        if (!isSlotEnabled(resolvedSlotNumber)) {
            showSlotDisabledWarning(resolvedSlotNumber);
            return;
        }

        const slots = slotStore.getSlots();
        const binding = slots[getSlotKey(resolvedSlotNumber)];
        if (!binding) {
            vscode.window.showInformationMessage(
                `Slot ${resolvedSlotNumber} is already empty`
            );
            return;
        }

        const fileName = path.basename(binding.filePath);
        await clearSlot(slotStore, resolvedSlotNumber, slots);

        vscode.window.showInformationMessage(
            `Cleared ${fileName} from Slot ${resolvedSlotNumber}`
        );
        updateStatusBar();
    });
}

async function clearSlot(slotStore: SlotStore, slotNumber: number, slots: SlotRecord): Promise<void> {
    const updatedSlots = { ...slots };
    delete updatedSlots[getSlotKey(slotNumber)];
    await slotStore.saveSlots(updatedSlots);
}

async function resolveSlot(slotStore: SlotStore, slotNumber?: number): Promise<number | undefined> {
    // Resolve from keybind args or quick pick
    if (slotNumber !== undefined) {
        if (!Number.isInteger(slotNumber) || slotNumber < 1 || !isSlotEnabled(slotNumber)) {
            return undefined;
        }

        return slotNumber;
    }

    const slots = slotStore.getSlots();
    const slotCount = getSlotCount();
    const items = Array.from({ length: slotCount }, (_, i) => {
        const slot = i + 1;
        const binding = slots[getSlotKey(slot)];

        return {
            label: `Slot ${slot}`,
            description: binding ? binding.filePath : 'Empty',
            slot
        };
    });

    const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select slot' });
    return picked?.slot;
}

function showSlotDisabledWarning(slotNumber: number): void {
    vscode.window.showWarningMessage(
        `Slot ${slotNumber} is disabled. Enable it in settings (current limit: ${getSlotCount()})`
    );
}
