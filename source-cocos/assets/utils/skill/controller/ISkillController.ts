import { Node } from 'cc';
import { ISkill } from '../ISkill';

/**
 * 统一技能控制器接口
 * 所有技能控制器都需要实现此接口
 */
export interface ISkillController {
    /**
     * 初始化技能控制器
     * @param skill 技能数据
     * @param angle 发射角度
     * @param unitNode 发射单位节点
     * @param camp 阵营
     */
    init(skill: ISkill, angle: number, unitNode: Node, camp: string): void;
    
    /**
     * 更新技能控制器
     * @param dt 帧间隔时间
     */
    update(dt: number): void;
    
    /**
     * 销毁技能控制器
     */
    destroy(): void;
    
    /**
     * 暂停技能控制器
     */
    pause(): void;
    
    /**
     * 恢复技能控制器
     */
    resume(): void;
    
    /**
     * 获取技能状态
     */
    getStatus(): string;
    
    /**
     * 检查是否已销毁
     */
    isDestroyed(): boolean;
}

/**
 * 技能控制器状态枚举
 */
export enum SKILL_CONTROLLER_STATUS {
    IDLE = 'idle',           // 空闲状态
    INITIALIZING = 'init',   // 初始化中
    ACTIVE = 'active',       // 激活状态
    PAUSED = 'paused',       // 暂停状态
    DESTROYING = 'destroying', // 销毁中
    DESTROYED = 'destroyed'  // 已销毁
} 