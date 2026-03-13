import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from 'util';
import type { SlotStore } from '../services/slotStore';
import {
    ALL_SETS_CONFIG_PATH,
    CONFIG_SCHEME,
    DEFAULT_SET_NAME,
    ROOT_SLOTS_PATH,
    SETS_PATH,
    SET_FILE_NAME,
    getSetSlotsPath,
    isValidSetName,
    parseConfigPath
} from '../services/slotSetRules';
import { parseSlotRecord, parseSlotSetsConfig } from '../services/slotValidation';
import type { SlotSetsConfig } from '../types/slots';

export class ConfigFileSystemProvider implements vscode.FileSystemProvider {
    private readonly onDidChangeFileEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this.onDidChangeFileEmitter.event;

    constructor(private readonly slotStore: SlotStore) {}

    watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        return new vscode.Disposable(() => { });
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        const pathType = parseConfigPath(uri.path);

        if (pathType.kind === 'rootSlots' || pathType.kind === 'allSetsConfig' || pathType.kind === 'setSlots') {
            const exists = pathType.kind === 'setSlots'
                ? pathType.setName !== DEFAULT_SET_NAME && this.slotStore.getSetNames().includes(pathType.setName)
                : true;
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
        const pathType = parseConfigPath(uri.path);

        // Root contains the default set slots, the overall config, and the sets dir
        if (pathType.kind === 'root') {
            return [
                [SET_FILE_NAME, vscode.FileType.File],
                ['config.json', vscode.FileType.File],
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
        const pathType = parseConfigPath(uri.path);
        if (pathType.kind === 'sets') {
            return;
        }

        if (pathType.kind === 'setDir' && pathType.setName !== DEFAULT_SET_NAME) {
            if (!isValidSetName(pathType.setName)) {
                throw vscode.FileSystemError.NoPermissions();
            }

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
        const pathType = parseConfigPath(uri.path);
        if (pathType.kind === 'unknown') {
            throw vscode.FileSystemError.FileNotFound();
        }

        let json: string;
        if (pathType.kind === 'rootSlots') {
            json = JSON.stringify(this.slotStore.getSlotsForSet(DEFAULT_SET_NAME), null, 4);
        } else if (pathType.kind === 'allSetsConfig') {
            json = JSON.stringify(this.slotStore.getAllSetsConfig(), null, 4);
        } else if (pathType.kind === 'setSlots') {
            if (pathType.setName === DEFAULT_SET_NAME || !this.slotStore.getSetNames().includes(pathType.setName)) {
                throw vscode.FileSystemError.FileNotFound();
            }

            json = JSON.stringify(this.slotStore.getSlotsForSet(pathType.setName), null, 4);
        } else {
            throw vscode.FileSystemError.FileNotFound();
        }

        return new TextEncoder().encode(json);
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Promise<void> {
        const pathType = parseConfigPath(uri.path);
        if (pathType.kind !== 'rootSlots' && pathType.kind !== 'setSlots' && pathType.kind !== 'allSetsConfig') {
            throw vscode.FileSystemError.NoPermissions();
        }

        if (pathType.kind === 'setSlots' && pathType.setName === DEFAULT_SET_NAME) {
            throw vscode.FileSystemError.NoPermissions();
        }

        if (pathType.kind === 'setSlots' && !isValidSetName(pathType.setName)) {
            throw vscode.FileSystemError.NoPermissions();
        }

        const previousConfig = this.slotStore.getAllSetsConfig();

        try {
            const json = new TextDecoder().decode(content);

            if (pathType.kind === 'allSetsConfig') {
                const config = parseSlotSetsConfig(json);
                await this.slotStore.replaceAllSetsConfig(config);
                this.refreshAllConfigUris(previousConfig, config);
                return;
            }

            const slots = parseSlotRecord(json);

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
        } catch (error) {
            if (error instanceof vscode.FileSystemError) {
                throw error;
            }

            const reason = error instanceof Error ? error.message : 'Could not write config';
            throw vscode.FileSystemError.Unavailable(reason);
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

    // Refresh all sets when the overall config changes
    private refreshAllConfigUris(previousConfig: SlotSetsConfig, nextConfig: SlotSetsConfig): void {
        const paths = new Set<string>([
            ROOT_SLOTS_PATH,
            ALL_SETS_CONFIG_PATH,
            SETS_PATH,
            ...Object.keys(previousConfig.sets).map((setName) => getSetSlotsPath(setName)),
            ...Object.keys(nextConfig.sets).map((setName) => getSetSlotsPath(setName))
        ]);

        const events: vscode.FileChangeEvent[] = Array.from(paths).map((path) => ({
            type: vscode.FileChangeType.Changed,
            uri: vscode.Uri.parse(`${CONFIG_SCHEME}:${path}`)
        }));

        this.onDidChangeFileEmitter.fire(events);
    }
}
