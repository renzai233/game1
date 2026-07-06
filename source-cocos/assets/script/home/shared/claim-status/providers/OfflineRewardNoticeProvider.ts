import { OfflineRewardDataProvider, offlineRewardDataProvider } from 'db://assets/modules/offline/OfflineRewardDataProvider';
import { NoticeProvider } from 'db://assets/shared/ui-runtime/core';
import { HomeClaimNoticeKey, HomeClaimNoticePayload } from '../types';

export class OfflineRewardNoticeProvider implements NoticeProvider<HomeClaimNoticeKey, void> {
    readonly key = 'offlineReward' as const;

    private readonly dataProvider: OfflineRewardDataProvider;

    constructor(dataProvider: OfflineRewardDataProvider = offlineRewardDataProvider) {
        this.dataProvider = dataProvider;
    }

    async evaluate(_context: void, now: number) {
        const config = await this.dataProvider.loadConfig();
        const state = this.dataProvider.loadState();

        const capSeconds = Math.max(0, (config.maxHoursPerDay || 0) * 3600);
        const hasLastClaimTime = !!state.lastClaimTime;
        const elapsedSeconds = hasLastClaimTime ? Math.max(0, (now - state.lastClaimTime) / 1000) : 0;
        const canClaim = hasLastClaimTime && capSeconds > 0 && elapsedSeconds >= capSeconds;

        const payload: HomeClaimNoticePayload = {
            key: this.key,
            canClaim
        };

        return {
            visible: canClaim,
            updatedAt: now,
            nextRefreshAt: hasLastClaimTime && capSeconds > 0
                ? state.lastClaimTime + capSeconds * 1000
                : undefined,
            payload
        };
    }
}
