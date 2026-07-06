import { offlineRewardDataProvider } from 'db://assets/modules/offline/OfflineRewardDataProvider';
import { IClaimStatusProvider } from '../types';

export class OfflineRewardStatusProvider implements IClaimStatusProvider {
    public readonly source = 'offlineReward' as const;

    async evaluate(now: number) {
        const config = await offlineRewardDataProvider.loadConfig();
        const state = offlineRewardDataProvider.loadState();

        const capSeconds = Math.max(0, (config.maxHoursPerDay || 0) * 3600);
        const hasLastClaimTime = !!state.lastClaimTime;
        const elapsedSeconds = hasLastClaimTime ? Math.max(0, (now - state.lastClaimTime) / 1000) : 0;
        const isFull = hasLastClaimTime && capSeconds > 0 && elapsedSeconds >= capSeconds;

        const nextRefreshAt = hasLastClaimTime && capSeconds > 0
            ? state.lastClaimTime + capSeconds * 1000
            : undefined;

        return {
            source: this.source,
            canClaim: isFull,
            badgeVisible: isFull,
            updatedAt: now,
            nextRefreshAt
        };
    }
}
