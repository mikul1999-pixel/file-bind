import * as vscode from 'vscode';
import { type JumpLocation, planPreviousJump } from './jumpPreviousState';

export type EditorLocation = JumpLocation<vscode.Uri>;

export interface PlannedEditorJump {
    target: EditorLocation | undefined;
}

export class EditorTracker {
    private lastEditor: vscode.TextEditor | undefined;
    private previousLocation: EditorLocation | undefined;

    initialize(): void {
        this.lastEditor = vscode.window.activeTextEditor;
    }

    trackEditorChange(newEditor: vscode.TextEditor | undefined): vscode.TextEditor | undefined {
        // Save editor location when switching files
        const leavingEditor = this.lastEditor;

        if (leavingEditor && leavingEditor !== newEditor) {
            this.previousLocation = this.getEditorLocation(leavingEditor);
        }

        this.lastEditor = newEditor;
        return leavingEditor && leavingEditor !== newEditor ? leavingEditor : undefined;
    }

    planPreviousJump(): PlannedEditorJump {
        // Swap current/previous locations to allow jumping back and forth
        const currentLocation = vscode.window.activeTextEditor
            ? this.getEditorLocation(vscode.window.activeTextEditor)
            : undefined;

        const planned = planPreviousJump(this.previousLocation, currentLocation);
        this.previousLocation = planned.nextPrevious;

        return { target: planned.target };
    }

    setLastEditor(editor: vscode.TextEditor | undefined): void {
        this.lastEditor = editor;
    }

    private getEditorLocation(editor: vscode.TextEditor): EditorLocation {
        return {
            uri: editor.document.uri,
            line: editor.selection.active.line,
            character: editor.selection.active.character,
            viewColumn: editor.viewColumn
        };
    }
}
