import * as vscode from 'vscode';
import * as path from 'path';

interface SlotBinding {
    filePath: string;
    line: number;
    character: number;
    mode?: "auto" | "static";
}

type SlotRecord = Record<string, SlotBinding>;

interface SlotUpdate {
    slot: string;
    oldName: string;
    newName: string;
}

const MAX_SLOT_COUNT = 9;
const STATUS_BAR_ICONS = [
    '$(go-to-file)',
    '$(go-to-file)',
    '$(go-to-file)',
    '$(go-to-file)',
    '$(go-to-file)',
    '$(go-to-file)',
    '$(go-to-file)',
    '$(go-to-file)',
    '$(go-to-file)'
] as const;

export function activate(context: vscode.ExtensionContext): void {
    console.log('File Bind extension is now active');

    const statusBarItem = createStatusBar(context);
    const updateStatusBar = (): void => {
        updateStatusBarDisplay(statusBarItem, getSlots());
    };

    updateStatusBar();
    registerConfigurationWatcher(context, updateStatusBar);
    registerFileWatchers(context, updateStatusBar);
    registerCommands(context, updateStatusBar);

    // Track when user leaves a file
    let lastEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(async newEditor => {
            if (lastEditor && lastEditor !== newEditor) {
                await handleEditorLeave(lastEditor, updateStatusBar);
            }
            lastEditor = newEditor ?? undefined;
        })
    );
}

export function deactivate(): void {}

// Auto-update cursor position when leaving a file
async function handleEditorLeave(
    editor: vscode.TextEditor,
    updateStatusBar: () => void
): Promise<void> {
    const document = editor.document;
    const filePath = document.uri.fsPath;
    const relative = getWorkspaceRelativePath(filePath);
    if (!relative) {return;}

    const slots = getSlots();
    const slotEntry = Object.entries(slots).find(
        ([_, binding]) => binding.filePath === relative
    );
    if (!slotEntry) {return;}

    const [slotNumber, binding] = slotEntry;

    // Only update if mode is auto
    const mode = binding.mode ?? "auto";
    if (mode !== "auto") {return;}

    const position = editor.selection.active;

    const updatedSlots = { ...slots };
    updatedSlots[slotNumber] = {
        ...binding,
        line: position.line,
        character: position.character
    };

    const config = getConfig();
    await config.update('slots', updatedSlots, vscode.ConfigurationTarget.Workspace);

    updateStatusBar();
}

// Status bar
function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.command = 'file-bind.showStatus';
    statusBarItem.tooltip = 'Click to view all file bindings';
    context.subscriptions.push(statusBarItem);
    return statusBarItem;
}

function updateStatusBarDisplay(statusBarItem: vscode.StatusBarItem, slots: SlotRecord): void {
    const slotCount = getSlotCount();
    const previewLimit = getPreviewLimit();

    const slotTexts = Array.from({ length: slotCount }, (_, i) => {
        const slotNumber = i + 1;
        const binding = slots[slotNumber.toString()];
        
        if (binding) {
            const fileName = path.basename(binding.filePath);
            const icon = STATUS_BAR_ICONS[i];
            return `${icon} ${slotNumber} ${fileName}:${binding.line + 1}`;
        }
        return null;
    }).filter((text): text is string => text !== null);

    if (slotTexts.length > 0) {
        const visible = slotTexts.slice(0, previewLimit);
        const overflow = slotTexts.length - previewLimit;

        if (overflow > 0) {
            visible.push(`+${overflow}`);
        }

        statusBarItem.text = visible.join('  ');
        statusBarItem.show();
    } else {
        statusBarItem.hide();
    }
}

// Config watcher
function registerConfigurationWatcher(
    context: vscode.ExtensionContext,
    updateStatusBar: () => void
): void {
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('file-bind.slots') || 
                e.affectsConfiguration('file-bind.slotCount') ||
                e.affectsConfiguration('file-bind.statusPreviewLimit')) {
                updateStatusBar();
            }
        })
    );
}

// File watchers
function registerFileWatchers(
    context: vscode.ExtensionContext,
    updateStatusBar: () => void
): void {
    context.subscriptions.push(
        vscode.workspace.onDidDeleteFiles(async e => {
            await handleFileDeletes(e, updateStatusBar);
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidRenameFiles(async e => {
            await handleFileRenames(e, updateStatusBar);
        })
    );
}

async function handleFileDeletes(
    e: vscode.FileDeleteEvent,
    updateStatusBar: () => void
): Promise<void> {
    const config = getConfig();
    const slots = getSlots();
    const workspaceFolder = getWorkspaceFolder();
    
    if (!workspaceFolder) {return;}

    const clearedSlots: string[] = [];
    const updatedSlots = { ...slots };

    for (const [slot, binding] of Object.entries(slots)) {
        const fullPath = path.join(workspaceFolder.uri.fsPath, binding.filePath);
        const deletedFile = e.files.find(uri => uri.fsPath === fullPath);
        
        if (deletedFile) {
            delete updatedSlots[slot];
            clearedSlots.push(slot);
        }
    }
    
    if (clearedSlots.length > 0) {
        await config.update('slots', updatedSlots, vscode.ConfigurationTarget.Workspace);
        updateStatusBar();
        showDeletionMessage(clearedSlots);
    }
}

async function handleFileRenames(
    e: vscode.FileRenameEvent,
    updateStatusBar: () => void
): Promise<void> {
    const config = getConfig();
    const slots = getSlots();
    const workspaceFolder = getWorkspaceFolder();
    
    if (!workspaceFolder) {return;}

    const updatedSlots = { ...slots };
    const updates: SlotUpdate[] = [];

    for (const [slot, binding] of Object.entries(slots)) {
        const fullPath = path.join(workspaceFolder.uri.fsPath, binding.filePath);
        const renamedFile = e.files.find(file => file.oldUri.fsPath === fullPath);
        
        if (renamedFile) {
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
    }
    
    if (updates.length > 0) {
        await config.update('slots', updatedSlots, vscode.ConfigurationTarget.Workspace);
        updateStatusBar();
        showRenameMessage(updates);
    }
}

// Commands
function registerCommands(
    context: vscode.ExtensionContext,
    updateStatusBar: () => void
): void {
    for (let i = 1; i <= MAX_SLOT_COUNT; i++) {
        context.subscriptions.push(registerPinCommand(i, updateStatusBar));
        context.subscriptions.push(registerJumpCommand(i, updateStatusBar));
        context.subscriptions.push(registerClearCommand(i, updateStatusBar));
    }

    context.subscriptions.push(registerShowStatusCommand());
    context.subscriptions.push(registerConfigureKeybindingsCommand());
}

function registerPinCommand(
    slotNumber: number,
    updateStatusBar: () => void
): vscode.Disposable {
    return vscode.commands.registerCommand(
        `file-bind.pinToSlot${slotNumber}`,
        async () => {
            const slotCount = getSlotCount();
            if (slotNumber > slotCount) {
                vscode.window.showWarningMessage(
                    `Slot ${slotNumber} is disabled. Enable it in settings (current limit: ${slotCount})`
                );
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
            await pinFileToSlot(slotNumber, relativePath, filePath, position);
            updateStatusBar();
        }
    );
}

// Pin file to slot
async function pinFileToSlot(
    slotNumber: number,
    relativePath: string,
    fullPath: string,
    position: vscode.Position
): Promise<void> {
    const config = getConfig();
    const slots = getSlots();
    const fileName = path.basename(fullPath);
    
    const existingSlot = Object.entries(slots).find(
        ([_, binding]) => binding.filePath === relativePath
    )?.[0];
    
    if (existingSlot && existingSlot !== slotNumber.toString()) {
        await moveSlot(existingSlot, slotNumber, relativePath, fileName, position);
    } else {
        await updateSlot(slotNumber, relativePath, fileName, position, slots);
    }
}

// Move file to new slot
async function moveSlot(
    fromSlot: string,
    toSlot: number,
    relativePath: string,
    fileName: string,
    position: vscode.Position
): Promise<void> {
    const config = getConfig();
    const slots = getSlots();
    const updatedSlots = { ...slots };
    
    delete updatedSlots[fromSlot];
    updatedSlots[toSlot.toString()] = {
        filePath: relativePath,
        line: position.line,
        character: position.character,
        mode: slots[fromSlot]?.mode ?? "auto"
    };
    
    await config.update('slots', updatedSlots, vscode.ConfigurationTarget.Workspace);
    vscode.window.showInformationMessage(
        `Moved ${fileName} (line ${position.line + 1}) from Slot ${fromSlot} to Slot ${toSlot}`
    );
}

// Update pin
async function updateSlot(
    slotNumber: number,
    relativePath: string,
    fileName: string,
    position: vscode.Position,
    slots: SlotRecord
): Promise<void> {
    const config = getConfig();
    const oldBinding = slots[slotNumber.toString()];
    const updatedSlots = { ...slots };
    
    updatedSlots[slotNumber.toString()] = {
        filePath: relativePath,
        line: position.line,
        character: position.character,
        mode: oldBinding?.mode ?? "auto"
    };

    await config.update('slots', updatedSlots, vscode.ConfigurationTarget.Workspace);
    
    if (oldBinding) {
        const oldFileName = path.basename(oldBinding.filePath);
        vscode.window.showInformationMessage(
            `Slot ${slotNumber}: ${oldFileName} → ${fileName} (line ${position.line + 1})`
        );
    } else {
        vscode.window.showInformationMessage(
            `Bound ${fileName} (line ${position.line + 1}) to Slot ${slotNumber}`
        );
    }
}

// Jump to slot
function registerJumpCommand(
    slotNumber: number,
    updateStatusBar: () => void
): vscode.Disposable {
    return vscode.commands.registerCommand(
        `file-bind.jumpToSlot${slotNumber}`,
        async () => {
            const slotCount = getSlotCount();
            if (slotNumber > slotCount) {
                vscode.window.showWarningMessage(
                    `Slot ${slotNumber} is disabled. Enable it in settings (current limit: ${slotCount})`
                );
                return;
            }

            const slots = getSlots();
            const binding = slots[slotNumber.toString()];

            if (!binding) {
                vscode.window.showWarningMessage(
                    `Slot ${slotNumber} is empty. Bind a file with Alt+Shift+${slotNumber}`
                );
                return;
            }

            const workspaceFolder = getWorkspaceFolder();
            if (!workspaceFolder) {
                vscode.window.showWarningMessage('No workspace folder open');
                return;
            }

            const fullPath = path.join(workspaceFolder.uri.fsPath, binding.filePath);
            await openFile(fullPath, binding, slotNumber, slots, updateStatusBar);
        }
    );
}

async function openFile(
    fullPath: string,
    binding: SlotBinding,
    slotNumber: number,
    slots: SlotRecord,
    updateStatusBar: () => void
): Promise<void> {
    const uri = vscode.Uri.file(fullPath);

    try {
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);
        
        // Restore cursor position
        const position = new vscode.Position(binding.line, binding.character);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
        );
    } catch (error) {
        await handleOpenFileError(fullPath, slotNumber, slots, updateStatusBar);
    }
}

// Ask to clear slot on error
async function handleOpenFileError(
    fullPath: string,
    slotNumber: number,
    slots: SlotRecord,
    updateStatusBar: () => void
): Promise<void> {
    const fileName = path.basename(fullPath);
    vscode.window.showErrorMessage(
        `Could not open ${fileName}. File may have been deleted.`
    );
    
    const choice = await vscode.window.showWarningMessage(
        `Clear Slot ${slotNumber}?`,
        'Yes',
        'No'
    );
    
    if (choice === 'Yes') {
        await clearSlot(slotNumber, slots);
        updateStatusBar();
        vscode.window.showInformationMessage(`Slot ${slotNumber} cleared`);
    }
}

function registerClearCommand(
    slotNumber: number,
    updateStatusBar: () => void
): vscode.Disposable {
    return vscode.commands.registerCommand(
        `file-bind.clearSlot${slotNumber}`,
        async () => {
            const slotCount = getSlotCount();
            if (slotNumber > slotCount) {
                vscode.window.showWarningMessage(
                    `Slot ${slotNumber} is disabled. Enable it in settings (current limit: ${slotCount})`
                );
                return;
            }

            const slots = getSlots();
            const binding = slots[slotNumber.toString()];
            
            if (!binding) {
                vscode.window.showInformationMessage(
                    `Slot ${slotNumber} is already empty`
                );
                return;
            }

            const fileName = path.basename(binding.filePath);
            await clearSlot(slotNumber, slots);
            
            vscode.window.showInformationMessage(
                `Cleared ${fileName} from Slot ${slotNumber}`
            );
            updateStatusBar();
        }
    );
}

async function clearSlot(slotNumber: number, slots: SlotRecord): Promise<void> {
    const config = getConfig();
    const updatedSlots = { ...slots };
    delete updatedSlots[slotNumber.toString()];
    await config.update('slots', updatedSlots, vscode.ConfigurationTarget.Workspace);
}

// Show bindings in a dropdown
function registerShowStatusCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('file-bind.showStatus', async () => {
        const slots = getSlots();
        const items = createQuickPickItems(slots);
        
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'File Bind Slots',
            title: 'Current File Bindings'
        });
        
        if (selected && selected.label.includes('Slot')) {
            const slotMatch = selected.label.match(/Slot (\d)/);
            if (slotMatch && !selected.label.includes('Empty')) {
                const slotNumber = parseInt(slotMatch[1], 10);
                await vscode.commands.executeCommand(`file-bind.jumpToSlot${slotNumber}`);
            }
        }
    });
}

function createQuickPickItems(slots: SlotRecord): vscode.QuickPickItem[] {
    const slotCount = getSlotCount();
    return Array.from({ length: slotCount }, (_, i) => {
        const slotNumber = i + 1;
        const binding = slots[slotNumber.toString()];
        
        if (binding) {
            const lineInfo = `Line ${binding.line + 1}:${binding.character}`;
            const modeInfo = binding.mode ?? "auto";
            return {
                label: `$(sparkle) Slot ${slotNumber}: ${binding.filePath}`,
                description: `${lineInfo} — ${modeInfo}`
            };
        }
        
        return {
            label: `$(circle-outline) Slot ${slotNumber}: Empty`,
            description: ''
        };
    });
}

// Show user how to change global keybindings
function registerConfigureKeybindingsCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('file-bind.configureKeybindings', () => {
        vscode.commands.executeCommand(
            'workbench.action.openGlobalKeybindings',
            'file-bind'
        );
    });
}

// Helpers
function getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('file-bind');
}

function getSlots(): SlotRecord {
    const config = getConfig();
    const slots = config.get<SlotRecord>('slots', {});
    
    // Migrate string path to SlotBinding type 
    const migratedSlots: SlotRecord = {};
    for (const [key, value] of Object.entries(slots)) {
        if (typeof value === 'string') {
            migratedSlots[key] = {
                filePath: value,
                line: 0,
                character: 0,
                mode: "auto"
            };
        } else {
            migratedSlots[key] = {
                ...value,
                mode: value.mode ?? "auto"
            };
        }
    }
    
    return migratedSlots;
}

function getSlotCount(): number {
    const config = getConfig();
    const count = config.get<number>('slotCount', 3);
    return Math.min(Math.max(count, 1), MAX_SLOT_COUNT);
}

function getPreviewLimit(): number {
    return Math.min(
        Math.max(getConfig().get<number>('statusPreviewLimit', 3), 1),
        getSlotCount()
    );
}

function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.workspaceFolders?.[0];
}

function getWorkspaceRelativePath(filePath: string): string | null {
    const workspaceFolder = getWorkspaceFolder();
    if (!workspaceFolder) {
        return null;
    }
    return path.relative(workspaceFolder.uri.fsPath, filePath);
}

function showDeletionMessage(clearedSlots: string[]): void {
    if (clearedSlots.length === 1) {
        vscode.window.showWarningMessage(
            `File Bind: Slot ${clearedSlots[0]} file deleted`
        );
    } else {
        vscode.window.showWarningMessage(
            `File Bind: Slots ${clearedSlots.join(', ')} files deleted`
        );
    }
}

function showRenameMessage(updates: SlotUpdate[]): void {
    if (updates.length === 1) {
        const update = updates[0];
        vscode.window.showInformationMessage(
            `File Bind: Slot ${update.slot} updated (${update.oldName} → ${update.newName})`
        );
    } else {
        vscode.window.showInformationMessage(
            `File Bind: ${updates.length} slots updated for renamed files`
        );
    }
}