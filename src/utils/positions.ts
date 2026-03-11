import * as vscode from 'vscode';

export function clampPosition(document: vscode.TextDocument, line: number, character: number): vscode.Position {
    const maxLine = Math.max(document.lineCount - 1, 0);
    const safeLine = Math.min(Math.max(line, 0), maxLine);
    const maxCharacter = document.lineAt(safeLine).range.end.character;
    const safeCharacter = Math.min(Math.max(character, 0), maxCharacter);
    return new vscode.Position(safeLine, safeCharacter);
}
