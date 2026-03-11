import * as vscode from 'vscode';
import { WORKSPACE_STATE_KEY } from '../config/constants';
import type { SlotRecord } from '../types/slots';

export interface SlotStore {
    getSlots: () => SlotRecord;
    saveSlots: (slots: SlotRecord) => Promise<void>;
}

export function createSlotStore(
    context: vscode.ExtensionContext,
    onDidSave?: () => void
): SlotStore {
    return {
        getSlots: () => context.workspaceState.get<SlotRecord>(WORKSPACE_STATE_KEY, {}),
        saveSlots: async (slots: SlotRecord) => {
            await context.workspaceState.update(WORKSPACE_STATE_KEY, slots);
            onDidSave?.();
        }
    };
}
