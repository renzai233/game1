import { _decorator, instantiate, Prefab, Vec3 } from 'cc';
import { SkillEffectController } from '../controller/SkillEffectController';
import { skillEffectPool } from '../SkillEffectPool';
import { BaseSkillController } from '../controller/BaseSkillController';
import { SDM } from '../../data/config/skill/SkillDataManager';
const { ccclass, property } = _decorator;

@ccclass('RangeController')
export class RangeController extends BaseSkillController {
    @property(Prefab)
    skillEffectPrefab: Prefab; // 技能特效预制体

    /**
     * 子类实现的初始化逻辑
     */
    protected onInit(): void {

        if (!this._skill || !this._unitNode) {
            console.error('[RangeController] 技能数据或单位节点无效');
            return;
        }
        const skillId = this._skill!.skillId || this._skill!.id;
        const skillConfig = SDM.getSkillById(skillId) as any;
        if (!skillConfig) {
            console.error('[RangeController] 未找到技能配置数据');
            return;
        }

        let baseEffect: any = JSON.parse(JSON.stringify({
            ...skillConfig,
            ...this._skill,
        }));
        baseEffect.atk = (this._skill as any).damage || (this._skill as any).atk || skillConfig.atk || baseEffect.atk;
        baseEffect.damage = baseEffect.atk;
        baseEffect.range = (this._skill as any).range || (this._skill as any).attackRange || skillConfig.atk_range || baseEffect.range;
        baseEffect.cooldown = 1;
        baseEffect.pierce = this._skill!.pierce || baseEffect.pierce;
        baseEffect.camp = this._camp;
        baseEffect.id = skillId;
        baseEffect.skillId = skillId;
        baseEffect.moveSpeed = 0;
        baseEffect.url = (this._skill as any).url || skillConfig.url || baseEffect.url;
        baseEffect.damageInterval = baseEffect.frequency ? 1 / Number(baseEffect.frequency) : 1;
        // 准备对象池
        const effectPoolKey = String(baseEffect.url || 'range');
        if (this.skillEffectPrefab && skillEffectPool.getEffectPoolSize(effectPoolKey) === 0) {
            skillEffectPool.registerEffectPool(effectPoolKey, this.skillEffectPrefab, 50);
        }

        // 立即释放第一个技能效果
        this.spawnSkillEffect(baseEffect, effectPoolKey);

        // 连发参数（repeat>=0 表示额外次数）
        const repeatCount = Math.max(0, Number((this._skill as any).repeat) || 0);
        const repeatInterval = Number((this._skill as any).repeatInterval) || 0.5;
        const duration = Number((this._skill as any).duration) || 1;
        // 执行连发：后续按间隔repeat次
        for (let i = 1; i <= repeatCount; i++) {
            this.scheduleOnce(() => {
                // 防御父节点失效
                if (!this.node || !this.node.isValid || !this._unitNode || !this._unitNode.isValid) return;
                this.spawnSkillEffect(baseEffect, effectPoolKey);

                // 如果是最后一个repeat，等待duration结束后才完成技能释放
                if (i === repeatCount) {
                    this.scheduleOnce(() => {
                    }, duration);
                }
            }, i * repeatInterval);
        }
    }

    /**
     * 生成技能效果
     */
    private spawnSkillEffect(baseEffect: any, effectPoolKey: string): void {
        try {
            // 获取随机敌人位置
            const targetPos = this.getRandomEnemyPosition();

            // 根据技能类型选择生成方法
            if (this._skill!.skillId === 2) {
                this.spawnFirewall(targetPos, baseEffect, effectPoolKey);
            } else {
                this.spawnOne(targetPos, baseEffect, effectPoolKey);
            }
        } catch (error) {
            console.error('[RangeController] 生成技能效果失败:', error);
        }
    }

    /**
     * 获取随机敌人位置
     */
    private getRandomEnemyPosition(): Vec3 {
        if (!this._unitNode || !this._unitNode.parent) {
            return this._unitNode ? this._unitNode.position.clone() : new Vec3(0, 0, 0);
        }

        const enemies = this._unitNode.parent.children.filter(node => {
            const unit = node.getComponent('MonsterController');
            if (!unit) return false;
            return (unit as any).camp !== this._camp;
        });

        if (enemies.length > 0) {
            // 随机选择一个敌人
            const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];
            return randomEnemy.position.clone();
        } else {
            // 如果没有敌人，使用英雄位置
            return this._unitNode.position.clone();
        }
    }

    /**
     * 生成火墙效果
     */
    private spawnFirewall(targetPos: Vec3, baseEffect: any, effectPoolKey: string): void {
        const parentNode = this._unitNode?.parent;
        if (!parentNode || !parentNode.isValid) return;

        const number = 700 / 100;
        for (let i = 0; i <= Math.floor(number); i++) {
            const effectNode = skillEffectPool.getEffect(effectPoolKey) || instantiate(this.skillEffectPrefab);
            effectNode.active = false;
            effectNode.setPosition(50 + 100 * i, targetPos.y, 0);
            parentNode.addChild(effectNode);
            const ctrl = effectNode.getComponent(SkillEffectController);
            if (ctrl) {
                ctrl.bindPool(effectPoolKey);
                ctrl.init(JSON.parse(JSON.stringify(baseEffect)));
            }
            effectNode.active = true;
        }
    }

    /**
     * 生成单个效果
     */
    private spawnOne(targetPos: Vec3, baseEffect: any, effectPoolKey: string): void {
        const parentNode = this._unitNode?.parent;
        if (!parentNode || !parentNode.isValid) return;

        const effectNode = skillEffectPool.getEffect(effectPoolKey) || instantiate(this.skillEffectPrefab);
        effectNode.active = false;
        effectNode.setPosition(targetPos.x, targetPos.y, 0);
        parentNode.addChild(effectNode);
        const ctrl = effectNode.getComponent(SkillEffectController);
        if (ctrl) {
            ctrl.bindPool(effectPoolKey);
            ctrl.init(JSON.parse(JSON.stringify(baseEffect)));
        }
        effectNode.active = true;
    }

    /**
     * 子类实现的更新逻辑
     */
    protected onUpdate(dt: number): void {
        // 范围技能通常不需要复杂的更新逻辑
        // 子类可以重写此方法添加特定行为
    }

    /**
     * 子类实现的销毁逻辑
     */
    protected onDestroyInternal(): void {
        // 清理定时器
        this.unscheduleAllCallbacks();
    }

    /**
     * 子类实现的暂停逻辑
     */
    protected onPause(): void {
        // 暂停所有定时器
        this.unscheduleAllCallbacks();
    }

    /**
     * 子类实现的恢复逻辑
     */
    protected onResume(): void {
        // 恢复技能逻辑，这里需要重新计算剩余时间
        // 由于暂停时清理了定时器，这里需要重新调度
        this.onInit();
    }
}
