export interface JumpLocation<TUri> {
    uri: TUri;
    line: number;
    character: number;
    viewColumn: number | undefined;
}

export interface PlannedJump<TUri> {
    target: JumpLocation<TUri> | undefined;
    nextPrevious: JumpLocation<TUri> | undefined;
}

export function planPreviousJump<TUri>(
    previous: JumpLocation<TUri> | undefined,
    current: JumpLocation<TUri> | undefined
): PlannedJump<TUri> {
    if (!previous) {
        return {
            target: undefined,
            nextPrevious: current
        };
    }

    return {
        target: previous,
        nextPrevious: current ?? previous
    };
}
