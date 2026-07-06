import { SIGNAL_TYPES } from '../signal/ISignal';
import { SkillInstanceManager } from './SkillInstanceManager';
import { gameBus } from 'db://assets/utils/signal/GameBus';

/**
 * 技能状态管理器
 * 负责管理技能状态的显示和更新
 */
export class SkillStatusManager {
    private static _skillStatusMap: Map<string, any> = new Map();

    /**
     * 初始化技能状态管理器
     */
    static init(): void {
        // 监听技能状态变化事件
        gameBus.on(SIGNAL_TYPES.SKILL_STATUS_CHANGED, this.handleSkillStatusChange.bind(this));
    }

    /**
     * 处理技能状态变化
     */
    private static handleSkillStatusChange(data: any): void {
        const key = `${data.heroId}-${data.skillId}`;
        this._skillStatusMap.set(key, data);
        
        // 广播技能状态变化事件
        gameBus.emit('skill-ui-update', data);
    }

    /**
     * 获取技能状态
     */
    static getSkillStatus(heroId: number, skillId: number): any {
        const key = `${heroId}-${skillId}`;
        return this._skillStatusMap.get(key) || {
            heroId,
            skillId,
            status: 'ready',
            progress: 0
        };
    }

    /**
     * 获取技能冷却时间
     */
    static getSkillCooldown(heroId: number, skillId: number): number {
        return SkillInstanceManager.getSkillCooldown(heroId, skillId);
    }

    /**
     * 更新技能状态
     */
    static updateSkillStatus(heroId: number, skillId: number, status: string, progress: number = 0): void {
        const data = {
            heroId,
            skillId,
            status,
            progress
        };
        
        const key = `${heroId}-${skillId}`;
        this._skillStatusMap.set(key, data);
        
        // 广播技能状态变化事件
        gameBus.emit(SIGNAL_TYPES.SKILL_STATUS_CHANGED, data);
    }

    /**
     * 清理技能状态
     */
    static clearSkillStatus(heroId: number, skillId: number): void {
        const key = `${heroId}-${skillId}`;
        this._skillStatusMap.delete(key);
    }

    /**
     * 清理所有技能状态
     */
    static clearAllSkillStatus(): void {
        this._skillStatusMap.clear();
    }
} 