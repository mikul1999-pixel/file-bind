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
    statusBarItem.tooltip = 'File Bind';
    context.subscriptions.push(statusBarItem);
    return statusBarItem;
}

function buildStatusBarTooltip(activeSet: string): vscode.MarkdownString {
    const fileBindSettingsArg = encodeURIComponent('"@ext:mikul.file-bind"');
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportThemeIcons = true;
    markdown.appendMarkdown(`**File Bind** \`${activeSet}\`\n\n`);
    markdown.appendMarkdown('*Click to view bindings and jump between slots*\n\n');
    markdown.appendMarkdown(
        '[Open config.json](command:file-bind.openAllSetsConfig) • ' +
        '[Manage Sets](command:file-bind.manageSlotSets) • ' +
        `[$(gear) Settings](command:workbench.action.openSettings?${fileBindSettingsArg})`
    );
    return markdown;
}

export function updateStatusBarDisplay(
    statusBarItem: vscode.StatusBarItem,
    slots: SlotRecord,
    activeSet: string
): void {
    // Render slot preview text
    const slotCount = getSlotCount();
    const previewLimit = getPreviewLimit();
    const activeFilePath = getActiveFilePath();
    statusBarItem.tooltip = buildStatusBarTooltip(activeSet);

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
