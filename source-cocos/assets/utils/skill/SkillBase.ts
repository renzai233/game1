import { ISkill, SKILL_EFFECT, SKILL_ROOT, SKILL_STATUS, SKILL_TYPE } from './ISkill';
import { UnitBase } from "db://assets/script/core/UnitBase";

/**
 * 技能基类，所有技能继承
 */
export abstract class SkillBase extends UnitBase implements ISkill {
    /** 技能基础属性 */
    skillId: number; // 技能ID
    group: SKILL_ROOT; // 技能组：弹道、范围、持续
    releaseType: string; // 技能释放类型：自动、主动、被动
    effectType: string; // 技能效果类型：伤害、治疗、控制
    canLearn?: boolean; // 技能是否可学习
    /** 解锁前置技能 */
    unlockPreSkillIds?: string[]; // 解锁前置技能

    atkTiming?: number; // 技能释放计时（秒）
    atkStatus?: SKILL_STATUS; // 技能释放状态
    cooldown?: number; // 技能冷却时间

    scatterAngle?: number; // 散射角度
    // [key: string]: any;


    async init(data: any) {
        await super.init(data);
        /** 技能基础属性 */
        this.skillId = data.skillId ?? data.id ?? data.unit_id;
        this.group = this.getSkillRoot(data.group);
        this.releaseType = data.release_type ?? data.skillType ?? SKILL_TYPE.AUTO;
        this.effectType = data.effect_type ?? data.skillEffect ?? SKILL_EFFECT.DAMAGE;

        this.canLearn = data.can_learn ?? data.canLearn ?? true;
        this.atkTiming = 0;
        this.atkStatus = SKILL_STATUS.READY;
        this.cooldown = data.cooldown ?? 1; // 默认冷却时间1秒
        this.attackSpeed = data.attackSpeed ?? this.cooldown; // 攻击速度默认等于冷却时间
        const rawScatterAngle = data.scatterAngle ?? data.scatter_angle;
        if (rawScatterAngle !== undefined && rawScatterAngle !== null) {
            this.scatterAngle = Number(rawScatterAngle);
        }

        /** 解锁前置技能 */
        this.unlockPreSkillIds = data.unlockPreSkillIds ?? [];
        // console.log('[SkillBase][init] id', this.id, ' data', data, 'this', this);
    }

    /**
     * 将字符串group转换为SKILL_ROOT枚举
     */
    private getSkillRoot(group: string): SKILL_ROOT {
        switch (group) {
            case 'ballistic':
                return SKILL_ROOT.BALLISTIC;
            case 'range':
                return SKILL_ROOT.RANGE;
            case 'laser':
                return SKILL_ROOT.LASER;
            default:
                return SKILL_ROOT.BALLISTIC;
        }
    }
    /** 技能是否可释放 */
    canCast() {
        this.atkStatus = this.atkTiming > this.attackSpeed ? SKILL_STATUS.READY : SKILL_STATUS.RELEASING;
    }

    /** 释放技能，需子类实现 */
    abstract cast(caster: any, targets: any[]): void;

    /** 技能升级 */
    levelUp(): void {
        if (this.level < this.maxLevel) {
            this.level++;
            this.onLevelUp();
        }
    }

    /** 技能升级后回调，如解锁特殊能力 */
    protected onLevelUp(): void { }

    /** 技能重置冷却 */
    resetCooldown(): void {
        this.atkTiming = 0;
    }

    /** 技能动画播放，子类可重写 */
    playAnimation(): void { }

    /** 技能音效播放，子类可重写 */
    playSound(): void { }

    /** 技能特殊能力解锁检测 */
    isUnlocked(): void {
        // TODO: 当前已学习技能满足了解锁前置技能检测那么可以学习
        this.canLearn = true;
    }
}
