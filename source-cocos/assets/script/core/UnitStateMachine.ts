import { _decorator, Component } from 'cc';
import { UnitState, UnitEventType, IUnitEventData } from './UnitBehavior';
import { gameBus } from 'db://assets/utils/signal/GameBus';

const { ccclass } = _decorator;

/**
 * 单位状态机
 * 管理单位的状态转换和状态相关逻辑
 */
@ccclass('UnitStateMachine')
export class UnitStateMachine extends Component {
    private _currentState: UnitState = UnitState.ALIVE;
    private _previousState: UnitState = UnitState.ALIVE;
    private _stateTimer: number = 0;
    private _stateData: Map<UnitState, any> = new Map();
    private _stateTransitions: Map<UnitState, Set<UnitState>> = new Map();
    private _stateEnterCallbacks: Map<UnitState, Function[]> = new Map();
    private _stateExitCallbacks: Map<UnitState, Function[]> = new Map();
    private _stateUpdateCallbacks: Map<UnitState, Function[]> = new Map();

    /**
     * 初始化状态机
     */
    init(): void {
        this._currentState = UnitState.ALIVE;
        this._previousState = UnitState.ALIVE;
        this._stateTimer = 0;
        this._stateData.clear();
        this.setupDefaultTransitions();
    }

    /**
     * 设置默认状态转换规则
     */
    private setupDefaultTransitions(): void {
        // 存活状态可以转换到任何状态
        this.addTransition(UnitState.ALIVE, UnitState.DEAD);
        this.addTransition(UnitState.ALIVE, UnitState.STUNNED);
        this.addTransition(UnitState.ALIVE, UnitState.FROZEN);
        this.addTransition(UnitState.ALIVE, UnitState.BURNING);
        this.addTransition(UnitState.ALIVE, UnitState.POISONED);
        this.addTransition(UnitState.ALIVE, UnitState.INVINCIBLE);

        // 异常状态可以回到存活状态
        this.addTransition(UnitState.STUNNED, UnitState.ALIVE);
        this.addTransition(UnitState.FROZEN, UnitState.ALIVE);
        this.addTransition(UnitState.BURNING, UnitState.ALIVE);
        this.addTransition(UnitState.POISONED, UnitState.ALIVE);
        this.addTransition(UnitState.INVINCIBLE, UnitState.ALIVE);

        // 死亡状态是终态，不能转换到其他状态
        // 但可以从任何状态转换到死亡状态
        Object.values(UnitState).forEach(state => {
            if (state !== UnitState.DEAD) {
                this.addTransition(state, UnitState.DEAD);
            }
        });
    }

    /**
     * 添加状态转换
     * @param from 源状态
     * @param to 目标状态
     */
    addTransition(from: UnitState, to: UnitState): void {
        if (!this._stateTransitions.has(from)) {
            this._stateTransitions.set(from, new Set());
        }
        this._stateTransitions.get(from)!.add(to);
    }

    /**
     * 移除状态转换
     * @param from 源状态
     * @param to 目标状态
     */
    removeTransition(from: UnitState, to: UnitState): void {
        const transitions = this._stateTransitions.get(from);
        if (transitions) {
            transitions.delete(to);
        }
    }

    /**
     * 检查是否可以转换到指定状态
     * @param to 目标状态
     */
    canTransitionTo(to: UnitState): boolean {
        const transitions = this._stateTransitions.get(this._currentState);
        return transitions ? transitions.has(to) : false;
    }

    /**
     * 转换到指定状态
     * @param newState 新状态
     * @param data 状态数据
     */
    transitionTo(newState: UnitState, data?: any): boolean {
        if (!this.canTransitionTo(newState)) {
            console.warn(`[UnitStateMachine] 无法从 ${this._currentState} 转换到 ${newState}`);
            return false;
        }

        const oldState = this._currentState;
        
        // 退出当前状态
        this.exitState(oldState);
        
        // 更新状态
        this._previousState = oldState;
        this._currentState = newState;
        this._stateTimer = 0;
        
        // 存储状态数据
        if (data !== undefined) {
            this._stateData.set(newState, data);
        }
        
        // 进入新状态
        this.enterState(newState);
        
        // 发送状态变更事件
        this.emitStateChangeEvent(oldState, newState);
        
        console.log(`[UnitStateMachine] 状态转换: ${oldState} -> ${newState}`);
        return true;
    }

    /**
     * 强制设置状态（不检查转换规则）
     * @param newState 新状态
     * @param data 状态数据
     */
    forceSetState(newState: UnitState, data?: any): void {
        const oldState = this._currentState;
        
        // 退出当前状态
        this.exitState(oldState);
        
        // 更新状态
        this._previousState = oldState;
        this._currentState = newState;
        this._stateTimer = 0;
        
        // 存储状态数据
        if (data !== undefined) {
            this._stateData.set(newState, data);
        }
        
        // 进入新状态
        this.enterState(newState);
        
        // 发送状态变更事件
        this.emitStateChangeEvent(oldState, newState);
        
        console.log(`[UnitStateMachine] 强制设置状态: ${oldState} -> ${newState}`);
    }

    /**
     * 进入状态
     * @param state 状态
     */
    private enterState(state: UnitState): void {
        const callbacks = this._stateEnterCallbacks.get(state);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(state, this._stateData.get(state));
                } catch (error) {
                    console.error(`[UnitStateMachine] 状态进入回调执行失败:`, error);
                }
            });
        }
    }

    /**
     * 退出状态
     * @param state 状态
     */
    private exitState(state: UnitState): void {
        const callbacks = this._stateExitCallbacks.get(state);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(state, this._stateData.get(state));
                } catch (error) {
                    console.error(`[UnitStateMachine] 状态退出回调执行失败:`, error);
                }
            });
        }
    }

    /**
     * 更新状态机
     * @param deltaTime 帧时间
     */
    update(deltaTime: number): void {
        this._stateTimer += deltaTime;
        
        // 执行状态更新回调
        const callbacks = this._stateUpdateCallbacks.get(this._currentState);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(this._currentState, deltaTime, this._stateData.get(this._currentState));
                } catch (error) {
                    console.error(`[UnitStateMachine] 状态更新回调执行失败:`, error);
                }
            });
        }

        // 处理状态特定的逻辑
        this.handleStateLogic(deltaTime);
    }

    /**
     * 处理状态特定逻辑
     * @param deltaTime 帧时间
     */
    private handleStateLogic(deltaTime: number): void {
        switch (this._currentState) {
            case UnitState.STUNNED:
                // 眩晕状态处理
                this.handleStunnedState(deltaTime);
                break;
            case UnitState.FROZEN:
                // 冰冻状态处理
                this.handleFrozenState(deltaTime);
                break;
            case UnitState.BURNING:
                // 燃烧状态处理
                this.handleBurningState(deltaTime);
                break;
            case UnitState.POISONED:
                // 中毒状态处理
                this.handlePoisonedState(deltaTime);
                break;
            case UnitState.INVINCIBLE:
                // 无敌状态处理
                this.handleInvincibleState(deltaTime);
                break;
        }
    }

    /**
     * 处理眩晕状态
     */
    private handleStunnedState(deltaTime: number): void {
        const data = this._stateData.get(UnitState.STUNNED);
        if (data && data.duration) {
            if (this._stateTimer >= data.duration) {
                this.transitionTo(UnitState.ALIVE);
            }
        }
    }

    /**
     * 处理冰冻状态
     */
    private handleFrozenState(deltaTime: number): void {
        const data = this._stateData.get(UnitState.FROZEN);
        if (data && data.duration) {
            if (this._stateTimer >= data.duration) {
                this.transitionTo(UnitState.ALIVE);
            }
        }
    }

    /**
     * 处理燃烧状态
     */
    private handleBurningState(deltaTime: number): void {
        const data = this._stateData.get(UnitState.BURNING);
        if (data) {
            if (data.duration && this._stateTimer >= data.duration) {
                this.transitionTo(UnitState.ALIVE);
            } else if (data.damagePerSecond && this._stateTimer % 1.0 < deltaTime) {
                // 每秒造成伤害
                this.emitDamageEvent(data.damagePerSecond);
            }
        }
    }

    /**
     * 处理中毒状态
     */
    private handlePoisonedState(deltaTime: number): void {
        const data = this._stateData.get(UnitState.POISONED);
        if (data) {
            if (data.duration && this._stateTimer >= data.duration) {
                this.transitionTo(UnitState.ALIVE);
            } else if (data.damagePerSecond && this._stateTimer % 1.0 < deltaTime) {
                // 每秒造成伤害
                this.emitDamageEvent(data.damagePerSecond);
            }
        }
    }

    /**
     * 处理无敌状态
     */
    private handleInvincibleState(deltaTime: number): void {
        const data = this._stateData.get(UnitState.INVINCIBLE);
        if (data && data.duration) {
            if (this._stateTimer >= data.duration) {
                this.transitionTo(UnitState.ALIVE);
            }
        }
    }

    /**
     * 添加状态进入回调
     * @param state 状态
     * @param callback 回调函数
     */
    onStateEnter(state: UnitState, callback: Function): void {
        if (!this._stateEnterCallbacks.has(state)) {
            this._stateEnterCallbacks.set(state, []);
        }
        this._stateEnterCallbacks.get(state)!.push(callback);
    }

    /**
     * 添加状态退出回调
     * @param state 状态
     * @param callback 回调函数
     */
    onStateExit(state: UnitState, callback: Function): void {
        if (!this._stateExitCallbacks.has(state)) {
            this._stateExitCallbacks.set(state, []);
        }
        this._stateExitCallbacks.get(state)!.push(callback);
    }

    /**
     * 添加状态更新回调
     * @param state 状态
     * @param callback 回调函数
     */
    onStateUpdate(state: UnitState, callback: Function): void {
        if (!this._stateUpdateCallbacks.has(state)) {
            this._stateUpdateCallbacks.set(state, []);
        }
        this._stateUpdateCallbacks.get(state)!.push(callback);
    }

    /**
     * 获取当前状态
     */
    getCurrentState(): UnitState {
        return this._currentState;
    }

    /**
     * 获取前一个状态
     */
    getPreviousState(): UnitState {
        return this._previousState;
    }

    /**
     * 获取状态持续时间
     */
    getStateTimer(): number {
        return this._stateTimer;
    }

    /**
     * 获取状态数据
     * @param state 状态
     */
    getStateData(state: UnitState): any {
        return this._stateData.get(state);
    }

    /**
     * 设置状态数据
     * @param state 状态
     * @param data 数据
     */
    setStateData(state: UnitState, data: any): void {
        this._stateData.set(state, data);
    }

    /**
     * 检查是否处于指定状态
     * @param state 状态
     */
    isInState(state: UnitState): boolean {
        return this._currentState === state;
    }

    /**
     * 检查是否处于存活状态
     */
    isAlive(): boolean {
        return this._currentState === UnitState.ALIVE;
    }

    /**
     * 检查是否处于死亡状态
     */
    isDead(): boolean {
        return this._currentState === UnitState.DEAD;
    }

    /**
     * 检查是否处于异常状态
     */
    isAffected(): boolean {
        return this._currentState !== UnitState.ALIVE && this._currentState !== UnitState.DEAD;
    }

    /**
     * 发送伤害事件
     * @param damage 伤害值
     */
    private emitDamageEvent(damage: number): void {
        if (gameBus) {
            gameBus.emit(UnitEventType.DAMAGE, {
                unit: null, // 需要传入单位引用
                type: UnitEventType.DAMAGE,
                data: { damage, source: 'state' },
                timestamp: Date.now()
            });
        }
    }

    /**
     * 发送状态变更事件
     * @param oldState 旧状态
     * @param newState 新状态
     */
    private emitStateChangeEvent(oldState: UnitState, newState: UnitState): void {
        if (gameBus) {
            gameBus.emit(UnitEventType.STATE_CHANGE, {
                unit: null, // 需要传入单位引用
                type: UnitEventType.STATE_CHANGE,
                data: { oldState, newState },
                timestamp: Date.now()
            });
        }
    }

    /**
     * 重置状态机
     */
    reset(): void {
        this._currentState = UnitState.ALIVE;
        this._previousState = UnitState.ALIVE;
        this._stateTimer = 0;
        this._stateData.clear();
    }

    /**
     * 销毁状态机
     */
    onDestroy(): void {
        this._stateData.clear();
        this._stateTransitions.clear();
        this._stateEnterCallbacks.clear();
        this._stateExitCallbacks.clear();
        this._stateUpdateCallbacks.clear();
    }
}
