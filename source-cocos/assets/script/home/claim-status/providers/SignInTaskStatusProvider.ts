import { SignInTaskManager } from 'db://assets/modules/task/sign_in/SignInTaskManager';
import { IClaimStatusProvider } from '../types';

export class SignInTaskStatusProvider implements IClaimStatusProvider {
    public readonly source = 'signInTask' as const;

    private readonly taskManager = SignInTaskManager.instance;

    async init(): Promise<void> {
        await this.taskManager.ensureReady();
    }

    evaluate(now: number) {
        this.taskManager.checkAndResetIfNeeded();

        const canClaim = this.taskManager.getClaimableTaskId() !== null;

        return {
            source: this.source,
            canClaim,
            badgeVisible: canClaim,
            updatedAt: now,
            nextRefreshAt: this.getNextDayStart(now)
        };
    }

    private getNextDayStart(now: number): number {
        const date = new Date(now);
        date.setHours(24, 0, 0, 0);
        return date.getTime();
    }
}
