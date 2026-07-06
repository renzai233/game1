import { NoticeSnapshot } from 'db://assets/shared/ui-runtime/core';

export const HOME_CLAIM_NOTICE_KEYS = ['dailyTask', 'signInTask', 'offlineReward'] as const;

export type HomeClaimNoticeKey = typeof HOME_CLAIM_NOTICE_KEYS[number];

export type HomeClaimNoticeSnapshot = NoticeSnapshot<HomeClaimNoticeKey>;

export interface HomeClaimNoticePayload {
    key: HomeClaimNoticeKey;
    canClaim: boolean;
}
