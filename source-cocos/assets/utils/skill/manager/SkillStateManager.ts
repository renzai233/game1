import { gameBus } from "db://assets/utils/signal/GameBus";
import { SIGNAL_TYPES } from "../../signal/ISignal";

/**
 * 技能状态数据
 */
export interface SkillState {
    heroId: number;
    skillId: number;
    status: string;
    progress: number;
    cooldownLeft: number;
    durationLeft: number;
    lastUpdateTime: number;
    isPaused: boolean;
}

/**
 * 技能状态管理器
 * 统一管理所有技能的状态
 */
export class SkillStateManager {
    private static _instance: SkillStateManager;
    private _skillStates: Map<string, SkillState> = new Map();
    private _eventHandlers: Map<string, Function> = new Map();
    
    private constructor() {
        this.initEventHandlers();
    }
    
    /**
     * 获取单例实例
     */
    static getInstance(): SkillStateManager {
        if (!this._instance) {
            this._instance = new SkillStateManager();
        }
        return this._instance;
    }
    
    /**
     * 初始化事件处理器
     */
    private initEventHandlers(): void {
        // 监听游戏暂停/恢复事件
        this.addEventHandler('game-paused', () => this.pauseAllSkills());
        this.addEventHandler('game-resumed', () => this.resumeAllSkills());
        
        // 监听技能状态变化事件
        this.addEventHandler(SIGNAL_TYPES.SKILL_STATUS_CHANGED, (data: any) => {
            this.updateSkillState(data.heroId, data.skillId, data.status, data.progress);
        });
    }
    
    /**
     * 更新技能状态
     */
    updateSkillState(heroId: number, skillId: number, status: string, progress?: number): void {
        const key = this.getSkillKey(heroId, skillId);
        const currentState = this._skillStates.get(key);
        
        if (currentState) {
            // 更新现有状态
            currentState.status = status;
            currentState.progress = progress || 0;
            currentState.lastUpdateTime = Date.now();
            
            // 根据状态更新其他属性
            if (status === 'cooldown') {
                currentState.cooldownLeft = 1 - (progress || 0);
            } else if (status === 'releasing') {
                currentState.durationLeft = 1 - (progress || 0);
            }
        } else {
            // 创建新状态
            const newState: SkillState = {
                heroId,
                skillId,
                status,
                progress: progress || 0,
                cooldownLeft: 0,
                durationLeft: 0,
                lastUpdateTime: Date.now(),
                isPaused: false
            };
            this._skillStates.set(key, newState);
        }
        
        // 广播状态变化事件
        this.emitEvent('skill-state-updated', {
            heroId,
            skillId,
            status,
            progress: progress || 0
        });
    }
    
    /**
     * 获取技能状态
     */
    getSkillState(heroId: number, skillId: number): SkillState | undefined {
        const key = this.getSkillKey(heroId, skillId);
        return this._skillStates.get(key);
    }
    
    /**
     * 重置技能状态
     */
    resetSkillState(heroId: number, skillId: number): void {
        const key = this.getSkillKey(heroId, skillId);
        this._skillStates.delete(key);
        
        // 广播状态重置事件
        this.emitEvent('skill-state-reset', { heroId, skillId });
    }
    
    /**
     * 获取英雄的所有技能状态
     */
    getHeroSkillStates(heroId: number): SkillState[] {
        const states: SkillState[] = [];
        this._skillStates.forEach((state, key) => {
            if (state.heroId === heroId) {
                states.push(state);
            }
        });
        return states;
    }
    
    /**
     * 暂停所有技能
     */
    pauseAllSkills(): void {
        this._skillStates.forEach((state, key) => {
            if (state.status === 'releasing' || state.status === 'cooldown') {
                state.isPaused = true;
            }
        });
        
        this.emitEvent('all-skills-paused');
    }
    
    /**
     * 恢复所有技能
     */
    resumeAllSkills(): void {
        this._skillStates.forEach((state, key) => {
            state.isPaused = false;
        });
        
        this.emitEvent('all-skills-resumed');
    }
    
    /**
     * 获取技能冷却剩余时间
     */
    getCooldownLeft(heroId: number, skillId: number): number {
        const state = this.getSkillState(heroId, skillId);
        return state ? state.cooldownLeft : 0;
    }
    
    /**
     * 获取技能持续时间剩余时间
     */
    getDurationLeft(heroId: number, skillId: number): number {
        const state = this.getSkillState(heroId, skillId);
        return state ? state.durationLeft : 0;
    }
    
    /**
     * 检查技能是否可释放
     */
    canCastSkill(heroId: number, skillId: number): boolean {
        const state = this.getSkillState(heroId, skillId);
        if (!state) return true; // 新技能默认可释放
        
        return state.status === 'ready' && !state.isPaused;
    }
    
    /**
     * 检查技能是否在冷却中
     */
    isSkillOnCooldown(heroId: number, skillId: number): boolean {
        const state = this.getSkillState(heroId, skillId);
        return state ? state.status === 'cooldown' : false;
    }
    
    /**
     * 检查技能是否在释放中
     */
    isSkillReleasing(heroId: number, skillId: number): boolean {
        const state = this.getSkillState(heroId, skillId);
        return state ? state.status === 'releasing' : false;
    }
    
    /**
     * 获取所有技能状态统计
     */
    getSkillStateStats(): any {
        const stats = {
            totalSkills: this._skillStates.size,
            readySkills: 0,
            releasingSkills: 0,
            cooldownSkills: 0,
            pausedSkills: 0
        };
        
        this._skillStates.forEach((state, key) => {
            switch (state.status) {
                case 'ready':
                    stats.readySkills++;
                    break;
                case 'releasing':
                    stats.releasingSkills++;
                    break;
                case 'cooldown':
                    stats.cooldownSkills++;
                    break;
            }
            
            if (state.isPaused) {
                stats.pausedSkills++;
            }
        });
        
        return stats;
    }
    
    /**
     * 清理过期的技能状态
     */
    cleanupExpiredStates(maxAge: number = 300000): void { // 默认5分钟
        const now = Date.now();
        const expiredKeys: string[] = [];
        
        this._skillStates.forEach((state, key) => {
            if (now - state.lastUpdateTime > maxAge) {
                expiredKeys.push(key);
            }
        });
        
        expiredKeys.forEach(key => {
            this._skillStates.delete(key);
        });
        
        if (expiredKeys.length > 0) {
            console.log(`[SkillStateManager] 清理了 ${expiredKeys.length} 个过期的技能状态`);
        }
    }
    
    /**
     * 生成技能键值
     */
    private getSkillKey(heroId: number, skillId: number): string {
        return `${heroId}-${skillId}`;
    }
    
    /**
     * 添加事件处理器
     */
    private addEventHandler(event: string, handler: Function): void {
        this._eventHandlers.set(event, handler);
        gameBus.on(event, handler);
    }
    
    /**
     * 移除事件处理器
     */
    private removeEventHandler(event: string): void {
        const handler = this._eventHandlers.get(event);
        if (handler) {
            gameBus.off(event, handler);
            this._eventHandlers.delete(event);
        }
    }
    
    /**
     * 发射事件
     */
    private emitEvent(event: string, data?: any): void {
        gameBus.emit(event, data);
    }
    
    /**
     * 销毁管理器
     */
    destroy(): void {
        this._eventHandlers.forEach((handler, event) => {
            gameBus.off(event, handler);
        });
        this._eventHandlers.clear();
        this._skillStates.clear();
        
        if (SkillStateManager._instance === this) {
            SkillStateManager._instance = null as any;
        }
    }
} 