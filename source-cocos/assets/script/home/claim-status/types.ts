import { Dispose } from '../runtime/contracts';

export type ClaimSource = 'dailyTask' | 'signInTask' | 'offlineReward';

export interface ClaimEntry {
    source: ClaimSource;
    canClaim: boolean;
    badgeVisible: boolean;
    updatedAt: number;
    nextRefreshAt?: number;
}

export type ClaimEntries = Record<ClaimSource, ClaimEntry>;

export interface ClaimSnapshot {
    entries: ClaimEntries;
    anyBadgeVisible: boolean;
    updatedAt: number;
}

export type ClaimStatusSubscriber = (snapshot: ClaimSnapshot) => void;

export interface IClaimStatusProvider {
    readonly source: ClaimSource;
    init?(): Promise<void>;
    evaluate(now: number): Promise<ClaimEntry> | ClaimEntry;
    subscribe?(notifyDirty: () => void): Dispose;
    destroy?(): void;
}

export function createEmptyClaimEntry(source: ClaimSource, now: number = Date.now()): ClaimEntry {
    return {
        source,
        canClaim: false,
        badgeVisible: false,
        updatedAt: now
    };
}

export function createEmptyClaimSnapshot(now: number = Date.now()): ClaimSnapshot {
    return {
        entries: {
            dailyTask: createEmptyClaimEntry('dailyTask', now),
            signInTask: createEmptyClaimEntry('signInTask', now),
            offlineReward: createEmptyClaimEntry('offlineReward', now)
        },
        anyBadgeVisible: false,
        updatedAt: now
    };
}
