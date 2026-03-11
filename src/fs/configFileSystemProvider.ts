import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'util';
import type { SlotStore } from '../services/slotStore';
import { parseSlotRecord } from '../services/slotValidation';

export class ConfigFileSystemProvider implements vscode.FileSystemProvider {
    private readonly onDidChangeFileEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this.onDidChangeFileEmitter.event;

    constructor(private readonly slotStore: SlotStore) {}

    watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        return new vscode.Disposable(() => { });
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        if (uri.path === '/slots.json') {
            return {
                type: vscode.FileType.File,
                ctime: Date.now(),
                mtime: Date.now(),
                size: 0
            };
        }

        if (uri.path === '/') {
            return {
                type: vscode.FileType.Directory,
                ctime: Date.now(),
                mtime: Date.now(),
                size: 0
            };
        }

        throw vscode.FileSystemError.FileNotFound();
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
        if (uri.path === '/') {
            return [['slots.json', vscode.FileType.File]];
        }

        return [];
    }

    createDirectory(_uri: vscode.Uri): void {
        throw vscode.FileSystemError.NoPermissions();
    }

    readFile(uri: vscode.Uri): Uint8Array {
        // Virtual config read
        if (uri.path !== '/slots.json') {
            throw vscode.FileSystemError.FileNotFound();
        }

        const slots = this.slotStore.getSlots();
        const json = JSON.stringify(slots, null, 4);
        return new TextEncoder().encode(json);
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array, _options: { create: boolean; overwrite: boolean; }): Promise<void> {
        // Virtual config write + validation
        if (uri.path !== '/slots.json') {
            throw vscode.FileSystemError.NoPermissions();
        }

        try {
            const json = new TextDecoder().decode(content);
            const slots = parseSlotRecord(json);
            await this.slotStore.saveSlots(slots);
        } catch {
            throw vscode.FileSystemError.Unavailable('Invalid JSON');
        }
    }

    delete(_uri: vscode.Uri, _options: { recursive: boolean; }): void {
        throw vscode.FileSystemError.NoPermissions();
    }

    rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean; }): void {
        throw vscode.FileSystemError.NoPermissions();
    }

    refresh(uri: vscode.Uri): void {
        this.onDidChangeFileEmitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    }
}
