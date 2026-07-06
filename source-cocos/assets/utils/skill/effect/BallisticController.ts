import { _decorator, instantiate, Node, Prefab, Vec3 } from 'cc';
import { ISkill } from '../ISkill';
import { SkillEffectController } from '../controller/SkillEffectController';
import { skillEffectPool } from '../SkillEffectPool';
import { BaseSkillController } from '../controller/BaseSkillController';
const { ccclass, property } = _decorator;

@ccclass('BallisticController')
export class BallisticController extends BaseSkillController {
    @property(Prefab)
    skillEffectPrefab: Prefab; // 技能特效预制体

    /**
     * 子类实现的初始化逻辑
     */
    protected onInit(): void {
        if (!this._skill || !this._unitNode) {
            console.error('[BallisticController] 技能数据或单位节点无效');
            return;
        }

        // 固化本次释放快照，避免共享控制器在并发施法时被后续 init 覆盖
        const skillSnapshot: ISkill = JSON.parse(JSON.stringify(this._skill));
        const baseAngle = this._angle;
        const castCamp = this._camp;

        // 缓存发射位置和父节点，避免延迟执行时节点已销毁
        const shootPos = this._unitNode.position.clone();
        const parentNode = this._unitNode.parent;

        if (!parentNode || !parentNode.isValid) {
            console.error('[BallisticController] 父节点无效');
            return;
        }

        // 预注册对象池（按技能 url 作为池名）
        const poolKey = String((skillSnapshot as any).url || 'bullet');
        if (this.skillEffectPrefab && skillEffectPool.getEffectPoolSize(poolKey) === 0) {
            skillEffectPool.registerEffectPool(poolKey, this.skillEffectPrefab, 100);
        }

        const repeatCount = Math.max(0, Number((skillSnapshot as any).repeat) || 0);
        const quantityCount = Math.max(0, Number((skillSnapshot as any).quantity) || 0);
        const rawScatterStep = (skillSnapshot as any).scatterAngle ?? (skillSnapshot as any).scatter_angle;
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
                    this.createBullet(skillSnapshot, baseAngle + offset, shootPos, parentNode, poolKey, castCamp);
                }
            }, i * 0.1); // 连射间隔0.1秒
        }
    }

    /**
     * 子类实现的更新逻辑
     */
    protected onUpdate(dt: number): void {
        // 弹道技能通常不需要复杂的更新逻辑
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
     * 创建单个子弹
     */
    private createBullet(skill: ISkill, angle: number, shootPos: Vec3, parentNode: Node, poolKey: string, camp: string) {
        try {
            const effectNode = skillEffectPool.getEffect(poolKey) || instantiate(this.skillEffectPrefab);
            // 深拷贝快照数据，确保每发子弹独立
            const skillEffectData: any = JSON.parse(JSON.stringify(skill));
            skillEffectData.scatterAngle = angle; // 正确赋值每发子弹的角度
            skillEffectData.camp = camp; // 使用本次释放快照阵营，避免并发覆盖
            skillEffectData.id = skill.skillId || skill.id; // 技能ID
            skillEffectData.skillId = skill.skillId || skill.id; // 技能ID

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
            console.error('[BallisticController] Error creating bullet:', error);
        }
    }
}
