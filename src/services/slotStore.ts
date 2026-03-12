import * as vscode from 'vscode';
import { WORKSPACE_STATE_KEY } from '../config/constants';
import type { SlotRecord } from '../types/slots';

const DEFAULT_SET_NAME = 'default';
const ACTIVE_SET_STATE_KEY = 'activeSet';
const SLOT_SETS_STATE_KEY = 'slotSets';

// Slot store manages core retrieval and saving of slot bindings
export interface SlotStore {
    getSlots: () => SlotRecord;
    saveSlots: (slots: SlotRecord) => Promise<void>;
}

export function createSlotStore(
    context: vscode.ExtensionContext,
    onDidSave?: () => void
): SlotStore {
    return {
        getSlots: () => readSlotsForActiveSet(context.workspaceState),
        saveSlots: async (slots: SlotRecord) => {
            const activeSet = getActiveSetName(context.workspaceState);

            if (activeSet === DEFAULT_SET_NAME) {
                await context.workspaceState.update(WORKSPACE_STATE_KEY, slots);
                onDidSave?.();
                return;
            }

            const slotSets = readSlotSets(context.workspaceState);
            const updatedSlotSets: Record<string, SlotRecord> = {
                ...slotSets,
                [activeSet]: slots
            };

            await context.workspaceState.update(SLOT_SETS_STATE_KEY, updatedSlotSets);
            onDidSave?.();
        }
    };
}

// Sets are stored as a record of slot stores. Basically a way to save multiple slot configs 
function readSlotsForActiveSet(state: vscode.Memento): SlotRecord {
    const activeSet = getActiveSetName(state);
    if (activeSet === DEFAULT_SET_NAME) {
        return readSlotRecord(state.get<unknown>(WORKSPACE_STATE_KEY));
    }

    const slotSets = readSlotSets(state);
    return slotSets[activeSet] ?? {};
}

function getActiveSetName(state: vscode.Memento): string {
    const activeSet = state.get<string>(ACTIVE_SET_STATE_KEY, DEFAULT_SET_NAME);
    return activeSet.trim() ? activeSet : DEFAULT_SET_NAME;
}

function readSlotSets(state: vscode.Memento): Record<string, SlotRecord> {
    const raw = state.get<unknown>(SLOT_SETS_STATE_KEY);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {};
    }

    const slotSets: Record<string, SlotRecord> = {};
    for (const [setName, slots] of Object.entries(raw as Record<string, unknown>)) {
        if (!setName || setName === DEFAULT_SET_NAME) {
            continue;
        }

        const slotRecord = readSlotRecord(slots);
        slotSets[setName] = slotRecord;
    }

    return slotSets;
}

function readSlotRecord(value: unknown): SlotRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    const parsed: SlotRecord = {};
    for (const [slotKey, binding] of Object.entries(value)) {
        const parsedBinding = parseSlotBinding(slotKey, binding);
        if (!parsedBinding) {
            continue;
        }

        parsed[slotKey] = parsedBinding;
    }

    return parsed;
}

function parseSlotBinding(slotKey: string, value: unknown): SlotRecord[string] | undefined {
    if (!/^\d+$/.test(slotKey) || !value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    const binding = value as {
        filePath?: unknown;
        line?: unknown;
        character?: unknown;
        mode?: unknown;
    };

    const mode = binding.mode;
    if (typeof binding.filePath !== 'string' ||
        !Number.isInteger(binding.line) || (binding.line as number) < 0 ||
        !Number.isInteger(binding.character) || (binding.character as number) < 0 ||
        (mode !== undefined && mode !== 'auto' && mode !== 'static')) {
        return undefined;
    }

    return {
        filePath: binding.filePath,
        line: binding.line as number,
        character: binding.character as number,
        mode: mode as 'auto' | 'static' | undefined
    };
}
