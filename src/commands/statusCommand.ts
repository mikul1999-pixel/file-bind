import * as vscode from 'vscode';
import { PICK_ACTIONS } from '../config/constants';
import type { SlotStore } from '../services/slotStore';
import type { QuickPickItemSlot } from '../types/slots';
import { createQuickPickItems } from '../ui/quickPickItems';

export function registerShowStatusCommand(
    context: vscode.ExtensionContext,
    slotStore: SlotStore
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('file-bind.showStatus', async () => {
            // Show slot bindings in quick pick
            const quickPick = vscode.window.createQuickPick();
            quickPick.title = 'Current File Bindings';
            quickPick.placeholder = 'Select a slot to jump, or use buttons to manage';
            quickPick.items = createQuickPickItems(slotStore.getSlots());

            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0];
                if (!selected) {
                    return;
                }

                if (selected.label === '$(gear) Configure Slots') {
                    void vscode.commands.executeCommand('file-bind.openConfig');
                    quickPick.hide();
                    return;
                }

                const slotNumber = (selected as QuickPickItemSlot).slotNumber;
                if (!slotNumber || selected.label.includes('Empty')) {
                    return;
                }

                void vscode.commands.executeCommand('file-bind.jumpToSlot', slotNumber);
                quickPick.hide();
            });

            quickPick.onDidTriggerItemButton(async (e) => {
                const item = e.item as QuickPickItemSlot;
                const slotNumber = item.slotNumber;
                if (!slotNumber) {
                    return;
                }

                const buttonIcon = (e.button.iconPath as vscode.ThemeIcon).id;
                if (buttonIcon === PICK_ACTIONS.CLEAR) {
                    await vscode.commands.executeCommand('file-bind.clearSlot', slotNumber);
                    quickPick.items = createQuickPickItems(slotStore.getSlots());
                    return;
                }

                if (buttonIcon !== PICK_ACTIONS.REBIND && buttonIcon !== PICK_ACTIONS.BIND) {
                    return;
                }

                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showWarningMessage('No active file to bind');
                    return;
                }

                await vscode.commands.executeCommand('file-bind.pinToSlot', slotNumber);
                quickPick.items = createQuickPickItems(slotStore.getSlots());
            });

            quickPick.show();
        })
    );
}
