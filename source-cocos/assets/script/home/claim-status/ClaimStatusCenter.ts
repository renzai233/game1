import { Dispose } from '../runtime/contracts';
import {
    ClaimEntry,
    ClaimSnapshot,
    ClaimStatusSubscriber,
    createEmptyClaimSnapshot,
    IClaimStatusProvider
} from './types';

export class ClaimStatusCenter {
    private readonly providers: IClaimStatusProvider[];
    private readonly subscribers = new Set<ClaimStatusSubscriber>();
    private readonly providerDisposables: Dispose[] = [];

    private snapshot: ClaimSnapshot = createEmptyClaimSnapshot();
    private isDestroyed = false;
    private isRefreshing = false;
    private refreshPending = false;

    constructor(providers: IClaimStatusProvider[]) {
        this.providers = providers;
    }

    async init(): Promise<void> {
        for (const provider of this.providers) {
            try {
                await provider.init?.();
            } catch (error) {
                console.error(`[ClaimStatusCenter] provider init failed: ${provider.source}`, error);
            }

            try {
                const dispose = provider.subscribe?.(() => {
                    this.requestRefresh();
                });
                if (dispose) {
                    this.providerDisposables.push(dispose);
                }
            } catch (error) {
                console.error(`[ClaimStatusCenter] provider subscribe failed: ${provider.source}`, error);
            }
        }

        await this.refresh();
    }

    subscribe(subscriber: ClaimStatusSubscriber): Dispose {
        this.subscribers.add(subscriber);
        subscriber(this.snapshot);

        return () => {
            this.subscribers.delete(subscriber);
        };
    }

    getSnapshot(): ClaimSnapshot {
        return this.snapshot;
    }

    requestRefresh(): void {
        if (this.isDestroyed) {
            return;
        }

        if (this.isRefreshing) {
            this.refreshPending = true;
            return;
        }

        void this.refreshLoop();
    }

    async refresh(now: number = Date.now()): Promise<ClaimSnapshot> {
        if (this.isDestroyed) {
            return this.snapshot;
        }

        const nextEntries = { ...this.snapshot.entries };

        for (const provider of this.providers) {
            try {
                const evaluated = await provider.evaluate(now);
                nextEntries[provider.source] = this.normalizeEntry(provider.source, evaluated, now);
            } catch (error) {
                console.error(`[ClaimStatusCenter] evaluate failed: ${provider.source}`, error);
                nextEntries[provider.source] = this.normalizeEntry(provider.source, null, now);
            }
        }

        const nextSnapshot: ClaimSnapshot = {
            entries: nextEntries,
            anyBadgeVisible: Object.values(nextEntries).some((entry) => entry.badgeVisible),
            updatedAt: now
        };

        const changed = !this.isSameSnapshot(this.snapshot, nextSnapshot);
        this.snapshot = nextSnapshot;

        if (changed) {
            this.notify(nextSnapshot);
        }

        return nextSnapshot;
    }

    destroy(): void {
        if (this.isDestroyed) {
            return;
        }

        this.isDestroyed = true;
        this.subscribers.clear();

        while (this.providerDisposables.length > 0) {
            const dispose = this.providerDisposables.pop();
            try {
                dispose?.();
            } catch (error) {
                console.error('[ClaimStatusCenter] provider dispose failed:', error);
            }
        }

        for (const provider of this.providers) {
            try {
                provider.destroy?.();
            } catch (error) {
                console.error(`[ClaimStatusCenter] provider destroy failed: ${provider.source}`, error);
            }
        }
    }

    private async refreshLoop(): Promise<void> {
        this.isRefreshing = true;

        try {
            do {
                this.refreshPending = false;
                await this.refresh();
            } while (this.refreshPending && !this.isDestroyed);
        } finally {
            this.isRefreshing = false;
        }
    }

    private notify(snapshot: ClaimSnapshot): void {
        this.subscribers.forEach((subscriber) => {
            try {
                subscriber(snapshot);
            } catch (error) {
                console.error('[ClaimStatusCenter] subscriber failed:', error);
            }
        });
    }

    private normalizeEntry(source: ClaimEntry['source'], entry: ClaimEntry | null, now: number): ClaimEntry {
        if (!entry) {
            return {
                source,
                canClaim: false,
                badgeVisible: false,
                updatedAt: now
            };
        }

        return {
            source,
            canClaim: !!entry.canClaim,
            badgeVisible: !!entry.badgeVisible,
            updatedAt: entry.updatedAt || now,
            nextRefreshAt: entry.nextRefreshAt
        };
    }

    private isSameSnapshot(prev: ClaimSnapshot, next: ClaimSnapshot): boolean {
        const sources: Array<ClaimEntry['source']> = ['dailyTask', 'signInTask', 'offlineReward'];

        for (const source of sources) {
            const prevEntry = prev.entries[source];
            const nextEntry = next.entries[source];

            if (!prevEntry || !nextEntry) {
                return false;
            }

            if (prevEntry.canClaim !== nextEntry.canClaim) {
                return false;
            }

            if (prevEntry.badgeVisible !== nextEntry.badgeVisible) {
                return false;
            }

            if (prevEntry.nextRefreshAt !== nextEntry.nextRefreshAt) {
                return false;
            }
        }

        return prev.anyBadgeVisible === next.anyBadgeVisible;
    }
}
