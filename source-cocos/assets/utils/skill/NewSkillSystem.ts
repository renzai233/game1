import { IUnit } from "db://assets/script/core/IUnit";
import { UnitBase } from "db://assets/script/core/UnitBase";

// 技能根类
export enum NEW_SKILL_ROOT {
    BALLISTIC, // 弹道
    RANGE, // 范围
    POINT, // 指向性
    LASER, // 激光
    BUFF, // 增益
    DEBUFF, // 减益
    OTHER, // 其他
}

// 技能稀有度
export enum NEW_SKILL_RARE {
    BASE, // 基础
    NORMAL, // 普通
    ADVANCED, // 高级
    ULTIMATE, // 终极
    OTHER, // 其他
}

// 技能类型枚举
export enum NEW_SKILL_TYPE {
    AUTO = 'auto', // 自动
    ACTIVE = 'active', // 主动
    PASSIVE = 'passive', // 被动
    TRIGGER = 'trigger', // 触发
    OTHER = 'other', // 其他
}

// 技能效果枚举
export enum NEW_SKILL_EFFECT {
    DAMAGE = 'damage', // 伤害
    HEAL = 'heal', // 治疗
    DEFENSE = 'defense', // 防御
    CONTROL = 'control', // 控制
    BUFF = 'buff', // 增益
    DEBUFF = 'debuff', // 减益
    SPECIAL = 'special', // 特殊
    OTHER = 'other', // 其他
}

// 技能状态枚举
export enum NEW_SKILL_STATUS {
    READY = 'ready', // 准备: 技能未释放
    RELEASING = 'releasing', // 释放中: 技能正在释放，时间未结束
    COOLDOWN = 'cooldown', // 冷却: 技能释放后进入冷却
    OTHER = 'other', // 其他: 技能状态异常
}

/**
 * 新技能接口，融合技能和技能效果
 */
export interface INewSkill extends IUnit {
    /** 技能基础属性 */
    skillId: number; // 技能ID
    heroId: number; // 关联的英雄ID
    group: NEW_SKILL_ROOT; // 技能组：弹道、范围、持续
    releaseType: string; // 技能释放类型：自动、主动、被动
    effectType: string; // 技能效果类型：伤害、治疗、控制
    
    /** 技能核心属性 */
    damage: number; // 伤害值
    cooldown: number; // 冷却时间
    range: number; // 攻击范围
    attackSpeed: number; // 攻击速度
    pierce: number; // 穿透数量
    scatterAngle: number; // 散射角度
    duration: number; // 持续时间
    
    /** 技能状态 */
    atkTiming: number; // 技能释放计时
    atkStatus: NEW_SKILL_STATUS; // 技能状态
    
    /** 技能释放 */
    canCast(): boolean; // 技能是否可释放
    cast(caster: any, targets: any[]): void; // 释放技能
    levelUp(): void; // 技能升级
    resetCooldown(): void; // 技能重置冷却
    update(dt: number): void; // 技能每帧更新
}

/**
 * 新技能基类，融合技能和技能效果
 */
export abstract class NewSkillBase extends UnitBase implements INewSkill {
    /** 技能基础属性 */
    skillId: number;
    heroId: number;
    group: NEW_SKILL_ROOT;
    releaseType: string;
    effectType: string;
    
    /** 技能核心属性 */
    damage: number;
    cooldown: number;
    range: number;
    attackSpeed: number;
    pierce: number;
    scatterAngle: number;
    duration: number;
    
    /** 技能状态 */
    atkTiming: number;
    atkStatus: NEW_SKILL_STATUS;
    
    async init(data: any) {
        await super.init(data);
        
        // 基础属性
        this.skillId = data.skillId ?? data.id;
        this.heroId = data.heroId ?? data.use_unit_id;
        this.group = data.group ?? NEW_SKILL_ROOT.BALLISTIC;
        this.releaseType = data.releaseType ?? data.skillType ?? NEW_SKILL_TYPE.AUTO;
        this.effectType = data.effectType ?? data.skillEffect ?? NEW_SKILL_EFFECT.DAMAGE;
        
        // 核心属性
        this.damage = data.damage ?? data.atk ?? 10;
        this.cooldown = data.cooldown ?? 1;
        this.range = data.range ?? 500;
        this.attackSpeed = data.attackSpeed ?? data.frequency ?? this.cooldown;
        this.pierce = data.pierce ?? 1;
        this.scatterAngle = data.scatterAngle ?? 0;
        this.duration = data.duration ?? 1;
        
        // 状态
        this.atkTiming = 0;
        this.atkStatus = NEW_SKILL_STATUS.READY;
    }
    
    /** 技能是否可释放 */
    canCast(): boolean {
        return this.atkTiming >= this.attackSpeed;
    }
    
    /** 释放技能，需子类实现 */
    abstract cast(caster: any, targets: any[]): void;
    
    /** 技能升级 */
    levelUp(): void {
        if (this.level < this.maxLevel) {
            this.level++;
            this.damage *= 1.2; // 伤害提升20%
            this.cooldown *= 0.95; // 冷却减少5%
            this.range *= 1.1; // 范围提升10%
            this.onLevelUp();
        }
    }
    
    /** 技能升级后回调 */
    protected onLevelUp(): void {}
    
    /** 技能重置冷却 */
    resetCooldown(): void {
        this.atkTiming = 0;
        this.atkStatus = NEW_SKILL_STATUS.READY;
    }
    
    /** 技能每帧更新 */
    update(dt: number): void {
        if (this.atkTiming < this.attackSpeed) {
            this.atkTiming += dt;
        }
        
        if (this.atkTiming >= this.attackSpeed) {
            this.atkStatus = NEW_SKILL_STATUS.READY;
        } else {
            this.atkStatus = NEW_SKILL_STATUS.COOLDOWN;
        }
    }
}

/**
 * 弹道技能
 */
export class BallisticSkill extends NewSkillBase {
    cast(caster: any, targets: any[]): void {
        if (!this.canCast()) return;
        
        // 重置冷却
        this.atkTiming = 0;
        this.atkStatus = NEW_SKILL_STATUS.RELEASING;
        
        // 弹道技能释放逻辑
        if (targets.length > 0) {
            // 选择第一个目标
            const target = targets[0];
            
            // 计算角度
            const angle = this.calculateAngle(caster.node.position, target.position);
            
            // 触发弹道效果
            this.triggerBallisticEffect(caster, angle);
        }
    }
    
    private calculateAngle(fromPos: any, toPos: any): number {
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }
    
    private triggerBallisticEffect(caster: any, angle: number): void {
        // 获取弹道控制器并触发效果
        const canvas = caster.node.scene.getChildByName('Canvas');
        if (canvas) {
            const ballisticController = canvas.getChildByName('Group')?.getComponent('BallisticController');
            if (ballisticController) {
                ballisticController.init(this, angle, caster.node, caster.camp);
            }
        }
    }
}

/**
 * 范围技能
 */
export class RangeSkill extends NewSkillBase {
    cast(caster: any, targets: any[]): void {
        if (!this.canCast()) return;
        
        // 重置冷却
        this.atkTiming = 0;
        this.atkStatus = NEW_SKILL_STATUS.RELEASING;
        
        // 范围技能释放逻辑
        if (targets.length > 0) {
            // 随机选择一个目标位置
            const target = targets[Math.floor(Math.random() * targets.length)];
            
            // 触发范围效果
            this.triggerRangeEffect(caster, target.position);
        }
    }
    
    private triggerRangeEffect(caster: any, targetPos: any): void {
        // 获取范围控制器并触发效果
        const canvas = caster.node.scene.getChildByName('Canvas');
        if (canvas) {
            const rangeController = canvas.getChildByName('Group')?.getComponent('RangeController');
            if (rangeController) {
                rangeController.init(this, 0, caster.node, caster.camp);
            }
        }
    }
}

/**
 * 激光技能
 */
export class LaserSkill extends NewSkillBase {
    isReleasing: boolean = false;
    durationTiming: number = 0;
    
    cast(caster: any, targets: any[]): void {
        if (!this.canCast() || this.isReleasing) return;
        
        // 激光技能释放逻辑
        if (targets.length > 0) {
            // 选择第一个目标
            const target = targets[0];
            
            // 计算距离
            const distance = this.calculateDistance(caster.node.position, target.position);
            
            // 检查是否在攻击范围内
            if (distance <= this.range) {
                // 重置冷却
                this.atkTiming = 0;
                this.atkStatus = NEW_SKILL_STATUS.RELEASING;
                this.isReleasing = true;
                this.durationTiming = 0;
                
                // 计算角度
                const angle = this.calculateAngle(caster.node.position, target.position);
                
                // 触发激光效果
                this.triggerLaserEffect(caster, angle);
            }
        }
    }
    
    update(dt: number): void {
        super.update(dt);
        
        // 处理激光持续时间
        if (this.isReleasing) {
            this.durationTiming += dt;
            if (this.durationTiming >= this.duration) {
                this.isReleasing = false;
                this.atkStatus = NEW_SKILL_STATUS.COOLDOWN;
            }
        }
    }
    
    private calculateDistance(fromPos: any, toPos: any): number {
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    private calculateAngle(fromPos: any, toPos: any): number {
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }
    
    private triggerLaserEffect(caster: any, angle: number): void {
        // 获取激光控制器并触发效果
        const canvas = caster.node.scene.getChildByName('Canvas');
        if (canvas) {
            const laserController = canvas.getChildByName('Group')?.getComponent('LaserController');
            if (laserController) {
                laserController.init(this, angle, caster.node, caster.camp);
            }
        }
    }
}

/**
 * 新技能工厂
 */
export class NewSkillFactory {
    /**
     * 创建技能实例
     * @param skillId 技能ID
     * @param heroId 英雄ID
     * @param skillData 技能数据
     */
    static async createSkill(skillId: number, heroId: number, skillData: any): Promise<INewSkill | null> {
        if (!skillId || !heroId) {
            console.warn('[NewSkillFactory] 无效的技能ID或英雄ID');
            return null;
        }
        
        // 合并技能数据
        const mergedData = {
            ...skillData,
            skillId,
            heroId,
            id: skillId,
        };
        
        // 根据技能组创建对应类型的技能
        let skill: INewSkill;
        switch (mergedData.group) {
            case NEW_SKILL_ROOT.BALLISTIC:
                skill = new BallisticSkill();
                break;
            case NEW_SKILL_ROOT.RANGE:
                skill = new RangeSkill();
                break;
            case NEW_SKILL_ROOT.LASER:
                skill = new LaserSkill();
                break;
            default:
                skill = new BallisticSkill(); // 默认弹道技能
        }
        
        await skill.init(mergedData);
        return skill;
    }
}

/**
 * 新技能管理器
 */
export class NewSkillManager {
    private static _heroSkills: Map<number, INewSkill[]> = new Map();
    
    /**
     * 给英雄添加技能
     */
    static async addSkillToHero(heroId: number, skillId: number, skillData: any): Promise<INewSkill | null> {
        const skill = await NewSkillFactory.createSkill(skillId, heroId, skillData);
        if (!skill) return null;
        
        let skills = this._heroSkills.get(heroId);
        if (!skills) {
            skills = [];
            this._heroSkills.set(heroId, skills);
        }
        
        skills.push(skill);
        return skill;
    }
    
    /**
     * 获取英雄的所有技能
     */
    static getSkillsOfHero(heroId: number): INewSkill[] {
        return this._heroSkills.get(heroId) || [];
    }
    
    /**
     * 移除英雄的所有技能
     */
    static removeSkillsOfHero(heroId: number): void {
        this._heroSkills.delete(heroId);
    }
    
    /**
     * 技能升级
     */
    static levelUpSkill(heroId: number, skillId: number): void {
        const skills = this._heroSkills.get(heroId);
        if (!skills) return;
        
        const skill = skills.find(s => s.skillId === skillId);
        if (skill) {
            skill.levelUp();
        }
    }
    
    /**
     * 更新所有技能的冷却
     */
    static updateSkills(dt: number): void {
        for (const skills of this._heroSkills.values()) {
            for (const skill of skills) {
                skill.update(dt);
            }
        }
    }
}
