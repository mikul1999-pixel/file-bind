import * as path from 'path';
import * as vscode from 'vscode';
import { STATUS_ICONS } from '../config/constants';
import { getPreviewLimit, getSlotCount } from '../config/settings';
import type { SlotRecord } from '../types/slots';
import { getActiveFilePath } from '../utils/workspace';

function getIconLabel(id: string): string {
    return `$(${id})`;
}

export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.command = 'file-bind.showStatus';
    statusBarItem.tooltip = 'Click to view all file bindings';
    context.subscriptions.push(statusBarItem);
    return statusBarItem;
}

export function updateStatusBarDisplay(statusBarItem: vscode.StatusBarItem, slots: SlotRecord): void {
    // Render slot preview text
    const slotCount = getSlotCount();
    const previewLimit = getPreviewLimit();
    const activeFilePath = getActiveFilePath();

    const slotTexts = Array.from({ length: slotCount }, (_, i) => {
        const slotNumber = i + 1;
        const binding = slots[slotNumber.toString()];

        if (!binding) {
            return null;
        }

        const fileName = path.basename(binding.filePath);
        const isActive = activeFilePath === binding.filePath;
        const icon = isActive ? getIconLabel(STATUS_ICONS.ACTIVE) : getIconLabel(STATUS_ICONS.DEFAULT);
        return `${icon} ${slotNumber} ${fileName}:${binding.line + 1}`;
    }).filter((text): text is string => text !== null);

    if (slotTexts.length === 0) {
        statusBarItem.hide();
        return;
    }

    const visible = slotTexts.slice(0, previewLimit);
    const overflow = slotTexts.length - previewLimit;
    if (overflow > 0) {
        visible.push(`+${overflow}`);
    }

    statusBarItem.text = visible.join('  ');
    statusBarItem.show();
}
