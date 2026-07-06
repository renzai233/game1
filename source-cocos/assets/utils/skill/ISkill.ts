import { IUnit } from "db://assets/script/core/IUnit";

// 技能根类
export enum SKILL_ROOT {
    BALLISTIC, // 弹道
    RANGE, // 范围
    POINT, // 指向性
    LASER, // 激光
    BUFF, // 增益
    DEBUFF, // 减益
    OTHER, // 其他
}

// 技能稀有度
export enum SKILL_RARE {
    BASE, // 基础
    NORMAL, // 普通
    ADVANCED, // 高级
    ULTIMATE, // 终极
    OTHER, // 其他
}

// 技能类型枚举
export enum SKILL_TYPE {
    AUTO = 'auto', // 自动
    ACTIVE = 'active', // 主动
    PASSIVE = 'passive', // 被动
    TRIGGER = 'trigger', // 触发
    OTHER = 'other', // 其他
}

// 技能效果枚举
export enum SKILL_EFFECT {
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
export enum SKILL_STATUS {
    READY = 'ready', // 准备: 技能未释放
    RELEASING = 'releasing', // 释放中: 技能正在释放，时间未结束
    COOLDOWN = 'cooldown', // 冷却: 技能释放后进入冷却
    OTHER = 'other', // 其他: 技能状态异常
}

/**
 * 技能接口，所有技能需实现
 */
export interface ISkill extends IUnit {
    /** 技能基础属性 */
    skillId: number; // 技能ID
    group: SKILL_ROOT; // 技能组：弹道、范围、持续
    releaseType: string; // 技能释放类型：自动、主动、被动
    effectType: string; // 技能效果类型：伤害、治疗、控制
    canLearn?: boolean; // 技能是否可学习
    /** 解锁前置技能 */
    unlockPreSkillIds?: string[]; // 解锁前置技能
    
    scatterAngle?: number;
    castTime?: number; // 技能释放计时（秒）castTime > cooldownLeft 技能可释放

    // [key: string]: any;

    /** 技能释放 */
    canCast(): void; // 技能是否可释放
    cast(caster: any, targets: any[]): void; // 释放技能
    levelUp(): void; // 技能升级
    resetCooldown(): void; // 技能重置冷却
    playAnimation(): void; // 技能动画播放
    playSound(): void; // 技能音效播放
    isUnlocked(): void; // 技能特殊能力解锁检测
}

export interface ISkillEffect {
    id: number; // 效果ID
    skillId: number; // 技能ID
    name: string; // 名称
    desc: string; // 描述
    camp: string; // 阵营
    level: number; // 等级
    maxLevel: number; // 最大等级
    star: number; // 星级
    maxStar: number; // 最大星级
    repeat: number; // 连射数量
    quantity: number; // 齐射数量
    pierce: number; // 穿透数量
    damage: number; // 伤害加成
    damageRate: number; // 伤害加成百分比
    cooldown: number; // 冷却加成
    cooldownRate: number; // 冷却加成百分比
    moveSpeed: number; // 速度加成
    criticalRate: number; // 暴击率
    criticalDamage: number; // 暴击伤害倍数
    range: number; // 伤害范围
    duration: number; // 持续时间
    damageCooldown: number; // 伤害冷却
    damageTimes: number; // 伤害次数
    canLearn: boolean; // 可以学习
    unlockPreEffectIds: number[]; // 解锁前置效果
}

/**
 * 技能子弹接口
 */
export interface ISkillBullet extends ISkill {
    spriteConfig: any; // 子弹精灵图配置
    /** 子弹应用到目标 */
    apply(target: any): void;
    /** 子弹移除 */
    remove(target: any): void;
}

