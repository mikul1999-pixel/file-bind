import { getSlotCount } from '../config/settings';
import type { SlotStore } from './slotStore';
import { getSlotKey } from '../utils/slots';
import { getActiveFilePath } from '../utils/workspace';

export class SlotCycleTracker {
    private lastCycledSlot: number | undefined;

    constructor(private readonly slotStore: SlotStore) {}

    // Get the next slot to cycle. Based on current file + last cycled slot
    getNextSlot(direction: 'forward' | 'backward'): number | undefined {
        const slots = this.slotStore.getSlots();
        const slotCount = getSlotCount();
        const activeFilePath = getActiveFilePath();

        const boundSlots: number[] = [];
        for (let slot = 1; slot <= slotCount; slot += 1) {
            if (slots[getSlotKey(slot)]) {
                boundSlots.push(slot);
            }
        }

        if (boundSlots.length === 0) {
            return undefined;
        }

        let anchor: number;
        if (activeFilePath) {
            const activeSlot = boundSlots.find((slot) => slots[getSlotKey(slot)]?.filePath === activeFilePath);
            if (activeSlot !== undefined) {
                anchor = activeSlot;
            } else if (this.lastCycledSlot && boundSlots.includes(this.lastCycledSlot)) {
                anchor = this.lastCycledSlot;
            } else {
                anchor = direction === 'forward' ? 0 : slotCount + 1;
            }
        } else if (this.lastCycledSlot && boundSlots.includes(this.lastCycledSlot)) {
            anchor = this.lastCycledSlot;
        } else {
            anchor = direction === 'forward' ? 0 : slotCount + 1;
        }

        const target = direction === 'forward'
            ? this.nextForward(boundSlots, anchor)
            : this.nextBackward(boundSlots, anchor);

        this.lastCycledSlot = target;
        return target;
    }

    private nextForward(boundSlots: number[], anchor: number): number {
        for (const slot of boundSlots) {
            if (slot > anchor) {
                return slot;
            }
        }

        return boundSlots[0];
    }

    private nextBackward(boundSlots: number[], anchor: number): number {
        for (let i = boundSlots.length - 1; i >= 0; i -= 1) {
            if (boundSlots[i] < anchor) {
                return boundSlots[i];
            }
        }

        return boundSlots[boundSlots.length - 1];
    }
}
