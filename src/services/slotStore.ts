import * as vscode from 'vscode';
import { WORKSPACE_STATE_KEY } from '../config/constants';
import type { SlotRecord, SlotSetsConfig } from '../types/slots';
import {
    assertValidSetName,
    DEFAULT_SET_NAME,
    isValidSetName,
    normalizeSetName
} from './slotSetRules';
import { isWorkspaceRelativePath } from '../utils/workspace';

const ACTIVE_SET_STATE_KEY = 'activeSet';
const SLOT_SETS_STATE_KEY = 'slotSets';

// Slot store manages core retrieval and saving of slot bindings
export interface SlotStore {
    getActiveSet: () => string;
    setActiveSet: (setName: string) => Promise<void>;
    getSetNames: () => string[];
    getSlotsForSet: (setName: string) => SlotRecord;
    saveSlotsForSet: (setName: string, slots: SlotRecord) => Promise<void>;
    createSet: (setName: string, sourceSetName?: string) => Promise<void>;
    renameSet: (setName: string, nextSetName: string) => Promise<void>;
    deleteSet: (setName: string) => Promise<void>;
    getAllSetsConfig: () => SlotSetsConfig;
    replaceAllSetsConfig: (config: SlotSetsConfig) => Promise<void>;
    getSlots: () => SlotRecord;
    saveSlots: (slots: SlotRecord) => Promise<void>;
}

export function createSlotStore(
    context: vscode.ExtensionContext,
    onDidSave?: () => void
): SlotStore {
    return {
        getActiveSet: () => getActiveSetName(context.workspaceState),
        setActiveSet: async (setName: string) => {
            const normalizedSetName = normalizeSetName(setName);
            const targetSet = normalizedSetName || DEFAULT_SET_NAME;
            if (!isValidSetName(targetSet, { allowDefault: true })) {
                throw new Error('Invalid set name');
            }

            if (targetSet !== DEFAULT_SET_NAME) {
                const slotSets = readSlotSets(context.workspaceState);
                if (!slotSets[targetSet]) {
                    const updatedSlotSets: Record<string, SlotRecord> = {
                        ...slotSets,
                        [targetSet]: {}
                    };
                    await context.workspaceState.update(SLOT_SETS_STATE_KEY, updatedSlotSets);
                }
            }

            await context.workspaceState.update(ACTIVE_SET_STATE_KEY, targetSet);
            onDidSave?.();
        },
        getSetNames: () => {
            const slotSets = readSlotSets(context.workspaceState);
            return [DEFAULT_SET_NAME, ...Object.keys(slotSets).sort()];
        },
        getSlotsForSet: (setName: string) => {
            const normalizedSetName = normalizeSetName(setName);
            if (!normalizedSetName || normalizedSetName === DEFAULT_SET_NAME) {
                return readSlotRecord(context.workspaceState.get<unknown>(WORKSPACE_STATE_KEY));
            }

            const slotSets = readSlotSets(context.workspaceState);
            return slotSets[normalizedSetName] ?? {};
        },
        saveSlotsForSet: async (setName: string, slots: SlotRecord) => {
            const normalizedSetName = normalizeSetName(setName);
            const targetSet = normalizedSetName || DEFAULT_SET_NAME;
            if (!isValidSetName(targetSet, { allowDefault: true })) {
                throw new Error('Invalid set name');
            }

            if (targetSet === DEFAULT_SET_NAME) {
                await context.workspaceState.update(WORKSPACE_STATE_KEY, slots);
                onDidSave?.();
                return;
            }

            const slotSets = readSlotSets(context.workspaceState);
            const updatedSlotSets: Record<string, SlotRecord> = {
                ...slotSets,
                [targetSet]: slots
            };

            await context.workspaceState.update(SLOT_SETS_STATE_KEY, updatedSlotSets);
            onDidSave?.();
        },
        createSet: async (setName: string, sourceSetName?: string) => {
            const normalizedSetName = assertValidSetName(setName);

            const slotSets = readSlotSets(context.workspaceState);
            if (slotSets[normalizedSetName]) {
                throw new Error('Slot set already exists');
            }

            const sourceSet = normalizeSetName(sourceSetName ?? getActiveSetName(context.workspaceState));
            const sourceSlots = sourceSet === DEFAULT_SET_NAME
                ? readSlotRecord(context.workspaceState.get<unknown>(WORKSPACE_STATE_KEY))
                : slotSets[sourceSet] ?? {};

            const updatedSlotSets: Record<string, SlotRecord> = {
                ...slotSets,
                [normalizedSetName]: { ...sourceSlots }
            };

            await context.workspaceState.update(SLOT_SETS_STATE_KEY, updatedSlotSets);
            onDidSave?.();
        },
        renameSet: async (setName: string, nextSetName: string) => {
            const normalizedSetName = assertValidSetName(setName);
            const normalizedNextSetName = assertValidSetName(nextSetName);

            if (normalizedSetName === normalizedNextSetName) {
                return;
            }

            const slotSets = readSlotSets(context.workspaceState);
            if (!slotSets[normalizedSetName]) {
                throw new Error('Slot set not found');
            }

            if (slotSets[normalizedNextSetName]) {
                throw new Error('Slot set already exists');
            }

            const { [normalizedSetName]: currentSlots, ...rest } = slotSets;
            const updatedSlotSets: Record<string, SlotRecord> = {
                ...rest,
                [normalizedNextSetName]: currentSlots
            };

            await context.workspaceState.update(SLOT_SETS_STATE_KEY, updatedSlotSets);

            if (getActiveSetName(context.workspaceState) === normalizedSetName) {
                await context.workspaceState.update(ACTIVE_SET_STATE_KEY, normalizedNextSetName);
            }

            onDidSave?.();
        },
        deleteSet: async (setName: string) => {
            const normalizedSetName = normalizeSetName(setName);
            if (normalizedSetName === DEFAULT_SET_NAME) {
                throw new Error('Cannot delete default set');
            }

            if (!isValidSetName(normalizedSetName)) {
                throw new Error('Invalid set name');
            }

            const slotSets = readSlotSets(context.workspaceState);
            if (!slotSets[normalizedSetName]) {
                return;
            }

            const { [normalizedSetName]: _removed, ...rest } = slotSets;
            await context.workspaceState.update(SLOT_SETS_STATE_KEY, rest);

            if (getActiveSetName(context.workspaceState) === normalizedSetName) {
                await context.workspaceState.update(ACTIVE_SET_STATE_KEY, DEFAULT_SET_NAME);
            }

            onDidSave?.();
        },
        getAllSetsConfig: () => ({
            activeSet: getActiveSetName(context.workspaceState),
            default: readSlotRecord(context.workspaceState.get<unknown>(WORKSPACE_STATE_KEY)),
            sets: readSlotSets(context.workspaceState)
        }),
        replaceAllSetsConfig: async (config: SlotSetsConfig) => {
            const normalizedActiveSet = normalizeSetName(config.activeSet);
            const slotSets: Record<string, SlotRecord> = {};

            for (const [setName, slots] of Object.entries(config.sets)) {
                const normalizedSetName = assertValidSetName(setName);
                slotSets[normalizedSetName] = slots;
            }

            const activeSet = normalizedActiveSet === DEFAULT_SET_NAME || slotSets[normalizedActiveSet]
                ? normalizedActiveSet
                : DEFAULT_SET_NAME;

            await context.workspaceState.update(WORKSPACE_STATE_KEY, config.default);
            await context.workspaceState.update(SLOT_SETS_STATE_KEY, slotSets);
            await context.workspaceState.update(ACTIVE_SET_STATE_KEY, activeSet);
            onDidSave?.();
        },
        getSlots: () => readSlotsForActiveSet(context.workspaceState),
        saveSlots: async (slots: SlotRecord) => {
            const activeSet = getActiveSetName(context.workspaceState);
            await saveSlotsForSet(context.workspaceState, activeSet, slots);
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
    const normalizedSetName = normalizeSetName(activeSet);
    if (!normalizedSetName) {
        return DEFAULT_SET_NAME;
    }

    if (normalizedSetName === DEFAULT_SET_NAME) {
        return DEFAULT_SET_NAME;
    }

    const slotSets = readSlotSets(state);
    return slotSets[normalizedSetName] ? normalizedSetName : DEFAULT_SET_NAME;
}

function readSlotSets(state: vscode.Memento): Record<string, SlotRecord> {
    const raw = state.get<unknown>(SLOT_SETS_STATE_KEY);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {};
    }

    const slotSets: Record<string, SlotRecord> = {};
    for (const [setName, slots] of Object.entries(raw as Record<string, unknown>)) {
        const normalizedSetName = normalizeSetName(setName);
        if (!isValidSetName(normalizedSetName) || normalizedSetName === DEFAULT_SET_NAME) {
            continue;
        }

        if (slotSets[normalizedSetName]) {
            continue;
        }

        const slotRecord = readSlotRecord(slots);
        slotSets[normalizedSetName] = slotRecord;
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
        !isWorkspaceRelativePath(binding.filePath) ||
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

async function saveSlotsForSet(
    state: vscode.Memento,
    setName: string,
    slots: SlotRecord
): Promise<void> {
    const normalizedSetName = normalizeSetName(setName);
    if (!isValidSetName(normalizedSetName, { allowDefault: true })) {
        throw new Error('Invalid set name');
    }

    if (normalizedSetName === DEFAULT_SET_NAME) {
        await state.update(WORKSPACE_STATE_KEY, slots);
        return;
    }

    const slotSets = readSlotSets(state);
    const updatedSlotSets: Record<string, SlotRecord> = {
        ...slotSets,
        [normalizedSetName]: slots
    };

    await state.update(SLOT_SETS_STATE_KEY, updatedSlotSets);
}
