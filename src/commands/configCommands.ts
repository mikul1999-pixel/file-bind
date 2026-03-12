import * as vscode from 'vscode';
import { DEFAULT_SET_NAME, getSetSlotsUri } from '../services/slotSetRules';

export function registerConfigCommands(context: vscode.ExtensionContext): void {
    // Open keybindings search
    context.subscriptions.push(
        vscode.commands.registerCommand('file-bind.configureKeybindings', () => {
            void vscode.commands.executeCommand(
                'workbench.action.openGlobalKeybindings',
                'file-bind'
            );
        })
    );

    // Open editable virtual slots config
    context.subscriptions.push(
        vscode.commands.registerCommand('file-bind.openConfig', async () => {
            const uri = getSetSlotsUri(DEFAULT_SET_NAME);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);
        })
    );
}
