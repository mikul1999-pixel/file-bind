import { MAX_SLOT_COUNT } from '../config/constants';
import type { SlotBinding, SlotRecord, SlotSetsConfig } from '../types/slots';
import {
    DEFAULT_SET_NAME,
    isValidSetName,
    normalizeSetName
} from './slotSetRules';

// Validation for individual slot bindings / records
function isSlotBinding(value: unknown): value is SlotBinding {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Partial<SlotBinding>;
    const isModeValid =
        candidate.mode === undefined ||
        candidate.mode === 'auto' ||
        candidate.mode === 'static';

    return typeof candidate.filePath === 'string' &&
        typeof candidate.line === 'number' &&
        Number.isInteger(candidate.line) &&
        candidate.line >= 0 &&
        typeof candidate.character === 'number' &&
        Number.isInteger(candidate.character) &&
        candidate.character >= 0 &&
        isModeValid;
}

export function parseSlotRecord(json: string): SlotRecord {
    const parsed: unknown = JSON.parse(json);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid slots format');
    }

    const result: SlotRecord = {};
    for (const [slot, binding] of Object.entries(parsed as Record<string, unknown>)) {
        const slotNumber = Number(slot);
        if (!Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > MAX_SLOT_COUNT) {
            throw new Error(`Invalid slot key: ${slot}`);
        }

        if (!isSlotBinding(binding)) {
            throw new Error(`Invalid slot binding: ${slot}`);
        }

        result[slot] = binding;
    }

    return result;
}

// Validation for the overall slot sets json
export function parseSlotSetsConfig(json: string): SlotSetsConfig {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid slot sets config format');
    }

    const raw = parsed as Record<string, unknown>;
    const allowedKeys = new Set(['activeSet', 'default', 'sets']);
    const unknownKeys = Object.keys(raw).filter((key) => !allowedKeys.has(key));
    if (unknownKeys.length > 0) {
        throw new Error(`Unknown top-level keys: ${unknownKeys.join(', ')}`);
    }

    if (!('activeSet' in raw) || !('default' in raw) || !('sets' in raw)) {
        throw new Error('Required keys: activeSet, default, sets');
    }

    if (typeof raw.activeSet !== 'string') {
        throw new Error('activeSet must be a string');
    }

    const defaultSlots = parseSlotRecord(JSON.stringify(raw.default));

    const rawSets = raw.sets;
    if (!rawSets || typeof rawSets !== 'object' || Array.isArray(rawSets)) {
        throw new Error('sets must be an object');
    }

    const sets: Record<string, SlotRecord> = {};
    for (const [setName, value] of Object.entries(rawSets as Record<string, unknown>)) {
        const normalizedSetName = normalizeSetName(setName);
        if (!isValidSetName(normalizedSetName)) {
            throw new Error(`Invalid set name: ${setName}`);
        }

        if (normalizedSetName === DEFAULT_SET_NAME) {
            throw new Error('default cannot appear under sets');
        }

        if (sets[normalizedSetName]) {
            throw new Error(`Duplicate set name after normalization: ${setName}`);
        }

        sets[normalizedSetName] = parseSlotRecord(JSON.stringify(value));
    }

    const normalizedActiveSet = normalizeSetName(raw.activeSet);
    if (!isValidSetName(normalizedActiveSet, { allowDefault: true })) {
        throw new Error(`Invalid activeSet: ${raw.activeSet}`);
    }

    const activeSet = normalizedActiveSet === DEFAULT_SET_NAME || sets[normalizedActiveSet]
        ? normalizedActiveSet
        : DEFAULT_SET_NAME;

    return {
        activeSet,
        default: defaultSlots,
        sets
    };
}
