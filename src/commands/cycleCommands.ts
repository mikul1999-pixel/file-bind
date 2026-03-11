import * as vscode from 'vscode';
import { SlotCycleTracker } from '../services/slotCycleTracker';

export function registerCycleCommands(
    context: vscode.ExtensionContext,
    cycleTracker: SlotCycleTracker
): void {
    // Cycle through non-empty slots
    context.subscriptions.push(
        vscode.commands.registerCommand('file-bind.cycleSlotsForward', async () => {
            await cycleSlot(cycleTracker, 'forward');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('file-bind.cycleSlotsBackward', async () => {
            await cycleSlot(cycleTracker, 'backward');
        })
    );
}

async function cycleSlot(
    cycleTracker: SlotCycleTracker,
    direction: 'forward' | 'backward'
): Promise<void> {
    const slotNumber = cycleTracker.getNextSlot(direction);
    if (!slotNumber) {
        vscode.window.showInformationMessage('No bound slots to cycle');
        return;
    }

    await vscode.commands.executeCommand('file-bind.jumpToSlot', slotNumber);
}
