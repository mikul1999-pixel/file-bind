import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import type { SlotStore } from '../services/slotStore';
import {
    DEFAULT_SET_NAME,
    getAllSetsConfigUri,
    getSetSlotsUri,
    isSlotSetConfigUri,
    normalizeSetName,
    validateSetName
} from '../services/slotSetRules';

const DEFAULT_STATUS_MESSAGE = 'ready';
const STATUS_RESET_DELAY_MS = 2200;

interface SlotSetManagerMessage {
    type: 'ready' | 'selectSet' | 'openSetFile' | 'openAllConfig' | 'switchSet' | 'createSet' | 'renameSet' | 'deleteSet' | 'closePanel';
    setName?: string;
}

interface SlotSetManagerState {
    sets: string[];
    activeSet: string;
    selectedSet: string;
    previewJson: string;
    statusMessage: string;
}

export function registerSlotSetManagerCommand(
    context: vscode.ExtensionContext,
    slotStore: SlotStore
): void {
    // Keep panel state in extension host
    let panel: vscode.WebviewPanel | undefined;
    let selectedSet = slotStore.getActiveSet();
    let statusMessage = DEFAULT_STATUS_MESSAGE;
    let statusResetTimer: ReturnType<typeof setTimeout> | undefined;

    const resetStatusSoon = (): void => {
        if (statusResetTimer) {
            clearTimeout(statusResetTimer);
        }

        statusResetTimer = setTimeout(() => {
            statusMessage = DEFAULT_STATUS_MESSAGE;
            void postState();
        }, STATUS_RESET_DELAY_MS);
    };

    const postState = async (nextStatusMessage?: string): Promise<void> => {
        if (!panel) {
            return;
        }

        if (nextStatusMessage !== undefined) {
            statusMessage = nextStatusMessage;
            if (nextStatusMessage !== DEFAULT_STATUS_MESSAGE) {
                resetStatusSoon();
            }
        }

        const sets = slotStore.getSetNames();
        if (!sets.includes(selectedSet)) {
            selectedSet = slotStore.getActiveSet();
        }

        if (!sets.includes(selectedSet)) {
            selectedSet = DEFAULT_SET_NAME;
        }

        // Webview gets a single view model on every refresh
        const state: SlotSetManagerState = {
            sets,
            activeSet: slotStore.getActiveSet(),
            selectedSet,
            previewJson: JSON.stringify(slotStore.getSlotsForSet(selectedSet), null, 4),
            statusMessage
        };

        await panel.webview.postMessage({ type: 'refresh', state });
    };

    const openPanel = async (): Promise<void> => {
        if (panel) {
            panel.reveal(vscode.ViewColumn.Active);
            await postState();
            return;
        }

        const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media', 'slotSetManager');
        panel = vscode.window.createWebviewPanel(
            'file-bind.slotSetManager',
            'File Bind: Slot Sets',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [mediaRoot]
            }
        );

        panel.webview.html = await buildWebviewHtml(context, panel.webview);

        panel.onDidDispose(() => {
            if (statusResetTimer) {
                clearTimeout(statusResetTimer);
                statusResetTimer = undefined;
            }
            panel = undefined;
        });

        panel.webview.onDidReceiveMessage(async (message: SlotSetManagerMessage) => {
            const currentPanel = panel;
            if (!currentPanel) {
                return;
            }

            if (message.type === 'ready') {
                await postState();
                return;
            }

            try {
                const nextStatus = await handleMessage(message, slotStore, currentPanel, () => selectedSet, (value) => {
                    selectedSet = value;
                });
                await postState(nextStatus);
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Slot set action failed: ${reason}`);
                await postState(`error: ${reason}`);
            }
        });
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('file-bind.manageSlotSets', () => {
            void openPanel();
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
            if (!isSlotSetConfigDocument(document.uri)) {
                return;
            }

            void postState('preview refreshed');
        })
    );
}

async function buildWebviewHtml(
    context: vscode.ExtensionContext,
    webview: vscode.Webview
): Promise<string> {
    // Load static web assets and inject webview uris and csp nonce
    const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media', 'slotSetManager');
    const htmlUri = vscode.Uri.joinPath(mediaRoot, 'index.html');
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'styles.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'main.js'));

    const htmlBuffer = await vscode.workspace.fs.readFile(htmlUri);
    const htmlTemplate = Buffer.from(htmlBuffer).toString('utf8');

    return htmlTemplate
        .replaceAll('{{nonce}}', createNonce())
        .replaceAll('{{cspSource}}', webview.cspSource)
        .replaceAll('{{styleUri}}', cssUri.toString())
        .replaceAll('{{scriptUri}}', jsUri.toString());
}

async function handleMessage(
    message: SlotSetManagerMessage,
    slotStore: SlotStore,
    panel: vscode.WebviewPanel,
    getSelectedSet: () => string,
    setSelectedSet: (setName: string) => void
): Promise<string | undefined> {
    // Normalize all set operations so UI and storage have safe names
    const targetSet = normalizeSetName(message.setName ?? getSelectedSet());

    if (message.type === 'closePanel') {
        panel.dispose();
        return undefined;
    }

    if (message.type === 'selectSet') {
        if (slotStore.getSetNames().includes(targetSet)) {
            setSelectedSet(targetSet);
        }
        return undefined;
    }

    if (message.type === 'openSetFile') {
        await openSetFile(targetSet);
        return `opened ${targetSet}`;
    }

    if (message.type === 'openAllConfig') {
        await openAllSetsConfig();
        return 'opened /config.json';
    }

    if (message.type === 'switchSet') {
        if (!slotStore.getSetNames().includes(targetSet)) {
            return 'set not found';
        }

        await slotStore.setActiveSet(targetSet);
        setSelectedSet(targetSet);
        return `active set: ${targetSet}`;
    }

    if (message.type === 'createSet') {
        const name = await promptForSetName(slotStore.getSetNames(), 'New slot set name');
        if (!name) {
            return 'create cancelled';
        }

        await slotStore.createSet(name);
        setSelectedSet(name);
        return `created ${name}`;
    }

    if (message.type === 'renameSet') {
        if (targetSet === DEFAULT_SET_NAME) {
            return 'default cannot be renamed';
        }

        const name = await promptForSetName(
            slotStore.getSetNames().filter((setName) => setName !== targetSet),
            `Rename '${targetSet}' to`,
            targetSet
        );
        if (!name) {
            return 'rename cancelled';
        }

        await slotStore.renameSet(targetSet, name);
        setSelectedSet(name);
        return `renamed ${targetSet} -> ${name}`;
    }

    if (message.type === 'deleteSet') {
        if (targetSet === DEFAULT_SET_NAME) {
            return 'default cannot be deleted';
        }

        const choice = await vscode.window.showWarningMessage(
            `Delete slot set '${targetSet}'?`,
            { modal: true },
            'Delete'
        );
        if (choice !== 'Delete') {
            return 'delete cancelled';
        }

        if (slotStore.getActiveSet() === targetSet) {
            await slotStore.setActiveSet(DEFAULT_SET_NAME);
        }

        await slotStore.deleteSet(targetSet);
        setSelectedSet(slotStore.getActiveSet());
        return `deleted ${targetSet}`;
    }

    return undefined;
}

async function openSetFile(setName: string): Promise<void> {
    const uri = getSetSlotsUri(setName);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
}

async function openAllSetsConfig(): Promise<void> {
    const uri = getAllSetsConfigUri();
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
}

async function promptForSetName(
    existingSetNames: string[],
    prompt: string,
    value = ''
): Promise<string | undefined> {
    const existing = new Set(existingSetNames);

    const name = await vscode.window.showInputBox({
        title: 'File Bind: Slot Sets',
        prompt,
        value,
        ignoreFocusOut: true,
        validateInput: (input) => {
            const normalized = normalizeSetName(input);
            const validationError = validateSetName(normalized);
            if (validationError) {
                return validationError;
            }

            if (existing.has(normalized)) {
                return 'A set with this name already exists';
            }

            return undefined;
        }
    });

    if (!name) {
        return undefined;
    }

    return normalizeSetName(name);
}

function isSlotSetConfigDocument(uri: vscode.Uri): boolean {
    return isSlotSetConfigUri(uri);
}

function createNonce(): string {
    return randomBytes(18).toString('base64url');
}
