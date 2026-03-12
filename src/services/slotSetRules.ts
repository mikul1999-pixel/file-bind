import * as vscode from 'vscode';

export const DEFAULT_SET_NAME = 'default';
const SET_NAME_REGEX = /^[a-z0-9][a-z0-9._-]*$/;

export const CONFIG_SCHEME = 'file-bind-config';
export const ROOT_SLOTS_PATH = '/slots.json';
export const SETS_PATH = '/sets';
export const SET_FILE_NAME = 'slots.json';

interface SetNameValidationOptions {
    allowDefault?: boolean;
}

export type ConfigPathType =
    | { kind: 'root' }
    | { kind: 'rootSlots' }
    | { kind: 'sets' }
    | { kind: 'setDir'; setName: string }
    | { kind: 'setSlots'; setName: string }
    | { kind: 'unknown' };

// Naming rules for slot sets
export function normalizeSetName(value: string): string {
    return value.trim().toLowerCase();
}

export function validateSetName(
    value: string,
    options: SetNameValidationOptions = {}
): string | undefined {
    const { allowDefault = false } = options;
    const normalized = normalizeSetName(value);

    if (!normalized) {
        return 'Set name is required';
    }

    if (normalized === DEFAULT_SET_NAME && !allowDefault) {
        return 'default is reserved';
    }

    if (!SET_NAME_REGEX.test(normalized)) {
        return 'Use a slug: lowercase letters, numbers, ., _, -';
    }

    return undefined;
}

export function isValidSetName(
    value: string,
    options: SetNameValidationOptions = {}
): boolean {
    return validateSetName(value, options) === undefined;
}

export function assertValidSetName(
    value: string,
    options: SetNameValidationOptions = {}
): string {
    const normalized = normalizeSetName(value);
    const reason = validateSetName(normalized, options);
    if (reason) {
        throw new Error(reason);
    }

    return normalized;
}

// Virtual fs config path rules
export function getSetSlotsPath(setName: string): string {
    const normalized = normalizeSetName(setName) || DEFAULT_SET_NAME;
    if (!isValidSetName(normalized, { allowDefault: true })) {
        throw new Error('Invalid set name');
    }

    return normalized === DEFAULT_SET_NAME
        ? ROOT_SLOTS_PATH
        : `${SETS_PATH}/${normalized}/${SET_FILE_NAME}`;
}

export function getSetSlotsUri(setName: string): vscode.Uri {
    return vscode.Uri.parse(`${CONFIG_SCHEME}:${getSetSlotsPath(setName)}`);
}

export function parseConfigPath(path: string): ConfigPathType {
    if (path === '/') {
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
        const setName = normalizeSetName(setDirMatch[1]);
        if (!isValidSetName(setName)) {
            return { kind: 'unknown' };
        }

        return { kind: 'setDir', setName };
    }

    const setSlotsMatch = /^\/sets\/([^/]+)\/slots\.json$/.exec(path);
    if (setSlotsMatch) {
        const setName = normalizeSetName(setSlotsMatch[1]);
        if (!isValidSetName(setName)) {
            return { kind: 'unknown' };
        }

        return { kind: 'setSlots', setName };
    }

    return { kind: 'unknown' };
}

export function isSlotSetConfigPath(path: string): boolean {
    const parsed = parseConfigPath(path);
    return parsed.kind === 'rootSlots' || parsed.kind === 'setSlots';
}

export function isSlotSetConfigUri(uri: vscode.Uri): boolean {
    return uri.scheme === CONFIG_SCHEME && isSlotSetConfigPath(uri.path);
}
