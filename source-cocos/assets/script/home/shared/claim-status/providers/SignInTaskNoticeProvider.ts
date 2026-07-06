import { SignInTaskManager } from 'db://assets/modules/task/sign_in/SignInTaskManager';
import { NoticeProvider } from 'db://assets/shared/ui-runtime/core';
import { HomeClaimNoticeKey, HomeClaimNoticePayload } from '../types';

export class SignInTaskNoticeProvider implements NoticeProvider<HomeClaimNoticeKey, void> {
    readonly key = 'signInTask' as const;

    private readonly taskManager: SignInTaskManager;

    constructor(taskManager: SignInTaskManager = SignInTaskManager.instance) {
        this.taskManager = taskManager;
    }

    async init(): Promise<void> {
        await this.taskManager.ensureReady();
    }

    evaluate(_context: void, now: number) {
        this.taskManager.checkAndResetIfNeeded();

        const canClaim = this.taskManager.getClaimableTaskId() !== null;

        const payload: HomeClaimNoticePayload = {
            key: this.key,
            canClaim
        };

        return {
            visible: canClaim,
            updatedAt: now,
            nextRefreshAt: this.getNextDayStart(now),
            payload
        };
    }

    private getNextDayStart(now: number): number {
        const date = new Date(now);
        date.setHours(24, 0, 0, 0);
        return date.getTime();
    }
}
