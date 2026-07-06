import { SIGNAL_TYPES } from "./ISignal";

export const GAME_PAUSE_REASONS = {
    GLOBAL: 'global',
    SKILL_PANEL: 'skill-panel',
    EXIT_PANEL: 'exit-panel',
    RESULT_PANEL: 'result-panel'
} as const;

export type GamePauseReason = typeof GAME_PAUSE_REASONS[keyof typeof GAME_PAUSE_REASONS] | string;

/**
 * GameBus 游戏全局总线
 * 用于统一管理游戏的暂停/恢复、全局事件订阅与广播
 */
export class GameBus {
    private static _instance: GameBus;
    private _paused: boolean = false;
    private _pauseReasons: Set<string> = new Set();
    private _listeners: { [event: string]: Function[] } = {};

    private constructor() {
        // 初始化技能状态相关信号
        this.initSkillStatusSignals();
    }

    static get instance(): GameBus {
        if (!this._instance) {
            this._instance = new GameBus();
        }
        return this._instance;
    }

    /**
     * 初始化技能状态相关信号
     */
    private initSkillStatusSignals() {
        // 技能状态变化信号
        this.on(SIGNAL_TYPES.SKILL_STATUS_CHANGED, (data: { heroId: number, skillId: number, status: string, progress?: number }) => {
            // 技能状态变化时，统一控制英雄动画和技能图标
            // console.log('[GameBus] 技能状态变化:', data);
        });

        // 英雄动画状态信号
        this.on('hero-animation-changed', (data: { heroId: number, animation: string }) => {
            // 英雄动画状态变化
            // console.log('[GameBus] 英雄动画变化:', data);
        });

        // 技能图标状态信号
        this.on(SIGNAL_TYPES.SKILL_ICON_CHANGED, (data: { heroId: number, skillId: number, status: string, progress?: number }) => {
            // 技能图标状态变化
            // console.log('[GameBus] 技能图标状态变化:', data);
        });
    }

    /**
     * 全局暂停
     */
    pause(reason: GamePauseReason = GAME_PAUSE_REASONS.GLOBAL) {
        const pauseReason = this.normalizePauseReason(reason);
        const wasPaused = this._paused;

        this._pauseReasons.add(pauseReason);
        this._paused = this._pauseReasons.size > 0;

        if (!wasPaused && this._paused) {
            this.emit('pause', { reason: pauseReason, reasons: this.pauseReasons });
        }
    }

    /**
     * 全局恢复
     */
    resume(reason: GamePauseReason = GAME_PAUSE_REASONS.GLOBAL) {
        const pauseReason = this.normalizePauseReason(reason);
        const wasPaused = this._paused;

        this._pauseReasons.delete(pauseReason);
        this._paused = this._pauseReasons.size > 0;

        if (wasPaused && !this._paused) {
            this.emit('resume', { reason: pauseReason, reasons: this.pauseReasons });
        }
    }

    /**
     * 清空所有暂停来源。用于场景销毁/重置时兜底，避免跨场景残留。
     */
    clearPauseReasons() {
        const wasPaused = this._paused;
        this._pauseReasons.clear();
        this._paused = false;

        if (wasPaused) {
            this.emit('resume', { reason: 'clear', reasons: this.pauseReasons });
        }
    }

    /**
     * 是否处于暂停状态
     */
    get paused() {
        return this._paused;
    }

    get pauseReasons() {
        return Array.from(this._pauseReasons);
    }

    isPausedBy(reason: GamePauseReason) {
        return this._pauseReasons.has(this.normalizePauseReason(reason));
    }

    private normalizePauseReason(reason: GamePauseReason) {
        return String(reason || GAME_PAUSE_REASONS.GLOBAL);
    }

    /**
     * 订阅事件
     */
    on(event: string, callback: Function) {
        if (!this._listeners[event]) {
            this._listeners[event] = [];
        }
        this._listeners[event].push(callback);
    }

    /**
     * 取消订阅
     */
    off(event: string, callback: Function) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter(fn => fn !== callback);
    }

    /**
     * 广播事件
     */
    emit(event: string, ...args: any[]) {
        if (!this._listeners[event]) return;
        for (const fn of this._listeners[event]) {
            fn(...args);
        }
    }
}

export const gameBus = GameBus.instance;
