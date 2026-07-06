import { DailyTaskManager } from 'db://assets/modules/task/daily/DailyTaskManager';
import { NoticeProvider } from 'db://assets/shared/ui-runtime/core';
import { HomeClaimNoticeKey, HomeClaimNoticePayload } from '../types';

export class DailyTaskNoticeProvider implements NoticeProvider<HomeClaimNoticeKey, void> {
    readonly key = 'dailyTask' as const;

    private readonly taskManager: DailyTaskManager;

    constructor(taskManager: DailyTaskManager = DailyTaskManager.instance) {
        this.taskManager = taskManager;
    }

    async init(): Promise<void> {
        await this.taskManager.ensureReady();
    }

    evaluate(_context: void, now: number) {
        this.taskManager.checkAndResetIfNeeded();
        const tasks = this.taskManager.getAllTasks();

        const canClaim = tasks.some((task) => {
            if (task.locked) {
                return false;
            }

            const nextIndex = task.claimed.findIndex((claimed) => !claimed);
            if (nextIndex === -1) {
                return false;
            }

            return task.claims[nextIndex] === 0;
        });

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
