import * as vscode from 'vscode';

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
}
