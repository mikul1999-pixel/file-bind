import * as vscode from 'vscode';
import * as path from 'path';

type SlotRecord = Record<string, string>;

interface SlotUpdate {
    slot: string;
    oldName: string;
    newName: string;
}

const SLOT_COUNT = 3;
const STATUS_BAR_ICONS = ['$(file)', '$(file-code)', '$(file-text)'] as const;

export function activate(context: vscode.ExtensionContext): void {
    console.log('File Bind extension is now active');

    const statusBarItem = createStatusBar(context);
    
    const updateStatusBar = (): void => {
        const slots = getSlots();
        updateStatusBarDisplay(statusBarItem, slots);
    };

    updateStatusBar();
    registerConfigurationWatcher(context, updateStatusBar);
    registerFileWatchers(context, updateStatusBar);
    registerCommands(context, updateStatusBar);
}

export function deactivate(): void {}

// Status bar to show bound files
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
    const slotTexts = Array.from({ length: SLOT_COUNT }, (_, i) => {
        const slotNumber = i + 1;
        const filePath = slots[slotNumber.toString()];
        
        if (filePath) {
            const fileName = path.basename(filePath);
            const icon = STATUS_BAR_ICONS[i];
            return `${icon} ${slotNumber}:${fileName}`;
        }
        return null;
    }).filter((text): text is string => text !== null);
    
    if (slotTexts.length > 0) {
        statusBarItem.text = slotTexts.join('  ');
        statusBarItem.show();
    } else {
        statusBarItem.hide();
    }
}

// Watch for configuration changes
function registerConfigurationWatcher(
    context: vscode.ExtensionContext,
    updateStatusBar: () => void
): void {
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('file-bind.slots')) {
                updateStatusBar();
            }
        })
    );
}

// Watch for file changes
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
    
    if (!workspaceFolder) {
        return;
    }

    const clearedSlots: string[] = [];
    const updatedSlots = { ...slots };

    for (const [slot, filePath] of Object.entries(slots)) {
        const fullPath = path.join(workspaceFolder.uri.fsPath, filePath);
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
    
    if (!workspaceFolder) {
        return;
    }

    const updatedSlots = { ...slots };
    const updates: SlotUpdate[] = [];

    for (const [slot, filePath] of Object.entries(slots)) {
        const fullPath = path.join(workspaceFolder.uri.fsPath, filePath);
        const renamedFile = e.files.find(file => file.oldUri.fsPath === fullPath);
        
        if (renamedFile) {
            const newRelativePath = path.relative(
                workspaceFolder.uri.fsPath,
                renamedFile.newUri.fsPath
            );
            updatedSlots[slot] = newRelativePath;
            updates.push({
                slot,
                oldName: path.basename(filePath),
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

function registerCommands(
    context: vscode.ExtensionContext,
    updateStatusBar: () => void
): void {
    for (let i = 1; i <= SLOT_COUNT; i++) {
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

            await pinFileToSlot(slotNumber, relativePath, filePath);
            updateStatusBar();
        }
    );
}

// Pin file to slot
async function pinFileToSlot(
    slotNumber: number,
    relativePath: string,
    fullPath: string
): Promise<void> {
    const config = getConfig();
    const slots = getSlots();
    const fileName = path.basename(fullPath);
    
    const existingSlot = Object.entries(slots).find(
        ([_, slotPath]) => slotPath === relativePath
    )?.[0];
    
    if (existingSlot && existingSlot !== slotNumber.toString()) {
        await moveSlot(existingSlot, slotNumber, relativePath, fileName);
    } else {
        await updateSlot(slotNumber, relativePath, fileName, slots);
    }
}

// Move file to new slot
async function moveSlot(
    fromSlot: string,
    toSlot: number,
    relativePath: string,
    fileName: string
): Promise<void> {
    const config = getConfig();
    const slots = getSlots();
    const updatedSlots = { ...slots };
    
    delete updatedSlots[fromSlot];
    updatedSlots[toSlot.toString()] = relativePath;
    
    await config.update('slots', updatedSlots, vscode.ConfigurationTarget.Workspace);
    vscode.window.showInformationMessage(
        `Moved ${fileName} from Slot ${fromSlot} to Slot ${toSlot}`
    );
}

// Update pin
async function updateSlot(
    slotNumber: number,
    relativePath: string,
    fileName: string,
    slots: SlotRecord
): Promise<void> {
    const config = getConfig();
    const oldFile = slots[slotNumber.toString()];
    const updatedSlots = { ...slots };
    
    updatedSlots[slotNumber.toString()] = relativePath;
    await config.update('slots', updatedSlots, vscode.ConfigurationTarget.Workspace);
    
    if (oldFile) {
        const oldFileName = path.basename(oldFile);
        vscode.window.showInformationMessage(
            `Slot ${slotNumber}: ${oldFileName} to ${fileName}`
        );
    } else {
        vscode.window.showInformationMessage(
            `Pinned ${fileName} to Slot ${slotNumber}`
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
            const slots = getSlots();
            const relativePath = slots[slotNumber.toString()];

            if (!relativePath) {
                vscode.window.showWarningMessage(
                    `Slot ${slotNumber} is empty. Pin a file with Alt+Shift+${slotNumber}`
                );
                return;
            }

            const workspaceFolder = getWorkspaceFolder();
            if (!workspaceFolder) {
                vscode.window.showWarningMessage('No workspace folder open');
                return;
            }

            const fullPath = path.join(workspaceFolder.uri.fsPath, relativePath);
            await openFile(fullPath, slotNumber, slots, updateStatusBar);
        }
    );
}

async function openFile(
    fullPath: string,
    slotNumber: number,
    slots: SlotRecord,
    updateStatusBar: () => void
): Promise<void> {
    const uri = vscode.Uri.file(fullPath);

    try {
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);
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
            const slots = getSlots();
            const filePath = slots[slotNumber.toString()];
            
            if (!filePath) {
                vscode.window.showInformationMessage(
                    `Slot ${slotNumber} is already empty`
                );
                return;
            }

            const fileName = path.basename(filePath);
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
    return Array.from({ length: SLOT_COUNT }, (_, i) => {
        const slotNumber = i + 1;
        const filePath = slots[slotNumber.toString()];
        
        if (filePath) {
            const fileName = path.basename(filePath);
            const dirName = path.dirname(filePath);
            return {
                label: `$(pin) Slot ${slotNumber}: ${fileName}`,
                description: dirName !== '.' ? dirName : '',
                detail: `Alt+${slotNumber} to jump, Alt+Shift+${slotNumber} to rebind`
            };
        }
        
        return {
            label: `$(circle-outline) Slot ${slotNumber}: Empty`,
            description: '',
            detail: `Alt+Shift+${slotNumber} to bind a file`
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

function getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('file-bind');
}

function getSlots(): SlotRecord {
    const config = getConfig();
    return config.get<SlotRecord>('slots', {});
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
            `File Bind: Slots ${clearedSlots.join(', ')} file deleted`
        );
    }
}

function showRenameMessage(updates: SlotUpdate[]): void {
    if (updates.length === 1) {
        const update = updates[0];
        vscode.window.showInformationMessage(
            `File Bind: Slot ${update.slot} updated (${update.oldName} to ${update.newName})`
        );
    } else {
        vscode.window.showInformationMessage(
            `File Bind: ${updates.length} slots updated for renamed files`
        );
    }
}