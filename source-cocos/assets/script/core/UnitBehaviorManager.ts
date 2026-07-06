import { _decorator, Component, Node } from 'cc';
import { IUnitBehavior, UnitBehaviorType, IUnitController, UnitEventType } from './UnitBehavior';
import { gameBus } from 'db://assets/utils/signal/GameBus';

const { ccclass } = _decorator;

/**
 * 单位行为管理器
 * 负责管理单位的行为状态、行为队列和行为切换
 */
@ccclass('UnitBehaviorManager')
export class UnitBehaviorManager extends Component {
    private _unit: IUnitController;
    private _currentBehavior: IUnitBehavior | null = null;
    private _behaviorQueue: IUnitBehavior[] = [];
    private _behaviorHistory: IUnitBehavior[] = [];
    private _isPaused: boolean = false;
    private _behaviorTimer: number = 0;

    /**
     * 初始化行为管理器
     * @param unit 单位控制器
     */
    init(unit: IUnitController): void {
        this._unit = unit;
        this._currentBehavior = null;
        this._behaviorQueue = [];
        this._behaviorHistory = [];
        this._isPaused = false;
        this._behaviorTimer = 0;
    }

    /**
     * 更新行为管理器
     * @param deltaTime 帧时间
     */
    update(deltaTime: number): void {
        if (this._isPaused || !this._unit) return;

        // 更新当前行为
        if (this._currentBehavior) {
            this._behaviorTimer += deltaTime;
            this._currentBehavior.update(this._unit, deltaTime);

            // 检查行为是否应该结束
            if (this._behaviorTimer >= this._currentBehavior.duration && this._currentBehavior.duration > 0) {
                this.stopCurrentBehavior();
            }
        }

        // 处理行为队列
        this.processBehaviorQueue();
    }

    /**
     * 执行行为
     * @param behavior 要执行的行为
     * @param force 是否强制执行（中断当前行为）
     */
    executeBehavior(behavior: IUnitBehavior, force: boolean = false): void {
        if (!this._unit || !behavior) return;

        // 如果当前有行为在执行，检查是否可以中断
        if (this._currentBehavior && !force) {
            if (!this._currentBehavior.interruptible) {
                // 当前行为不可中断，添加到队列
                this.addBehaviorToQueue(behavior);
                return;
            }

            // 检查优先级
            if (behavior.priority <= this._currentBehavior.priority) {
                this.addBehaviorToQueue(behavior);
                return;
            }
        }

        // 停止当前行为
        if (this._currentBehavior) {
            this.stopCurrentBehavior();
        }

        // 执行新行为
        this._currentBehavior = behavior;
        this._behaviorTimer = 0;
        behavior.execute(this._unit);

        // 发送行为变更事件
        this.emitBehaviorChangeEvent(behavior);

        console.log(`[UnitBehaviorManager] 执行行为: ${behavior.type}`);
    }

    /**
     * 停止当前行为
     */
    stopCurrentBehavior(): void {
        if (this._currentBehavior) {
            this._currentBehavior.stop(this._unit);
            this._behaviorHistory.push(this._currentBehavior);
            this._currentBehavior = null;
            this._behaviorTimer = 0;
        }
    }

    /**
     * 添加行为到队列
     * @param behavior 要添加的行为
     */
    addBehaviorToQueue(behavior: IUnitBehavior): void {
        if (!behavior) return;

        // 按优先级插入队列
        let inserted = false;
        for (let i = 0; i < this._behaviorQueue.length; i++) {
            if (behavior.priority > this._behaviorQueue[i].priority) {
                this._behaviorQueue.splice(i, 0, behavior);
                inserted = true;
                break;
            }
        }

        if (!inserted) {
            this._behaviorQueue.push(behavior);
        }

        console.log(`[UnitBehaviorManager] 添加行为到队列: ${behavior.type}`);
    }

    /**
     * 处理行为队列
     */
    private processBehaviorQueue(): void {
        if (this._currentBehavior || this._behaviorQueue.length === 0) return;

        const nextBehavior = this._behaviorQueue.shift();
        if (nextBehavior) {
            this.executeBehavior(nextBehavior);
        }
    }

    /**
     * 清空行为队列
     */
    clearBehaviorQueue(): void {
        this._behaviorQueue = [];
    }

    /**
     * 暂停行为管理器
     */
    pause(): void {
        this._isPaused = true;
    }

    /**
     * 恢复行为管理器
     */
    resume(): void {
        this._isPaused = false;
    }

    /**
     * 获取当前行为
     */
    getCurrentBehavior(): IUnitBehavior | null {
        return this._currentBehavior;
    }

    /**
     * 获取行为队列
     */
    getBehaviorQueue(): IUnitBehavior[] {
        return [...this._behaviorQueue];
    }

    /**
     * 获取行为历史
     */
    getBehaviorHistory(): IUnitBehavior[] {
        return [...this._behaviorHistory];
    }

    /**
     * 检查是否有指定类型的行为在执行
     * @param behaviorType 行为类型
     */
    hasBehavior(behaviorType: UnitBehaviorType): boolean {
        return this._currentBehavior?.type === behaviorType;
    }

    /**
     * 检查队列中是否有指定类型的行为
     * @param behaviorType 行为类型
     */
    hasBehaviorInQueue(behaviorType: UnitBehaviorType): boolean {
        return this._behaviorQueue.some(behavior => behavior.type === behaviorType);
    }

    /**
     * 发送行为变更事件
     * @param behavior 行为
     */
    private emitBehaviorChangeEvent(behavior: IUnitBehavior): void {
        if (gameBus) {
            gameBus.emit(UnitEventType.BEHAVIOR_CHANGE, {
                unit: this._unit,
                type: UnitEventType.BEHAVIOR_CHANGE,
                data: { behavior: behavior.type },
                timestamp: Date.now()
            });
        }
    }

    /**
     * 销毁行为管理器
     */
    onDestroy(): void {
        this.stopCurrentBehavior();
        this.clearBehaviorQueue();
        this._behaviorHistory = [];
        this._unit = null;
    }
}
