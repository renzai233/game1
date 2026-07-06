import { EDM } from "db://assets/utils/data/env/ConfigManager";
import { resManager } from "db://assets/utils/data/config/manager/ResourceManager";
import { gameBus } from "db://assets/utils/signal/GameBus";
import { SIGNAL_TYPES } from "db://assets/utils/signal/ISignal";
import { DailyTask, DailyTaskDTO } from "./types";

interface DailyTaskStateItem {
    id: number;
    locked: boolean;
    claimed: boolean[];
}

interface DailyTaskState {
    lastResetDate: string;
    version: string;
    tasks: DailyTaskStateItem[];
}

export class DailyTaskManager {
    private static _instance: DailyTaskManager | null = null;
    private readonly LOCAL_STORAGE_KEY = "daily_tasks_state";
    private readonly CONFIG_PATH = "tasks/daily_gifts";
    private readonly CONFIG_BUNDLE = "configs";
    private readonly VERSION = "1.0.0";

    private tasks: DailyTask[] = [];
    private config: DailyTaskDTO[] = [];
    private lastResetDate = "";
    private readyPromise: Promise<void>;

    public static get instance(): DailyTaskManager {
        if (!DailyTaskManager._instance) {
            DailyTaskManager._instance = new DailyTaskManager();
        }
        return DailyTaskManager._instance;
    }

    private constructor() {
        this.readyPromise = this.initialize();
    }

    public async ensureReady(): Promise<void> {
        return this.readyPromise;
    }

    private async initialize(): Promise<void> {
        await this.loadConfig();
        this.loadTaskState();
        if (EDM.isDev()) {
            console.log("[DailyTaskManager] 初始化完成", this.tasks);
        }
    }

    private async loadConfig(): Promise<void> {
        const rawConfig = await resManager().loadConfig<DailyTaskDTO[]>(this.CONFIG_PATH, this.CONFIG_BUNDLE);
        if (!Array.isArray(rawConfig)) {
            throw new Error("[DailyTaskManager] daily_gifts.json 必须为数组");
        }
        this.config = rawConfig;
    }

    private loadTaskState(): void {
        const savedData = localStorage.getItem(this.LOCAL_STORAGE_KEY);
        const today = this.getTodayDate();

        if (!savedData) {
            this.resetTasks(today);
            return;
        }

        try {
            const parsed = JSON.parse(savedData) as DailyTaskState;
            if (!parsed || parsed.lastResetDate !== today) {
                this.resetTasks(today);
                return;
            }

            this.lastResetDate = parsed.lastResetDate || today;
            this.tasks = this.buildTasksFromState(parsed);
            this.saveTaskState();
        } catch (error) {
            console.error("[DailyTaskManager] 解析数据失败，重新初始化", error);
            this.resetTasks(today);
        }
    }

    private buildTasksFromState(state: DailyTaskState): DailyTask[] {
        const tasks = this.config.map((dto, index) => {
            const saved = state.tasks ? state.tasks.find(task => task.id === dto.id) : undefined;
            const claimed = dto.claims.map((_, claimIndex) => {
                return saved && Array.isArray(saved.claimed) ? !!saved.claimed[claimIndex] : false;
            });

            return {
                ...dto,
                locked: saved ? saved.locked : index !== 0,
                claimed
            };
        });

        this.applyUnlockRules(tasks);
        return tasks;
    }

    private resetTasks(today: string = this.getTodayDate()): void {
        this.lastResetDate = today;
        this.tasks = this.config.map((dto, index) => {
            return {
                ...dto,
                locked: index !== 0,
                claimed: dto.claims.map(() => false)
            };
        });
        this.applyUnlockRules(this.tasks);
        this.saveTaskState();
        this.emitStateChanged({
            reason: "reset",
            lastResetDate: this.lastResetDate
        });
    }

    private applyUnlockRules(tasks: DailyTask[]): void {
        if (tasks.length === 0) return;

        tasks[0].locked = false;
        for (let i = 1; i < tasks.length; i++) {
            const prev = tasks[i - 1];
            tasks[i].locked = !(prev.claimed && prev.claimed[0]);
        }
    }

    private saveTaskState(): void {
        const state = this.buildPersistedState();
        localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(state));
    }

    private buildPersistedState(): DailyTaskState {
        return {
            lastResetDate: this.lastResetDate,
            version: this.VERSION,
            tasks: this.tasks.map(task => {
                return {
                    id: task.id,
                    locked: task.locked,
                    claimed: [...task.claimed]
                };
            })
        };
    }

    private getTodayDate(): string {
        return this.formatLocalDate();
    }

    private formatLocalDate(date: Date = new Date()): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    private getTaskRef(taskId: number): DailyTask | null {
        return this.tasks.find(task => task.id === taskId) || null;
    }

    public getTask(taskId: number): DailyTask | null {
        const task = this.getTaskRef(taskId);
        if (!task) return null;
        return {
            ...task,
            rewards: task.rewards.map(reward => ({ ...reward })),
            claims: [...task.claims],
            claimed: [...task.claimed]
        };
    }

    public getAllTasks(): DailyTask[] {
        return this.tasks.map(task => {
            return {
                ...task,
                rewards: task.rewards.map(reward => ({ ...reward })),
                claims: [...task.claims],
                claimed: [...task.claimed]
            };
        });
    }

    public claimTaskReward(taskId: number): number | null {
        const task = this.getTaskRef(taskId);
        if (!task || task.locked) return null;

        const nextIndex = task.claimed.findIndex(claimed => !claimed);
        if (nextIndex === -1) return null;

        task.claimed[nextIndex] = true;
        this.applyUnlockRules(this.tasks);
        this.saveTaskState();
        this.emitStateChanged({
            reason: "claim",
            taskId,
            claimIndex: nextIndex
        });
        return nextIndex;
    }

    public checkAndResetIfNeeded(): boolean {
        const today = this.getTodayDate();
        if (this.lastResetDate && this.lastResetDate !== today) {
            this.resetTasks(today);
            return true;
        }
        return false;
    }

    public resetForDebug(): void {
        this.resetTasks(this.getTodayDate());
    }

    private emitStateChanged(payload: { reason: "reset" | "claim"; lastResetDate?: string; taskId?: number; claimIndex?: number }): void {
        gameBus.emit(SIGNAL_TYPES.DAILY_TASK_STATE_CHANGED, {
            ...payload,
            updatedAt: Date.now()
        });
    }
}
