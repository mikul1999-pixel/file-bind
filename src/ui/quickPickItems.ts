import * as vscode from 'vscode';
import { PICK_ACTIONS, PICK_ICONS } from '../config/constants';
import { getSlotCount } from '../config/settings';
import type { QuickPickActionId, QuickPickItemSlot, SlotRecord } from '../types/slots';
import { getSlotKey } from '../utils/slots';
import { getActiveFilePath } from '../utils/workspace';

interface QuickPickActionItem {
    label: string;
    description: string;
    actionId: QuickPickActionId;
}

export const QUICK_PICK_ACTION_ITEMS: QuickPickActionItem[] = [
    {
        label: 'Manage Slot Sets',
        description: 'Open panel with saved sets',
        actionId: 'manageSlotSets'
    },
    {
        label: 'Edit Current Set',
        description: 'Open slots.json',
        actionId: 'editCurrentSlots'
    },
    {
        label: 'Edit All Sets',
        description: 'Open config.json',
        actionId: 'editAllSets'
    }
];

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

    for (const actionItem of QUICK_PICK_ACTION_ITEMS) {
        items.push(actionItem);
    }

    return items;
}
