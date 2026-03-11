import { getSlotCount } from '../config/settings';
import type { SlotBinding, SlotRecord } from '../types/slots';

export function getSlotKey(slotNumber: number): string {
    return slotNumber.toString();
}

export function isSlotEnabled(slotNumber: number): boolean {
    return slotNumber <= getSlotCount();
}

export function findSlotByPath(slots: SlotRecord, filePath: string): [string, SlotBinding] | undefined {
    return Object.entries(slots).find(([_, binding]) => binding.filePath === filePath);
}
