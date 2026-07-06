import { _decorator, Component, instantiate, Node, Prefab, Vec3 } from 'cc';
import { ISkill } from '../ISkill';
import { SkillEffectController } from '../controller/SkillEffectController';
import { skillEffectPool } from '../SkillEffectPool';
import { BaseSkillController } from '../controller/BaseSkillController';
const { ccclass, property } = _decorator;

@ccclass('FireballController')
export class FireballController extends BaseSkillController {
    @property(Prefab)
    explosionPrefab: Prefab; // 爆炸特效预制体

    /**
     * 子类实现的初始化逻辑
     */
    protected onInit(): void {
        if (!this._skill || !this._unitNode) {
            console.error('[FireballController] 技能数据或单位节点无效');
            return;
        }

        // 缓存发射位置和父节点，避免延迟执行时节点已销毁
        const shootPos = this._unitNode.position.clone();
        const parentNode = this._unitNode.parent;

        if (!parentNode || !parentNode.isValid) {
            console.error('[FireballController] 父节点无效');
            return;
        }

        // 预注册对象池（按 url 或 bullet 作为池名）
        const poolKey = String((this._skill as any).url || 'fireball');
        if (this.explosionPrefab && skillEffectPool.getEffectPoolSize(poolKey) === 0) {
            skillEffectPool.registerEffectPool(poolKey, this.explosionPrefab, 100);
        }

        const repeatCount = Math.max(0, Number((this._skill as any).repeat) || 0);
        const quantityCount = Math.max(0, Number((this._skill as any).quantity) || 0);
        const rawScatterStep = (this._skill as any).scatterAngle ?? (this._skill as any).scatter_angle;
        const configuredScatterStep = Number(rawScatterStep);
        const scatterStep = rawScatterStep !== undefined && rawScatterStep !== null && Number.isFinite(configuredScatterStep)
            ? Math.max(0, configuredScatterStep)
            : (quantityCount > 0 ? Math.min(10, 60 / quantityCount) : 0);
        const bulletCount = quantityCount + 1;

        // 连射
        for (let i = 0; i <= repeatCount; i++) {
            this.scheduleOnce(() => {
                // 检查父节点是否还存在
                if (!parentNode || !parentNode.isValid) {
                    return;
                }

                for (let j = 0; j < bulletCount; j++) {
                    const offset = (j - (bulletCount - 1) / 2) * scatterStep;
                    this.createFireball(this._skill!, this._angle + offset, shootPos, parentNode, poolKey);
                }
            }, i * 0.1); // 连射间隔0.1秒
        }
    }

    /**
     * 子类实现的更新逻辑
     */
    protected onUpdate(dt: number): void {
        // 火球技能通常不需要复杂的更新逻辑
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

    /**
     * 创建单个火球
     */
    private createFireball(skill: ISkill, angle: number, shootPos: Vec3, parentNode: Node, poolKey: string) {
        try {
            const effectNode = skillEffectPool.getEffect(poolKey) || instantiate(this.explosionPrefab);
            // 深拷贝快照数据，确保每发子弹独立
            const skillEffectData: any = JSON.parse(JSON.stringify(skill));
            skillEffectData.scatterAngle = angle; // 正确赋值每发子弹的角度
            skillEffectData.camp = this._camp; // 阵营
            skillEffectData.id = skill.id; // 技能ID
            skillEffectData.skillId = skill.skillId; // 技能ID
            skillEffectData.explosionPrefab = this.explosionPrefab; // 传递爆炸预制体

            effectNode.active = false;
            effectNode.setPosition(shootPos);
            parentNode.addChild(effectNode);
            const ctrl = effectNode.getComponent(SkillEffectController);
            if (ctrl) {
                ctrl.bindPool(poolKey);
                ctrl.init(skillEffectData);
            }
            effectNode.active = true;
        } catch (error) {
            console.error('[FireballController] Error creating fireball:', error);
        }
    }
}
