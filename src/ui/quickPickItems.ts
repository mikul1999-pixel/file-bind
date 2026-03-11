import * as vscode from 'vscode';
import { PICK_ACTIONS, PICK_ICONS } from '../config/constants';
import { getSlotCount } from '../config/settings';
import type { QuickPickItemSlot, SlotRecord } from '../types/slots';
import { getSlotKey } from '../utils/slots';
import { getActiveFilePath } from '../utils/workspace';

function getIconLabel(id: string): string {
    return `$(${id})`;
}

export function createQuickPickItems(slots: SlotRecord): QuickPickItemSlot[] {
    const slotCount = getSlotCount();
    const activeFilePath = getActiveFilePath();

    const items: QuickPickItemSlot[] = Array.from({ length: slotCount }, (_, i) => {
        const slotNumber = i + 1;
        const binding = slots[getSlotKey(slotNumber)];

        if (binding) {
            const lineInfo = `Line ${binding.line + 1}:${binding.character + 1}`;
            const modeInfo = binding.mode ?? 'auto';
            const isActive = activeFilePath === binding.filePath;
            const icon = isActive ? getIconLabel(PICK_ICONS.BOUND_ACTIVE) : getIconLabel(PICK_ICONS.BOUND);

            return {
                label: `${icon} Slot ${slotNumber}: ${binding.filePath}`,
                description: `${lineInfo} - ${modeInfo}`,
                slotNumber,
                buttons: [
                    {
                        iconPath: new vscode.ThemeIcon(PICK_ACTIONS.REBIND),
                        tooltip: 'Re-bind current file to this slot'
                    },
                    {
                        iconPath: new vscode.ThemeIcon(PICK_ACTIONS.CLEAR),
                        tooltip: 'Clear this slot'
                    }
                ]
            };
        }

        return {
            label: `${getIconLabel(PICK_ICONS.EMPTY)} Slot ${slotNumber}: Empty`,
            description: '',
            slotNumber,
            buttons: [
                {
                    iconPath: new vscode.ThemeIcon(PICK_ACTIONS.BIND),
                    tooltip: 'Bind current file to this slot'
                }
            ]
        };
    });

    items.push({
        label: '',
        kind: vscode.QuickPickItemKind.Separator
    });

    items.push({
        label: '$(gear) Configure Slots',
        description: 'Open slots.json config file'
    });

    return items;
}
