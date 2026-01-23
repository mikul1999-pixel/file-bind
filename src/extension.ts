import * as vscode from 'vscode';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('File Bind extension is now active');

    // Status bar item to show bound files
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.command = 'file-bind.showStatus';
    context.subscriptions.push(statusBarItem);

    // Update status bar
    function updateStatusBar() {
        const config = vscode.workspace.getConfiguration('file-bind');
        const slots = config.get<Record<string, string>>('slots', {});
        
        const slotTexts = [];
        for (let i = 1; i <= 3; i++) {
            const filePath = slots[i.toString()];
            if (filePath) {
                const fileName = path.basename(filePath);
                slotTexts.push(`${i}:${fileName}`);
            }
        }
        
        if (slotTexts.length > 0) {
            statusBarItem.text = `$(file-code) ${slotTexts.join(' ')}`;
            statusBarItem.show();
        } else {
            statusBarItem.hide();
        }
    }

    // Initial status bar update
    updateStatusBar();

    // Watch for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('file-bind.slots')) {
                updateStatusBar();
            }
        })
    );

    // Show how to alter keybinds
	context.subscriptions.push(
		vscode.commands.registerCommand('file-bind.configureKeybindings', () => {
			vscode.commands.executeCommand(
			'workbench.action.openGlobalKeybindings', 
			'file-bind'
			);
		})
		);

    // Helper to get relative path
    function getWorkspaceRelativePath(filePath: string): string | null {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return null;
        }
        return path.relative(workspaceFolder.uri.fsPath, filePath);
    }

    // Pin to slot command
    function registerPinCommand(slotNumber: number) {
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

                const config = vscode.workspace.getConfiguration('file-bind');
                const slots = config.get<Record<string, string>>('slots', {});
                slots[slotNumber.toString()] = relativePath;

                await config.update('slots', slots, vscode.ConfigurationTarget.Workspace);
                
                const fileName = path.basename(filePath);
                vscode.window.showInformationMessage(
                    `Bound ${fileName} to Slot ${slotNumber}`
                );
                updateStatusBar();
            }
        );
    }

    // Jump to slot command
    function registerJumpCommand(slotNumber: number) {
        return vscode.commands.registerCommand(
            `file-bind.jumpToSlot${slotNumber}`,
            async () => {
                const config = vscode.workspace.getConfiguration('file-bind');
                const slots = config.get<Record<string, string>>('slots', {});
                const relativePath = slots[slotNumber.toString()];

                if (!relativePath) {
                    vscode.window.showWarningMessage(`Slot ${slotNumber} is empty`);
                    return;
                }

                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    vscode.window.showWarningMessage('No workspace folder open');
                    return;
                }

                const fullPath = path.join(workspaceFolder.uri.fsPath, relativePath);
                const uri = vscode.Uri.file(fullPath);

                try {
                    const document = await vscode.workspace.openTextDocument(uri);
                    await vscode.window.showTextDocument(document);
                } catch (error) {
                    vscode.window.showErrorMessage(
                        `Could not open file: ${path.basename(relativePath)}`
                    );
                }
            }
        );
    }

    // Register all commands
    for (let i = 1; i <= 3; i++) {
        context.subscriptions.push(registerPinCommand(i));
        context.subscriptions.push(registerJumpCommand(i));
    }

    // Show status command
    context.subscriptions.push(
        vscode.commands.registerCommand('file-bind.showStatus', () => {
            const config = vscode.workspace.getConfiguration('file-bind');
            const slots = config.get<Record<string, string>>('slots', {});
            
            const items = [];
            for (let i = 1; i <= 3; i++) {
                const filePath = slots[i.toString()];
                if (filePath) {
                    items.push(`Slot ${i}: ${filePath}`);
                } else {
                    items.push(`Slot ${i}: (empty)`);
                }
            }
            
            vscode.window.showInformationMessage(items.join('\n'));
        })
    );
}

export function deactivate() {}