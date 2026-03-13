import * as vscode from 'vscode';
import { registerConfigCommands } from './commands/configCommands';
import { registerCycleCommands } from './commands/cycleCommands';
import { registerJumpPreviousCommand } from './commands/jumpPreviousCommand';
import { registerSlotSetManagerCommand } from './commands/slotSetManagerCommand';
import { registerShowStatusCommand } from './commands/statusCommand';
import { registerSlotCommands } from './commands/slotCommands';
import { ConfigFileSystemProvider } from './fs/configFileSystemProvider';
import { EditorTracker } from './services/editorTracker';
import { registerFileWatchers } from './services/fileSync';
import { SlotCycleTracker } from './services/slotCycleTracker';
import { createSlotStore, type SlotStore } from './services/slotStore';
import {
    DEFAULT_SET_NAME,
    getAllSetsConfigUri,
    getSetSlotsUri,
    getSetsDirectoryUri
} from './services/slotSetRules';
import { findSlotByPath } from './utils/slots';
import { getWorkspaceRelativePath } from './utils/workspace';
import { createStatusBar, updateStatusBarDisplay } from './ui/statusBar';

export function activate(context: vscode.ExtensionContext): void {
    console.log('File Bind extension is now active');

    // Virtual config + workspace slot store
    let configFs: ConfigFileSystemProvider;
    const slotStore = createSlotStore(context, () => {
        configFs.refresh(getSetSlotsUri(DEFAULT_SET_NAME));
        configFs.refresh(getAllSetsConfigUri());
        configFs.refresh(getSetsDirectoryUri());
        for (const setName of slotStore.getSetNames()) {
            if (setName === DEFAULT_SET_NAME) {
                continue;
            }

            configFs.refresh(getSetSlotsUri(setName));
        }
    });

    configFs = new ConfigFileSystemProvider(slotStore);
    context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider('file-bind-config', configFs, { isCaseSensitive: true })
    );

    // Status bar
    const statusBarItem = createStatusBar(context);
    const updateStatusBar = (): void => {
        updateStatusBarDisplay(statusBarItem, slotStore.getSlots(), slotStore.getActiveSet());
    };

    context.subscriptions.push(configFs.onDidChangeFile(() => updateStatusBar()));

    // Register modules
    updateStatusBar();
    registerConfigurationWatcher(context, updateStatusBar);
    registerFileWatchers(context, slotStore, updateStatusBar);
    registerSlotCommands(context, slotStore, updateStatusBar);
    registerSlotSetManagerCommand(context, slotStore);
    registerShowStatusCommand(context, slotStore);
    registerConfigCommands(context);
    registerCycleCommands(context, new SlotCycleTracker(slotStore));

    // Editor tracking
    const editorTracker = new EditorTracker();
    editorTracker.initialize();
    registerJumpPreviousCommand(context, editorTracker);
    registerEditorTracking(context, editorTracker, slotStore, updateStatusBar);
}

export function deactivate(): void {}

// Config watcher
function registerConfigurationWatcher(
    context: vscode.ExtensionContext,
    updateStatusBar: () => void
): void {
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('file-bind.slotCount') ||
                e.affectsConfiguration('file-bind.statusPreviewLimit')) {
                updateStatusBar();
            }
        })
    );
}

// Editor watchers
function registerEditorTracking(
    context: vscode.ExtensionContext,
    editorTracker: EditorTracker,
    slotStore: SlotStore,
    updateStatusBar: () => void
): void {
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((newEditor) => {
            const leavingEditor = editorTracker.trackEditorChange(newEditor ?? undefined);
            if (leavingEditor) {
                void handleEditorLeave(slotStore, leavingEditor, updateStatusBar);
            }

            updateStatusBar();
        })
    );
}

// Update slot cursor when leaving a bound file
async function handleEditorLeave(
    slotStore: SlotStore,
    editor: vscode.TextEditor,
    updateStatusBar: () => void
): Promise<void> {
    const relativePath = getWorkspaceRelativePath(editor.document.uri.fsPath);
    if (!relativePath) {
        return;
    }

    const slots = slotStore.getSlots();
    const slotEntry = findSlotByPath(slots, relativePath);
    if (!slotEntry) {
        return;
    }

    const [slotNumber, binding] = slotEntry;
    const mode = binding.mode ?? 'auto';
    if (mode !== 'auto') {
        return;
    }

    const updatedSlots = { ...slots };
    updatedSlots[slotNumber] = {
        ...binding,
        line: editor.selection.active.line,
        character: editor.selection.active.character
    };

    await slotStore.saveSlots(updatedSlots);
    updateStatusBar();
}
