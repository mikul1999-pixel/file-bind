import * as vscode from 'vscode';
import { clampPosition } from '../utils/positions';
import { EditorTracker } from '../services/editorTracker';

export function registerJumpPreviousCommand(
    context: vscode.ExtensionContext,
    editorTracker: EditorTracker
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('file-bind.jumpPrevious', async () => {
            // Jump to previously active file and cursor
            const planned = editorTracker.planPreviousJump();
            if (!planned.target) {
                vscode.window.showInformationMessage('No previous file');
                return;
            }

            try {
                const target = planned.target;
                const document = await vscode.workspace.openTextDocument(target.uri);
                const editor = await vscode.window.showTextDocument(document, {
                    viewColumn: target.viewColumn,
                    preserveFocus: false,
                    preview: false
                });

                const position = clampPosition(document, target.line, target.character);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(
                    new vscode.Range(position, position),
                    vscode.TextEditorRevealType.InCenter
                );

                editorTracker.setLastEditor(editor);
            } catch {
                vscode.window.showWarningMessage('Could not open previous file');
            }
        })
    );
}
