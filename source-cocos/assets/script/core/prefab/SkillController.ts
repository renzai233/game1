import { _decorator, Vec3 } from 'cc';
import { UnitController } from './UnitController';
import { IUnit } from '../IUnit';
import { UnitBehaviorType, UnitAbility, UnitState } from '../UnitBehavior';
import { MoveBehavior } from '../behaviors/UnitBehaviors';

const { ccclass } = _decorator;

/**
 * 技能控制器
 * 继承自UnitController，实现技能特有的行为
 */
@ccclass('SkillController')
export class SkillController extends UnitController {
    
    private _targetPosition: Vec3 = new Vec3();
    private _moveSpeed: number = 0;
    private _damage: number = 0;
    private _pierce: number = 0;
    private _hitTargets: Set<string> = new Set();

    /**
     * 初始化技能
     */
    async init(data: IUnit, isStand: boolean = false): Promise<void> {
        // 技能可以移动，不能攻击和释放技能
        data.can_move = true;
        data.can_attack = false;
        data.can_skill = false;
        
        await super.init(data, isStand);
        
        // 设置技能特有的能力
        // this.setupSkillAbilities();
        
        console.log(`[SkillController] 技能 ${this.unitName} 初始化完成`);
    }

    /**
     * 设置技能特有能力
     */
    // private setupSkillAbilities(): void {
    //     // 技能可以移动
    //     this.abilities.add(UnitAbility.MOVE);
        
    //     // 技能不能被锁定和攻击
    //     this.abilities.delete(UnitAbility.TARGET);
    //     this.abilities.delete(UnitAbility.DAMAGE);
    //     this.abilities.delete(UnitAbility.AI);
    // }

    /**
     * 设置技能目标位置
     */
    setTargetPosition(position: Vec3): void {
        this._targetPosition = position;
    }

    /**
     * 设置技能移动速度
     */
    setMoveSpeed(speed: number): void {
        this._moveSpeed = speed;
    }

    /**
     * 设置技能伤害
     */
    setDamage(damage: number): void {
        this._damage = damage;
    }

    /**
     * 设置技能穿透次数
     */
    setPierce(pierce: number): void {
        this._pierce = pierce;
    }

    /**
     * 技能移动
     */
    moveToTarget(deltaTime: number): void {
        if (!this.node || !this.canMove) return;

        const currentPos = this.node.position;
        const direction = new Vec3(
            this._targetPosition.x - currentPos.x,
            this._targetPosition.y - currentPos.y,
            0
        );

        const distance = Vec3.len(direction);
        if (distance < 5) { // 到达目标
            this.onReachTarget();
            return;
        }

        // 移动技能
        Vec3.normalize(direction, direction);
        const moveStep = this._moveSpeed * deltaTime;
        const newPos = new Vec3(
            currentPos.x + direction.x * moveStep,
            currentPos.y + direction.y * moveStep,
            currentPos.z
        );

        this.node.position = newPos;
    }

    /**
     * 到达目标时的处理
     */
    private onReachTarget(): void {
        // 技能到达目标，造成伤害
        this.dealDamage();
        
        // 检查是否还有穿透次数
        if (this._pierce > 0) {
            this._pierce--;
            // 继续移动（可以设置新的目标位置）
        } else {
            // 技能结束
            this.onSkillEnd();
        }
    }

    /**
     * 造成伤害
     */
    private dealDamage(): void {
        // 查找范围内的敌方单位
        const enemies = this.findEnemiesInRange();
        
        enemies.forEach(enemy => {
            if (this._hitTargets.has(enemy.uuid)) return; // 已经命中过
            
            // 造成伤害
            if (enemy.takeDamage) {
                enemy.takeDamage(this._damage, this);
                this._hitTargets.add(enemy.uuid);
            }
        });
    }

    /**
     * 查找范围内的敌方单位
     */
    private findEnemiesInRange(): any[] {
        if (!this.node || !this.node.parent) return [];

        const enemies = this.node.parent.children.filter(node => {
            if (node === this.node) return false;
            if (!node.activeInHierarchy) return false;

            // 检查是否是敌方单位
            const unit = this.getUnitFromNode(node);
            if (!unit || unit.camp === this.camp) return false;

            // 检查距离
            const distance = Vec3.distance(this.node.position, node.position);
            return distance <= this.attackRange;
        });

        return enemies.map(node => this.getUnitFromNode(node)).filter(unit => unit);
    }

    /**
     * 从节点获取单位控制器
     */
    private getUnitFromNode(node: any): any {
        const controllerTypes = ['UnitController', 'HeroController', 'MonsterController', 'TowerController', 'WallController'];
        for (const type of controllerTypes) {
            const component = node.getComponent(type);
            if (component) return component;
        }
        return null;
    }

    /**
     * 技能结束
     */
    private onSkillEnd(): void {
        console.log(`[SkillController] 技能 ${this.unitName} 结束`);
        this.destroy();
    }

    /**
     * 技能是否在移动
     */
    // isMoving(): boolean {
    //     return this._behaviorManager?.hasBehavior(UnitBehaviorType.MOVE) || false;
    // }
}
