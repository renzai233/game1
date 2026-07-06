import { _decorator, Component, Node, Vec3 } from 'cc';
import { ISkill } from '../ISkill';
import { ISkillController, SKILL_CONTROLLER_STATUS } from './ISkillController';
import { gameBus } from 'db://assets/utils/signal/GameBus';
import { applySpeedScale } from 'db://assets/utils/data/config/manager/GameDataManager';

const { ccclass } = _decorator;

/**
 * 技能控制器基类
 * 提供所有技能控制器的通用功能
 */
@ccclass('BaseSkillController')
export abstract class BaseSkillController extends Component implements ISkillController {

    // 基础属性
    protected _skill: ISkill | null = null;
    protected _angle: number = 0;
    protected _unitNode: Node | null = null;
    protected _camp: string = '';
    protected _status: SKILL_CONTROLLER_STATUS = SKILL_CONTROLLER_STATUS.IDLE;
    protected _isPaused: boolean = false;
    protected _isDestroyed: boolean = false;

    // 性能优化相关
    protected _lastUpdateTime: number = 0;
    protected _updateInterval: number = 0.016; // 60fps
    protected _performanceMode: boolean = false;

    // 事件相关
    protected _eventHandlers: Map<string, Function> = new Map();

    /**
     * 初始化技能控制器
     * @param skill 技能数据
     * @param angle 发射角度
     * @param unitNode 发射单位节点
     * @param camp 阵营
     */
    init(skill: ISkill, angle: number, unitNode: Node, camp: string): void {
        if (this._isDestroyed) {
            console.warn('[BaseSkillController] 尝试初始化已销毁的控制器');
            return;
        }

        this._status = SKILL_CONTROLLER_STATUS.INITIALIZING;

        // 深拷贝技能数据，防止外部修改影响
        this._skill = JSON.parse(JSON.stringify(skill));
        this._angle = angle;
        this._unitNode = unitNode;
        this._camp = camp;

        // 调用子类初始化
        this.onInit();

        this._status = SKILL_CONTROLLER_STATUS.ACTIVE;
        this._isPaused = false;

        // 注册事件监听
        this.registerEventHandlers();
    }

    /**
     * 子类实现的初始化逻辑
     */
    protected abstract onInit(): void;

    /**
     * 更新技能控制器
     * @param dt 帧间隔时间
     */
    update(dt: number): void {
        if (this._isDestroyed || this._isPaused) {
            return;
        }

        // 性能优化：限制更新频率
        if (this._performanceMode) {
            this._lastUpdateTime += dt;
            if (this._lastUpdateTime < this._updateInterval) {
                return;
            }
            this._lastUpdateTime = 0;
        }

        // 调用子类更新逻辑
        this.onUpdate(dt);
    }

    /**
     * 子类实现的更新逻辑
     */
    protected abstract onUpdate(dt: number): void;

    /**
     * 子类实现的销毁逻辑
     */
    protected abstract onDestroyInternal(): void;
    
    /**
     * 重写生命周期方法，在这里进行清理
     */
    public onDestroy(): void {
        if (this._isDestroyed) {
            return;
        }
        
        this._status = SKILL_CONTROLLER_STATUS.DESTROYING;
        
        // 清理事件监听
        this.unregisterEventHandlers();
        
        // 调用子类销毁逻辑
        this.onDestroyInternal();
        
        this._status = SKILL_CONTROLLER_STATUS.DESTROYED;
        this._isDestroyed = true;
    }

    /**
     * 暂停技能控制器
     */
    pause(): void {
        if (this._isDestroyed) {
            return;
        }

        this._isPaused = true;
        this._status = SKILL_CONTROLLER_STATUS.PAUSED;

        // 调用子类暂停逻辑
        this.onPause();
    }

    /**
     * 子类实现的暂停逻辑
     */
    protected onPause(): void { }

    /**
     * 恢复技能控制器
     */
    resume(): void {
        if (this._isDestroyed) {
            return;
        }

        this._isPaused = false;
        this._status = SKILL_CONTROLLER_STATUS.ACTIVE;

        // 调用子类恢复逻辑
        this.onResume();
    }

    /**
     * 子类实现的恢复逻辑
     */
    protected onResume(): void { }

    /**
     * 获取技能状态
     */
    getStatus(): string {
        return this._status;
    }

    /**
     * 检查是否已销毁
     */
    isDestroyed(): boolean {
        return this._isDestroyed;
    }

    /**
     * 检查是否已暂停
     */
    isPaused(): boolean {
        return this._isPaused;
    }

    /**
     * 获取技能数据
     */
    getSkill(): ISkill | null {
        return this._skill;
    }

    /**
     * 获取发射角度
     */
    getAngle(): number {
        return this._angle;
    }

    /**
     * 获取发射单位节点
     */
    getUnitNode(): Node | null {
        return this._unitNode;
    }

    /**
     * 获取阵营
     */
    getCamp(): string {
        return this._camp;
    }

    /**
     * 设置性能模式
     */
    setPerformanceMode(enabled: boolean): void {
        this._performanceMode = enabled;
    }

    /**
     * 注册事件处理器
     */
    protected registerEventHandlers(): void {
        // 子类可以重写此方法注册特定的事件处理器
    }

    /**
     * 注销事件处理器
     */
    protected unregisterEventHandlers(): void {
        this._eventHandlers.forEach((handler, event) => {
            gameBus.off(event, handler);
        });
        this._eventHandlers.clear();
    }

    /**
     * 添加事件处理器
     */
    protected addEventHandler(event: string, handler: Function): void {
        this._eventHandlers.set(event, handler);
        gameBus.on(event, handler);
    }

    /**
     * 移除事件处理器
     */
    protected removeEventHandler(event: string): void {
        const handler = this._eventHandlers.get(event);
        if (handler) {
            gameBus.off(event, handler);
            this._eventHandlers.delete(event);
        }
    }

    /**
     * 发射事件
     */
    protected emitEvent(event: string, data?: any): void {
        gameBus.emit(event, data);
    }

    /**
     * 获取游戏速度缩放
     */
    protected getSpeedScale(dt: number): number {
        return applySpeedScale(dt);
    }

    /**
     * 检查节点是否有效
     */
    protected isNodeValid(node: Node | null): boolean {
        return node && node.isValid && node.active;
    }

    /**
     * 安全的节点操作包装器
     */
    protected safeNodeOperation(operation: () => void): void {
        try {
            if (!this._isDestroyed) {
                operation();
            }
        } catch (error) {
            console.error(`[BaseSkillController] 节点操作失败: ${error}`);
        }
    }
} 