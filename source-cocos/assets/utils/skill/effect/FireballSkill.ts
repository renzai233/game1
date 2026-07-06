import { Node, instantiate, Prefab } from 'cc';
import { SkillBase } from '../SkillBase';
import { SkillEffectController } from '../controller/SkillEffectController';

/**
 * 火球技能实现
 */
export class FireballSkill extends SkillBase {
    private sePrefab: Prefab | null = null;

    async init(data: any) {
        await super.init(data);
    }

    cast(caster: Node, targets: Node[]): void {
        if (!targets || targets.length === 0) return;

        // 选择目标（随机选择一个敌人）
        const target = this.selectRandomTarget(targets);
        if (!target) return;

        // 计算角度
        const angle = this.computeAngle(caster, target);

        // 创建火球特效
        this.createFireballEffect(caster, target, angle);
    }

    private selectRandomTarget(targets: Node[]): Node | null {
        if (targets.length === 0) return null;
        return targets[Math.floor(Math.random() * targets.length)];
    }

    private computeAngle(from: Node, to: Node): number {
        const dx = to.position.x - from.position.x;
        const dy = to.position.y - from.position.y;
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }

    private createFireballEffect(caster: Node, target: Node, angle: number): void {
        if (!this.sePrefab) {
            console.warn('[FireballSkill] 火球特效预制体未设置');
            return;
        }

        try {
            const sePrefab = instantiate(this.sePrefab);
            const bulletData = {
                id: this.skillId,
                atk: this.atk,
                angle: angle,
                camp: (caster.getComponent('UnitController') as any)?.camp,
                // 火球特有属性
                damageRadius: this.skillId === 32 ? 8 : 0, // 火球爆裂
            };

            sePrefab.setPosition(caster.position);
            const skillEffectCtrl = sePrefab.getComponent(SkillEffectController);
            if (skillEffectCtrl) {
                skillEffectCtrl.init(bulletData);
            }
            caster.parent?.addChild(sePrefab);
        } catch (error) {
            console.error('[FireballSkill] 创建火球特效失败:', error);
        }
    }

    setEffectPrefab(prefab: Prefab): void {
        this.sePrefab = prefab;
    }

    playAnimation(): void {
        // 播放火球动画
        console.log(`[FireballSkill] 播放火球动画: skillId=${this.skillId}`);
    }

    playSound(): void {
        // 播放火球音效
        console.log(`[FireballSkill] 播放火球音效: skillId=${this.skillId}`);
    }
} 