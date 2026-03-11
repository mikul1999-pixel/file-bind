import { MAX_SLOT_COUNT } from '../config/constants';
import type { SlotBinding, SlotRecord } from '../types/slots';

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
