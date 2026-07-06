import { EDM } from "db://assets/utils/data/env/ConfigManager";
import { resManager } from "db://assets/utils/data/config/manager/ResourceManager";
import { gameBus } from "db://assets/utils/signal/GameBus";
import { SIGNAL_TYPES } from "db://assets/utils/signal/ISignal";
import { SignInTask, SignInTaskDTO } from "./types";

interface SignInTaskStateItem {
    id: number;
    claimed: boolean;
}

interface SignInTaskState {
    weekStartDate: string;
    lastClaimDate: string;
    version: string;
    tasks: SignInTaskStateItem[];
}

export class SignInTaskManager {
    private static _instance: SignInTaskManager | null = null;
    private readonly LOCAL_STORAGE_KEY = "sign_in_tasks_state";
    private readonly CONFIG_PATH = "tasks/sign_in";
    private readonly CONFIG_BUNDLE = "configs";
    private readonly VERSION = "1.0.0";

    private tasks: SignInTask[] = [];
    private config: SignInTaskDTO[] = [];
    private lastResetWeekStart = "";
    private lastClaimDate = "";
    private readyPromise: Promise<void>;

    public static get instance(): SignInTaskManager {
        if (!SignInTaskManager._instance) {
            SignInTaskManager._instance = new SignInTaskManager();
        }
        return SignInTaskManager._instance;
    }

    private constructor() {
        this.readyPromise = this.initialize();
    }

    /**
     * 确保异步初始化完成
     */
    public async ensureReady(): Promise<void> {
        return this.readyPromise;
    }

    /**
     * 初始化：加载配置并恢复本地状态
     */
    private async initialize(): Promise<void> {
        await this.loadConfig();
        this.loadTaskState();
        if (EDM.isDev()) {
            console.log("[SignInTaskManager] 初始化完成", this.tasks);
        }
    }

    /**
     * 读取签到配置
     */
    private async loadConfig(): Promise<void> {
        const rawConfig = await resManager().loadConfig<SignInTaskDTO[]>(this.CONFIG_PATH, this.CONFIG_BUNDLE);
        if (!Array.isArray(rawConfig)) {
            throw new Error("[SignInTaskManager] sign_in.json 必须为数组");
        }
        this.config = rawConfig;
    }

    /**
     * 加载本地存储状态（按周校验，过周则重置）
     */
    private loadTaskState(): void {
        const savedData = localStorage.getItem(this.LOCAL_STORAGE_KEY);
        const weekStart = this.getWeekStartDate();

        if (!savedData) {
            this.resetTasks(weekStart);
            return;
        }

        try {
            const parsed = JSON.parse(savedData) as SignInTaskState;
            if (!parsed || parsed.weekStartDate !== weekStart) {
                this.resetTasks(weekStart);
                return;
            }

            this.lastResetWeekStart = parsed.weekStartDate || weekStart;
            this.lastClaimDate = parsed.lastClaimDate || "";
            this.tasks = this.buildTasksFromState(parsed);
            this.saveTaskState();
        } catch (error) {
            console.error("[SignInTaskManager] 解析数据失败，重新初始化", error);
            this.resetTasks(weekStart);
        }
    }

    /**
     * 使用持久化状态重建任务列表
     */
    private buildTasksFromState(state: SignInTaskState): SignInTask[] {
        return this.config.map(dto => {
            const saved = state.tasks ? state.tasks.find(task => task.id === dto.id) : undefined;
            return {
                ...dto,
                claimed: saved ? !!saved.claimed : false
            };
        });
    }

    /**
     * 重置本周任务（全部未领取）
     */
    private resetTasks(weekStart: string = this.getWeekStartDate()): void {
        this.lastResetWeekStart = weekStart;
        this.lastClaimDate = "";
        this.tasks = this.config.map(dto => {
            return {
                ...dto,
                claimed: false
            };
        });
        this.saveTaskState();
        this.emitStateChanged({
            reason: "reset",
            weekStartDate: this.lastResetWeekStart
        });
    }

    /**
     * 保存当前状态到本地存储
     */
    private saveTaskState(): void {
        const state = this.buildPersistedState();
        localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(state));
    }

    /**
     * 生成持久化结构
     */
    private buildPersistedState(): SignInTaskState {
        return {
            weekStartDate: this.lastResetWeekStart,
            lastClaimDate: this.lastClaimDate,
            version: this.VERSION,
            tasks: this.tasks.map(task => {
                return {
                    id: task.id,
                    claimed: task.claimed
                };
            })
        };
    }

    /**
     * 获取今天日期（本地时间）
     */
    private getTodayDate(): string {
        return this.formatLocalDate();
    }

    private formatLocalDate(date: Date = new Date()): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    /**
     * 获取本周周一日期（本地时间）
     */
    private getWeekStartDate(date: Date = new Date()): string {
        const weekStart = new Date(date.getTime());
        const day = weekStart.getDay();
        const offset = (day + 6) % 7; // Monday = 0
        weekStart.setDate(weekStart.getDate() - offset);
        return this.formatLocalDate(weekStart);
    }

    /**
     * 获取今天在本周的索引（周一=0）
     */
    private getTodayIndex(): number {
        const day = new Date().getDay();
        return (day + 6) % 7; // Monday = 0
    }

    /**
     * 获取下一个未领取任务的索引
     */
    private getNextTaskIndex(): number {
        return this.tasks.findIndex(task => !task.claimed);
    }

    /**
     * 判断今天是否已经领取过
     */
    private isTodayClaimed(): boolean {
        return this.lastClaimDate === this.getTodayDate();
    }

    /**
     * 获取今天可领取的任务 ID（不可领取返回 null）
     */
    public getClaimableTaskId(): number | null {
        const nextIndex = this.getNextTaskIndex();
        if (nextIndex === -1) return null;
        if (this.isTodayClaimed()) return null;
        const todayIndex = this.getTodayIndex();
        if (nextIndex > todayIndex) return null;
        return this.tasks[nextIndex].id;
    }

    /**
     * 判断指定任务是否可领取
     */
    public isClaimable(taskId: number): boolean {
        return this.getClaimableTaskId() === taskId;
    }

    /**
     * 获取任务显示的第几天（按顺序）
     */
    public getTaskDayNumber(taskId: number): number | null {
        const index = this.tasks.findIndex(task => task.id === taskId);
        return index === -1 ? null : index + 1;
    }

    /**
     * 获取内部任务引用
     */
    private getTaskRef(taskId: number): SignInTask | null {
        return this.tasks.find(task => task.id === taskId) || null;
    }

    /**
     * 获取任务的拷贝（避免外部修改内部状态）
     */
    public getTask(taskId: number): SignInTask | null {
        const task = this.getTaskRef(taskId);
        if (!task) return null;
        return {
            ...task,
            rewards: task.rewards.map(reward => ({ ...reward }))
        };
    }

    /**
     * 获取所有任务的拷贝
     */
    public getAllTasks(): SignInTask[] {
        return this.tasks.map(task => {
            return {
                ...task,
                rewards: task.rewards.map(reward => ({ ...reward }))
            };
        });
    }

    /**
     * 领取任务奖励（成功返回 true）
     */
    public claimTaskReward(taskId: number): boolean {
        const claimableId = this.getClaimableTaskId();
        if (claimableId !== taskId) return false;

        const task = this.getTaskRef(taskId);
        if (!task || task.claimed) return false;

        task.claimed = true;
        this.lastClaimDate = this.getTodayDate();
        this.saveTaskState();
        this.emitStateChanged({
            reason: "claim",
            taskId,
            claimDate: this.lastClaimDate
        });
        return true;
    }

    /**
     * 检查是否需要按周重置
     */
    public checkAndResetIfNeeded(): boolean {
        const weekStart = this.getWeekStartDate();
        if (!this.lastResetWeekStart) {
            this.resetTasks(weekStart);
            return true;
        }
        if (this.lastResetWeekStart !== weekStart) {
            this.resetTasks(weekStart);
            return true;
        }
        return false;
    }

    /**
     * 开发调试用：强制重置
     */
    public resetForDebug(): void {
        this.resetTasks(this.getWeekStartDate());
    }

    private emitStateChanged(payload: { reason: "reset" | "claim"; weekStartDate?: string; taskId?: number; claimDate?: string }): void {
        gameBus.emit(SIGNAL_TYPES.SIGN_IN_TASK_STATE_CHANGED, {
            ...payload,
            updatedAt: Date.now()
        });
    }
}
