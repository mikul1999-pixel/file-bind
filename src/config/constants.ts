// Core constants
export const MAX_SLOT_COUNT = 9;
export const WORKSPACE_STATE_KEY = 'slots';

// Icon ids
export const STATUS_ICONS = {
    DEFAULT: 'go-to-file',
    ACTIVE: 'file-text'
} as const;

export const PICK_ICONS = {
    BOUND: 'json',
    BOUND_ACTIVE: 'bracket-dot',
    EMPTY: 'circle-outline'
} as const;

export const PICK_ACTIONS = {
    BIND: 'add',
    REBIND: 'refresh',
    CLEAR: 'trash'
} as const;
