import { DailyTaskManager } from 'db://assets/modules/task/daily/DailyTaskManager';
import { IClaimStatusProvider } from '../types';

export class DailyTaskStatusProvider implements IClaimStatusProvider {
    public readonly source = 'dailyTask' as const;

    private readonly taskManager = DailyTaskManager.instance;

    async init(): Promise<void> {
        await this.taskManager.ensureReady();
    }

    evaluate(now: number) {
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
