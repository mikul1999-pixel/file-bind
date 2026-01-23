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
    statusBarItem.tooltip = 'Click to view all file bindings';
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
                // Status bar icons
                const icon = ['$(file)', '$(file-code)', '$(file-text)'][i - 1];
                slotTexts.push(`${icon} ${i}:${fileName}`);
            }
        }
        
        if (slotTexts.length > 0) {
            statusBarItem.text = slotTexts.join('  ');
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

    // Watch for file deletions
    context.subscriptions.push(
        vscode.workspace.onDidDeleteFiles(async e => {
            const config = vscode.workspace.getConfiguration('file-bind');
            const slots = config.get<Record<string, string>>('slots', {});
            let changed = false;
            const clearedSlots: string[] = [];
            
            for (const [slot, filePath] of Object.entries(slots)) {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    continue;
                }
                
                const fullPath = path.join(workspaceFolder.uri.fsPath, filePath);
                const deletedFile = e.files.find(uri => uri.fsPath === fullPath);
                
                if (deletedFile) {
                    const updatedSlots = { ...slots };
                    delete updatedSlots[slot];
                    await config.update('slots', updatedSlots, vscode.ConfigurationTarget.Workspace);
                    changed = true;
                    clearedSlots.push(slot);
                }
            }
            
            if (changed) {
                await config.update('slots', slots, vscode.ConfigurationTarget.Workspace);
                updateStatusBar();
                
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
        })
    );

    // Watch for file renames/moves
    context.subscriptions.push(
        vscode.workspace.onDidRenameFiles(async e => {
            const config = vscode.workspace.getConfiguration('file-bind');
            const slots = config.get<Record<string, string>>('slots', {});
            let changed = false;
            const updatedSlots: Array<{slot: string, oldName: string, newName: string}> = [];
            
            for (const [slot, filePath] of Object.entries(slots)) {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    continue;
                }
                
                const fullPath = path.join(workspaceFolder.uri.fsPath, filePath);
                const renamedFile = e.files.find(file => file.oldUri.fsPath === fullPath);
                
                if (renamedFile) {
                    const newRelativePath = path.relative(
                        workspaceFolder.uri.fsPath,
                        renamedFile.newUri.fsPath
                    );
                    slots[slot] = newRelativePath;
                    changed = true;
                    updatedSlots.push({
                        slot,
                        oldName: path.basename(filePath),
                        newName: path.basename(newRelativePath)
                    });
                }
            }
            
            if (changed) {
                await config.update('slots', slots, vscode.ConfigurationTarget.Workspace);
                updateStatusBar();
                
                if (updatedSlots.length === 1) {
                    const update = updatedSlots[0];
                    vscode.window.showInformationMessage(
                        `File Bind: Slot ${update.slot} updated (${update.oldName} to ${update.newName})`
                    );
                } else {
                    vscode.window.showInformationMessage(
                        `File Bind: ${updatedSlots.length} slots updated for renamed files`
                    );
                }
            }
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
                
                // Check if file is already pinned
                const existingSlot = Object.entries(slots).find(
                    ([_, path]) => path === relativePath
                )?.[0];
                
                if (existingSlot && existingSlot !== slotNumber.toString()) {
                    // Move from existing slot to new slot
                    const updatedSlots = { ...slots };
                    delete updatedSlots[existingSlot];
                    updatedSlots[slotNumber.toString()] = relativePath;
                    await config.update('slots', updatedSlots, vscode.ConfigurationTarget.Workspace);
                    
                    const fileName = path.basename(filePath);
                    vscode.window.showInformationMessage(
                        `Moved ${fileName} from Slot ${existingSlot} to Slot ${slotNumber}`
                    );
                } else {
                    // Pin to new slot or overwrite existing
                    const oldFile = slots[slotNumber.toString()];
                    const updatedSlots = { ...slots };
                    updatedSlots[slotNumber.toString()] = relativePath;
                    await config.update('slots', updatedSlots, vscode.ConfigurationTarget.Workspace);
                    
                    const fileName = path.basename(filePath);
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
                    vscode.window.showWarningMessage(
                        `Slot ${slotNumber} is empty. Pin a file with Alt+Shift+${slotNumber}`
                    );
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
                    
                    // Show if jumping to a different file
                    const currentFile = vscode.window.activeTextEditor?.document.uri.fsPath;
                    if (currentFile !== fullPath) {
                    }
                } catch (error) {
                    const fileName = path.basename(relativePath);
                    vscode.window.showErrorMessage(
                        `Could not open ${fileName}. File may have been deleted.`
                    );
                    
                    // Ask to clear the slot
                    const choice = await vscode.window.showWarningMessage(
                        `Clear Slot ${slotNumber}?`,
                        'Yes',
                        'No'
                    );
                    
                    if (choice === 'Yes') {
                        const updatedSlots = { ...slots };
                        delete updatedSlots[slotNumber.toString()];
                        await config.update('slots', updatedSlots, vscode.ConfigurationTarget.Workspace);
                        updateStatusBar();
                        vscode.window.showInformationMessage(`Slot ${slotNumber} cleared`);
                    }
                }
            }
        );
    }

    // Clear slot command
    function registerClearCommand(slotNumber: number) {
        return vscode.commands.registerCommand(
            `file-bind.clearSlot${slotNumber}`,
            async () => {
                const config = vscode.workspace.getConfiguration('file-bind');
                const slots = config.get<Record<string, string>>('slots', {});
                
                const filePath = slots[slotNumber.toString()];
                if (!filePath) {
                    vscode.window.showInformationMessage(
                        `Slot ${slotNumber} is already empty`
                    );
                    return;
                }

                const fileName = path.basename(filePath);
                const updatedSlots = { ...slots };
                delete updatedSlots[slotNumber.toString()];
                await config.update('slots', updatedSlots, vscode.ConfigurationTarget.Workspace);
                
                vscode.window.showInformationMessage(
                    `Cleared ${fileName} from Slot ${slotNumber}`
                );
                updateStatusBar();
            }
        );
    }

    // Register all commands
    for (let i = 1; i <= 3; i++) {
        context.subscriptions.push(registerPinCommand(i));
        context.subscriptions.push(registerJumpCommand(i));
        context.subscriptions.push(registerClearCommand(i));
    }

    // Show status command
    context.subscriptions.push(
        vscode.commands.registerCommand('file-bind.showStatus', async () => {
            const config = vscode.workspace.getConfiguration('file-bind');
            const slots = config.get<Record<string, string>>('slots', {});
            
            const items: vscode.QuickPickItem[] = [];
            
            for (let i = 1; i <= 3; i++) {
                const filePath = slots[i.toString()];
                if (filePath) {
                    const fileName = path.basename(filePath);
                    const dirName = path.dirname(filePath);
                    items.push({
                        label: `$(pin) Slot ${i}: ${fileName}`,
                        description: dirName !== '.' ? dirName : '',
                        detail: `Alt+${i} to jump, Alt+Shift+${i} to rebind`
                    });
                } else {
                    items.push({
                        label: `$(circle-outline) Slot ${i}: Empty`,
                        description: '',
                        detail: `Alt+Shift+${i} to bind a file`
                    });
                }
            }
            
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'File Bind Slots',
                title: 'Current File Bindings'
            });
            
            // If user selected a bound slot, jump to it
            if (selected && selected.label.includes('Slot')) {
                const slotMatch = selected.label.match(/Slot (\d)/);
                if (slotMatch && !selected.label.includes('Empty')) {
                    const slotNumber = parseInt(slotMatch[1]);
                    await vscode.commands.executeCommand(`file-bind.jumpToSlot${slotNumber}`);
                }
            }
        })
    );

    // Configure keybindings command
    context.subscriptions.push(
        vscode.commands.registerCommand('file-bind.configureKeybindings', () => {
            vscode.commands.executeCommand(
                'workbench.action.openGlobalKeybindings',
                'file-bind'
            );
        })
    );
}

export function deactivate() {}