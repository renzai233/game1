import { Node, instantiate, Prefab } from 'cc';
import { SkillBase } from '../SkillBase';
import { SkillEffectController } from '../controller/SkillEffectController';

/**
 * 箭矢技能实现
 */
export class ArrowSkill extends SkillBase {
    private sePrefab: Prefab | null = null;

    async init(data: any) {
        await super.init(data);
        // 可以在这里初始化技能特有的属性
    }

    cast(caster: Node, targets: Node[]): void {
        if (!targets || targets.length === 0) return;

        // 选择目标（选择最近的敌人）
        const target = this.selectTarget(caster, targets);
        if (!target) return;

        // 计算角度
        const angle = this.computeAngle(caster, target);

        // 创建箭矢特效
        this.createArrowEffect(caster, target, angle);
    }

    private selectTarget(caster: Node, targets: Node[]): Node | null {
        if (targets.length === 0) return null;

        // 选择最近的敌人
        let nearestTarget: Node | null = null;
        let minDistance = Infinity;

        for (const target of targets) {
            const distance = this.getDistance(caster, target);
            if (distance < minDistance) {
                minDistance = distance;
                nearestTarget = target;
            }
        }

        return nearestTarget;
    }

    private getDistance(node1: Node, node2: Node): number {
        const dx = node1.position.x - node2.position.x;
        const dy = node1.position.y - node2.position.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private computeAngle(from: Node, to: Node): number {
        const dx = to.position.x - from.position.x;
        const dy = to.position.y - from.position.y;
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }

    private createArrowEffect(caster: Node, target: Node, angle: number): void {
        if (!this.sePrefab) {
            console.warn('[ArrowSkill] 箭矢特效预制体未设置');
            return;
        }

        try {
            const sePrefab = instantiate(this.sePrefab);
            const bulletData = {
                id: this.skillId,
                atk: this.atk,
                angle: angle,
                camp: (caster.getComponent('UnitController') as any)?.camp,
                // 其他子弹属性
            };

            sePrefab.setPosition(caster.position);
            const skillEffectCtrl = sePrefab.getComponent(SkillEffectController);
            if (skillEffectCtrl) {
                skillEffectCtrl.init(bulletData);
            }
            caster.parent?.addChild(sePrefab);
        } catch (error) {
            console.error('[ArrowSkill] 创建箭矢特效失败:', error);
        }
    }

    setEffectPrefab(prefab: Prefab): void {
        this.sePrefab = prefab;
    }

    playAnimation(): void {
        // 播放箭矢动画
        console.log(`[ArrowSkill] 播放箭矢动画: skillId=${this.skillId}`);
    }

    playSound(): void {
        // 播放箭矢音效
        console.log(`[ArrowSkill] 播放箭矢音效: skillId=${this.skillId}`);
    }
} 