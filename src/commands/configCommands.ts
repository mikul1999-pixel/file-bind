import * as vscode from 'vscode';
import { getAllSetsConfigUri } from '../services/slotSetRules';

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

    context.subscriptions.push(
        vscode.commands.registerCommand('file-bind.openAllSetsConfig', () => {
            void vscode.workspace.openTextDocument(getAllSetsConfigUri()).then((doc) =>
                vscode.window.showTextDocument(doc)
            );
        })
    );
}
