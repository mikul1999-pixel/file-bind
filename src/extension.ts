import * as vscode from 'vscode';
import * as path from 'path';
import { TextEncoder, TextDecoder } from 'util';

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

interface QuickPickItemSlot extends vscode.QuickPickItem {
    slotNumber?: number;
}

// Constants
const MAX_SLOT_COUNT = 9;
const WORKSPACE_STATE_KEY = 'slots';
const CONFIG_URI = 'file-bind-config:/slots.json';

// vscode icons
const STATUS_ICONS = {
    DEFAULT: 'go-to-file',
    ACTIVE: 'file-text',
} as const;
const PICK_ICONS = {
    BOUND: 'json',
    BOUND_ACTIVE: 'bracket-dot',
    EMPTY: 'circle-outline',
} as const;
const PICK_ACTIONS = {
    BIND: 'add',
    REBIND: 'refresh',
    CLEAR: 'trash',
} as const;

let globalContext: vscode.ExtensionContext;
let configFs: ConfigFileSystemProvider;

export function activate(context: vscode.ExtensionContext): void {
    console.log('File Bind extension is now active');
    globalContext = context;

    // Initialize virtual fs
    configFs = new ConfigFileSystemProvider();
    context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider('file-bind-config', configFs, { isCaseSensitive: true })
    );

    const statusBarItem = createStatusBar(context);
    const updateStatusBar = (): void => {
        updateStatusBarDisplay(statusBarItem, getSlots());
    };

    // Update status bar when virtual file changes
    context.subscriptions.push(configFs.onDidChangeFile(() => {
        updateStatusBar();
    }));

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
            updateStatusBar(); // Update to show active file indicator
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
    const slotEntry = findSlotByPath(slots, relative);
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

    await saveSlots(updatedSlots);
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
    const activeFilePath = getActiveFilePath();

    const slotTexts = Array.from({ length: slotCount }, (_, i) => {
        const slotNumber = i + 1;
        const binding = slots[getSlotKey(slotNumber)];
        
        if (binding) {
            const fileName = path.basename(binding.filePath);
            const isActive = activeFilePath === binding.filePath;
            const icon = isActive ? getIconLabel(STATUS_ICONS.ACTIVE) : getIconLabel(STATUS_ICONS.DEFAULT);
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
            if (e.affectsConfiguration('file-bind.slotCount') ||
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
        await saveSlots(updatedSlots);
        updateStatusBar();
        showDeletionMessage(clearedSlots);
    }
}

async function handleFileRenames(
    e: vscode.FileRenameEvent,
    updateStatusBar: () => void
): Promise<void> {
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
        await saveSlots(updatedSlots);
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
    context.subscriptions.push(registerOpenConfigCommand());
}

function registerPinCommand(
    slotNumber: number,
    updateStatusBar: () => void
): vscode.Disposable {
    return vscode.commands.registerCommand(
        `file-bind.pinToSlot${slotNumber}`,
        async () => {
            if (!isSlotEnabled(slotNumber)) {
                showSlotDisabledWarning(slotNumber);
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
    const slots = getSlots();
    const fileName = path.basename(fullPath);
    
    const existingSlot = findSlotByPath(slots, relativePath)?.[0];
    
    if (existingSlot && existingSlot !== getSlotKey(slotNumber)) {
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
    const slots = getSlots();
    const updatedSlots = { ...slots };
    
    delete updatedSlots[fromSlot];
    updatedSlots[getSlotKey(toSlot)] = {
        filePath: relativePath,
        line: position.line,
        character: position.character,
        mode: slots[fromSlot]?.mode ?? "auto"
    };
    
    await saveSlots(updatedSlots);
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
    const slotKey = getSlotKey(slotNumber);
    const oldBinding = slots[slotKey];
    const updatedSlots = { ...slots };
    
    updatedSlots[slotKey] = {
        filePath: relativePath,
        line: position.line,
        character: position.character,
        mode: oldBinding?.mode ?? "auto"
    };

    await saveSlots(updatedSlots);
    
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
            if (!isSlotEnabled(slotNumber)) {
                showSlotDisabledWarning(slotNumber);
                return;
            }

            const slots = getSlots();
            const binding = slots[getSlotKey(slotNumber)];

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
        if (error instanceof vscode.FileSystemError) {
            await handleOpenFileError(fullPath, slotNumber, slots, updateStatusBar);
        } else {
            vscode.window.showErrorMessage(`Unexpected error opening file: ${error}`);
        }
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
            if (!isSlotEnabled(slotNumber)) {
                showSlotDisabledWarning(slotNumber);
                return;
            }

            const slots = getSlots();
            const binding = slots[getSlotKey(slotNumber)];
            
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
    const updatedSlots = { ...slots };
    delete updatedSlots[getSlotKey(slotNumber)];
    await saveSlots(updatedSlots);
}

// Show bindings in a dropdown
function registerShowStatusCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('file-bind.showStatus', async () => {
        const slots = getSlots();
        
        // Create QuickPick with buttons
        const quickPick = vscode.window.createQuickPick();
        quickPick.title = 'Current File Bindings';
        quickPick.placeholder = 'Select a slot to jump, or use buttons to manage';
        quickPick.items = createQuickPickItems(slots);
        
        // Handle selection
        quickPick.onDidAccept(() => {
            const selected = quickPick.selectedItems[0];
            if (!selected) { return; }

            if (selected.label === '$(gear) Configure Slots') {
                vscode.commands.executeCommand('file-bind.openConfig');
                quickPick.hide();
                return;
            }

            if (selected.label.includes('Slot')) {
                const slotMatch = selected.label.match(/Slot (\d)/);
                if (slotMatch && !selected.label.includes('Empty')) {
                    const slotNumber = parseInt(slotMatch[1], 10);
                    vscode.commands.executeCommand(`file-bind.jumpToSlot${slotNumber}`);
                    quickPick.hide();
                }
            }
        });

        // Handle button clicks
        quickPick.onDidTriggerItemButton(async (e) => {
            const item = e.item as QuickPickItemSlot;
            const slotNumber = item.slotNumber;
            
            if (!slotNumber) { return; }
            const buttonIcon = (e.button.iconPath as vscode.ThemeIcon).id;

            if (buttonIcon === PICK_ACTIONS.CLEAR) {
                // Clear slot
                await vscode.commands.executeCommand(`file-bind.clearSlot${slotNumber}`);
                quickPick.items = createQuickPickItems(getSlots());
            } else if (buttonIcon === PICK_ACTIONS.REBIND || buttonIcon === PICK_ACTIONS.BIND) {
                // Re-bind current file to this slot
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showWarningMessage('No active file to bind');
                    return;
                }
                await vscode.commands.executeCommand(`file-bind.pinToSlot${slotNumber}`);
                quickPick.items = createQuickPickItems(getSlots());
            }
        });

        quickPick.show();
    });
}

// Create QuickPick menu
function createQuickPickItems(slots: SlotRecord): QuickPickItemSlot[] {
    const slotCount = getSlotCount();
    const activeFilePath = getActiveFilePath();
    
    const items: QuickPickItemSlot[] = Array.from({ length: slotCount }, (_, i) => {
        const slotNumber = i + 1;
        const binding = slots[getSlotKey(slotNumber)];
        
        if (binding) {
            const lineInfo = `Line ${binding.line + 1}:${binding.character}`;
            const modeInfo = binding.mode ?? "auto";
            const isActive = activeFilePath === binding.filePath;
            const icon = isActive ? getIconLabel(PICK_ICONS.BOUND_ACTIVE) : getIconLabel(PICK_ICONS.BOUND);
            
            return {
                label: `${icon} Slot ${slotNumber}: ${binding.filePath}`,
                description: `${lineInfo} — ${modeInfo}`,
                slotNumber: slotNumber,
                buttons: [
                    {
                        iconPath: new vscode.ThemeIcon(PICK_ACTIONS.REBIND),
                        tooltip: 'Re-bind current file to this slot'
                    },
                    {
                        iconPath: new vscode.ThemeIcon(PICK_ACTIONS.CLEAR),
                        tooltip: 'Clear this slot'
                    }
                ]
            };
        }
        
        // Empty slot - only show "bind" button
        return {
            label: `${getIconLabel(PICK_ICONS.EMPTY)} Slot ${slotNumber}: Empty`,
            description: '',
            slotNumber: slotNumber,
            buttons: [
                {
                    iconPath: new vscode.ThemeIcon(PICK_ACTIONS.BIND),
                    tooltip: 'Bind current file to this slot'
                }
            ]
        };
    });

    items.push({
        label: '',
        kind: vscode.QuickPickItemKind.Separator
    });

    items.push({
        label: '$(gear) Configure Slots',
        description: 'Open slots.json config file'
    });

    return items;
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

// Open virtual config file
function registerOpenConfigCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('file-bind.openConfig', async () => {
        const uri = vscode.Uri.parse(CONFIG_URI);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
    });
}

// Helper functions
function getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('file-bind');
}

function getSlots(): SlotRecord {
    return globalContext.workspaceState.get<SlotRecord>(WORKSPACE_STATE_KEY, {});
}

async function saveSlots(slots: SlotRecord): Promise<void> {
    await globalContext.workspaceState.update(WORKSPACE_STATE_KEY, slots);
    configFs.refresh(vscode.Uri.parse(CONFIG_URI));
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

function getActiveFilePath(): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return null; }
    return getWorkspaceRelativePath(editor.document.uri.fsPath);
}

function getIconLabel(id: string): string {
    return `$(${id})`;
}

function getSlotKey(slotNumber: number): string {
    return slotNumber.toString();
}

function isSlotEnabled(slotNumber: number): boolean {
    return slotNumber <= getSlotCount();
}

function showSlotDisabledWarning(slotNumber: number): void {
    vscode.window.showWarningMessage(
        `Slot ${slotNumber} is disabled. Enable it in settings (current limit: ${getSlotCount()})`
    );
}

function findSlotByPath(slots: SlotRecord, filePath: string): [string, SlotBinding] | undefined {
    return Object.entries(slots).find(([_, binding]) => binding.filePath === filePath);
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

// Virtual fs provider for config
class ConfigFileSystemProvider implements vscode.FileSystemProvider {
    private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._onDidChangeFile.event;

    watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        return new vscode.Disposable(() => { });
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        if (uri.path === '/slots.json') {
            return {
                type: vscode.FileType.File,
                ctime: Date.now(),
                mtime: Date.now(),
                size: 0
            };
        }
        if (uri.path === '/') {
            return {
                type: vscode.FileType.Directory,
                ctime: Date.now(),
                mtime: Date.now(),
                size: 0
            };
        }
        throw vscode.FileSystemError.FileNotFound();
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
        if (uri.path === '/') {
            return [['slots.json', vscode.FileType.File]];
        }
        return [];
    }

    createDirectory(_uri: vscode.Uri): void {
        throw vscode.FileSystemError.NoPermissions();
    }

    readFile(uri: vscode.Uri): Uint8Array {
        if (uri.path === '/slots.json') {
            const slots = getSlots();
            const json = JSON.stringify(slots, null, 4);
            return new TextEncoder().encode(json);
        }
        throw vscode.FileSystemError.FileNotFound();
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array, _options: { create: boolean; overwrite: boolean; }): Promise<void> {
        if (uri.path === '/slots.json') {
            try {
                const json = new TextDecoder().decode(content);
                const slots = JSON.parse(json);
                await globalContext.workspaceState.update(WORKSPACE_STATE_KEY, slots);
                this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
            } catch (e) {
                throw vscode.FileSystemError.Unavailable("Invalid JSON");
            }
        } else {
            throw vscode.FileSystemError.NoPermissions();
        }
    }

    delete(_uri: vscode.Uri, _options: { recursive: boolean; }): void {
        throw vscode.FileSystemError.NoPermissions();
    }

    rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean; }): void {
        throw vscode.FileSystemError.NoPermissions();
    }
    
    refresh(uri: vscode.Uri): void {
        this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    }
}
