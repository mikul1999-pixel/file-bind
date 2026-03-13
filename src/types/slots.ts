import * as vscode from 'vscode';

export interface SlotBinding {
    filePath: string;
    line: number;
    character: number;
    mode?: 'auto' | 'static';
}

export type SlotRecord = Record<string, SlotBinding>;

export interface SlotSetsConfig {
    activeSet: string;
    default: SlotRecord;
    sets: Record<string, SlotRecord>;
}

export interface SlotUpdate {
    slot: string;
    oldName: string;
    newName: string;
}

export interface QuickPickItemSlot extends vscode.QuickPickItem {
    slotNumber?: number;
}
