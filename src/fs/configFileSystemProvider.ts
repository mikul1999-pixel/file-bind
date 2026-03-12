import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'util';
import type { SlotStore } from '../services/slotStore';
import { parseSlotRecord } from '../services/slotValidation';
import type { SlotRecord } from '../types/slots';

const ROOT_PATH = '/';
const ROOT_SLOTS_PATH = '/slots.json';
const SETS_PATH = '/sets';
const SET_FILE_NAME = 'slots.json';
const DEFAULT_SET_NAME = 'default';

type ConfigPathType =
    | { kind: 'root' }
    | { kind: 'rootSlots' }
    | { kind: 'sets' }
    | { kind: 'setDir'; setName: string }
    | { kind: 'setSlots'; setName: string }
    | { kind: 'unknown' };

export class ConfigFileSystemProvider implements vscode.FileSystemProvider {
    private readonly onDidChangeFileEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this.onDidChangeFileEmitter.event;

    constructor(private readonly slotStore: SlotStore) {}

    watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        return new vscode.Disposable(() => { });
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        const pathType = parsePath(uri.path);

        if (pathType.kind === 'rootSlots' || pathType.kind === 'setSlots') {
            const exists = pathType.kind === 'rootSlots'
                ? true
                : pathType.setName !== DEFAULT_SET_NAME && this.slotStore.getSetNames().includes(pathType.setName);
            if (!exists) {
                throw vscode.FileSystemError.FileNotFound();
            }

            return {
                type: vscode.FileType.File,
                ctime: Date.now(),
                mtime: Date.now(),
                size: 0
            };
        }

        if (pathType.kind === 'root' || pathType.kind === 'sets') {
            return {
                type: vscode.FileType.Directory,
                ctime: Date.now(),
                mtime: Date.now(),
                size: 0
            };
        }

        if (pathType.kind === 'setDir') {
            const exists = pathType.setName !== DEFAULT_SET_NAME && this.slotStore.getSetNames().includes(pathType.setName);
            if (!exists) {
                throw vscode.FileSystemError.FileNotFound();
            }

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
        const pathType = parsePath(uri.path);

        if (pathType.kind === 'root') {
            return [
                [SET_FILE_NAME, vscode.FileType.File],
                ['sets', vscode.FileType.Directory]
            ];
        }

        if (pathType.kind === 'sets') {
            return this.slotStore
                .getSetNames()
                .filter((setName) => setName !== DEFAULT_SET_NAME)
                .map((setName) => [setName, vscode.FileType.Directory]);
        }

        if (pathType.kind === 'setDir') {
            if (!this.slotStore.getSetNames().includes(pathType.setName) || pathType.setName === DEFAULT_SET_NAME) {
                return [];
            }

            return [[SET_FILE_NAME, vscode.FileType.File]];
        }

        return [];
    }

    createDirectory(uri: vscode.Uri): void {
        const pathType = parsePath(uri.path);
        if (pathType.kind === 'sets') {
            return;
        }

        if (pathType.kind === 'setDir' && pathType.setName !== DEFAULT_SET_NAME) {
            if (this.slotStore.getSetNames().includes(pathType.setName)) {
                return;
            }

            void this.slotStore.saveSlotsForSet(pathType.setName, {}).then(() => {
                this.refresh(uri);
            });
            return;
        }

        throw vscode.FileSystemError.NoPermissions();
    }

    readFile(uri: vscode.Uri): Uint8Array {
        const pathType = parsePath(uri.path);
        if (pathType.kind === 'unknown') {
            throw vscode.FileSystemError.FileNotFound();
        }

        // Virtual config read
        let slots: SlotRecord;
        if (pathType.kind === 'rootSlots') {
            slots = this.slotStore.getSlotsForSet(DEFAULT_SET_NAME);
        } else if (pathType.kind === 'setSlots') {
            if (pathType.setName === DEFAULT_SET_NAME || !this.slotStore.getSetNames().includes(pathType.setName)) {
                throw vscode.FileSystemError.FileNotFound();
            }

            slots = this.slotStore.getSlotsForSet(pathType.setName);
        } else {
            throw vscode.FileSystemError.FileNotFound();
        }

        const json = JSON.stringify(slots, null, 4);
        return new TextEncoder().encode(json);
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Promise<void> {
        // Virtual config write + validation
        const pathType = parsePath(uri.path);
        if (pathType.kind !== 'rootSlots' && pathType.kind !== 'setSlots') {
            throw vscode.FileSystemError.NoPermissions();
        }

        if (pathType.kind === 'setSlots' && pathType.setName === DEFAULT_SET_NAME) {
            throw vscode.FileSystemError.NoPermissions();
        }

        let slots: SlotRecord;
        try {
            const json = new TextDecoder().decode(content);
            slots = parseSlotRecord(json);
        } catch {
            throw vscode.FileSystemError.Unavailable('Invalid JSON');
        }

        try {
            if (pathType.kind === 'rootSlots') {
                await this.slotStore.saveSlotsForSet(DEFAULT_SET_NAME, slots);
            } else {
                const setExists = this.slotStore.getSetNames().includes(pathType.setName);
                if (!setExists && !options.create) {
                    throw vscode.FileSystemError.FileNotFound();
                }

                await this.slotStore.saveSlotsForSet(pathType.setName, slots);
            }

            this.refresh(uri);
        } catch {
            throw vscode.FileSystemError.Unavailable('Could not write slots');
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

function parsePath(path: string): ConfigPathType {
    if (path === ROOT_PATH) {
        return { kind: 'root' };
    }

    if (path === ROOT_SLOTS_PATH) {
        return { kind: 'rootSlots' };
    }

    if (path === SETS_PATH) {
        return { kind: 'sets' };
    }

    const setDirMatch = /^\/sets\/([^/]+)$/.exec(path);
    if (setDirMatch) {
        return { kind: 'setDir', setName: setDirMatch[1] };
    }

    const setSlotsMatch = /^\/sets\/([^/]+)\/slots\.json$/.exec(path);
    if (setSlotsMatch) {
        return { kind: 'setSlots', setName: setSlotsMatch[1] };
    }

    return { kind: 'unknown' };
}
