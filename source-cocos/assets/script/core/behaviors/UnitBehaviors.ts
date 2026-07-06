import { _decorator, Node, Vec3 } from 'cc';
import { IUnitBehavior, UnitBehaviorType, IUnitController } from '../UnitBehavior';
import { applySpeedScale } from 'db://assets/utils/data/config/manager/GameDataManager';

const { ccclass } = _decorator;

/**
 * 待机行为
 */
@ccclass('IdleBehavior')
export class IdleBehavior implements IUnitBehavior {
    type = UnitBehaviorType.IDLE;
    interruptible = true;
    duration = 0; // 无限持续
    priority = 0;

    execute(unit: IUnitController): void {
        // 待机时停止移动
        if (unit.canMove) {
            // 可以播放待机动画
            this.playIdleAnimation(unit);
        }
    }

    stop(unit: IUnitController): void {
        // 停止待机动画
    }

    update(unit: IUnitController, deltaTime: number): void {
        // 待机时不需要特殊处理
    }

    private playIdleAnimation(unit: IUnitController): void {
        // 播放待机动画的逻辑
        console.log(`[IdleBehavior] ${unit.unitName} 进入待机状态`);
    }
}

/**
 * 移动行为
 */
@ccclass('MoveBehavior')
export class MoveBehavior implements IUnitBehavior {
    type = UnitBehaviorType.MOVE;
    interruptible = true;
    duration = 0; // 根据移动距离计算
    priority = 1;

    private _targetPosition: Vec3 = new Vec3();
    private _moveSpeed: number = 0;

    constructor(targetPosition?: Vec3, moveSpeed?: number) {
        if (targetPosition) this._targetPosition = targetPosition;
        if (moveSpeed) this._moveSpeed = moveSpeed;
    }

    execute(unit: IUnitController): void {
        if (!unit.canMove) {
            this.stop(unit);
            return;
        }

        this._moveSpeed = unit.moveSpeed;
        this.playMoveAnimation(unit);
    }

    stop(unit: IUnitController): void {
        // 停止移动动画
    }

    update(unit: IUnitController, deltaTime: number): void {
        if (!unit.canMove || !unit.target) {
            this.stop(unit);
            return;
        }

        const currentPos = unit.target.position;
        const targetPos = this._targetPosition;
        const direction = new Vec3(
            targetPos.x - currentPos.x,
            targetPos.y - currentPos.y,
            0
        );

        const distance = Vec3.len(direction);
        if (distance < 5) { // 到达目标
            this.stop(unit);
            return;
        }

        // 移动单位
        Vec3.normalize(direction, direction);
        const moveStep = this._moveSpeed * applySpeedScale(deltaTime);
        const newPos = new Vec3(
            currentPos.x + direction.x * moveStep,
            currentPos.y + direction.y * moveStep,
            currentPos.z
        );

        unit.target.position = newPos;
    }

    private playMoveAnimation(unit: IUnitController): void {
        console.log(`[MoveBehavior] ${unit.unitName} 开始移动`);
    }
}

/**
 * 攻击行为
 */
@ccclass('AttackBehavior')
export class AttackBehavior implements IUnitBehavior {
    type = UnitBehaviorType.ATTACK;
    interruptible = false;
    duration = 1.0; // 攻击持续时间
    priority = 3;

    private _attackTimer: number = 0;
    private _attackInterval: number = 0;

    execute(unit: IUnitController): void {
        if (!unit.canAttack || !unit.target) {
            this.stop(unit);
            return;
        }

        this._attackTimer = 0;
        this._attackInterval = 1 / unit.attackSpeed;
        this.playAttackAnimation(unit);
    }

    stop(unit: IUnitController): void {
        // 停止攻击动画
    }

    update(unit: IUnitController, deltaTime: number): void {
        if (!unit.canAttack || !unit.target) {
            this.stop(unit);
            return;
        }

        this._attackTimer += deltaTime;
        if (this._attackTimer >= this._attackInterval) {
            this.performAttack(unit);
            this._attackTimer = 0;
        }
    }

    private performAttack(unit: IUnitController): void {
        if (!unit.target) return;

        // 计算伤害
        const damage = unit.atk;
        
        // 对目标造成伤害
        if (unit.target.takeDamage) {
            unit.target.takeDamage(damage, unit);
        }

        console.log(`[AttackBehavior] ${unit.unitName} 攻击目标，造成 ${damage} 点伤害`);
    }

    private playAttackAnimation(unit: IUnitController): void {
        console.log(`[AttackBehavior] ${unit.unitName} 开始攻击`);
    }
}

/**
 * 技能行为
 */
@ccclass('SkillBehavior')
export class SkillBehavior implements IUnitBehavior {
    type = UnitBehaviorType.SKILL;
    interruptible = false;
    duration = 2.0; // 技能持续时间
    priority = 4;

    private _skillId: number;
    private _skillTimer: number = 0;

    constructor(skillId: number) {
        this._skillId = skillId;
    }

    execute(unit: IUnitController): void {
        if (!unit.canSkill) {
            this.stop(unit);
            return;
        }

        this._skillTimer = 0;
        this.playSkillAnimation(unit);
        this.castSkill(unit);
    }

    stop(unit: IUnitController): void {
        // 停止技能动画
    }

    update(unit: IUnitController, deltaTime: number): void {
        this._skillTimer += deltaTime;
        // 技能更新逻辑
    }

    private castSkill(unit: IUnitController): void {
        console.log(`[SkillBehavior] ${unit.unitName} 释放技能 ${this._skillId}`);
        // 技能释放逻辑
    }

    private playSkillAnimation(unit: IUnitController): void {
        console.log(`[SkillBehavior] ${unit.unitName} 开始技能动画`);
    }
}

/**
 * 受击行为
 */
@ccclass('HitBehavior')
export class HitBehavior implements IUnitBehavior {
    type = UnitBehaviorType.HIT;
    interruptible = true;
    duration = 0.2; // 受击硬直时间
    priority = 5;

    private _damage: number = 0;
    private _attacker: any = null;

    constructor(damage: number, attacker?: any) {
        this._damage = damage;
        this._attacker = attacker;
    }

    execute(unit: IUnitController): void {
        this.playHitAnimation(unit);
        this.applyDamage(unit);
    }

    stop(unit: IUnitController): void {
        // 停止受击动画
    }

    update(unit: IUnitController, deltaTime: number): void {
        // 受击行为不需要特殊更新
    }

    private applyDamage(unit: IUnitController): void {
        unit.hp -= this._damage;
        console.log(`[HitBehavior] ${unit.unitName} 受到 ${this._damage} 点伤害，剩余血量: ${unit.hp}`);
        
        if (unit.hp <= 0) {
            // 触发死亡行为
            unit.executeBehavior(new DieBehavior());
        }
    }

    private playHitAnimation(unit: IUnitController): void {
        console.log(`[HitBehavior] ${unit.unitName} 受击动画`);
    }
}

/**
 * 死亡行为
 */
@ccclass('DieBehavior')
export class DieBehavior implements IUnitBehavior {
    type = UnitBehaviorType.DIE;
    interruptible = false;
    duration = 1.0; // 死亡动画时间
    priority = 10; // 最高优先级

    execute(unit: IUnitController): void {
        this.playDieAnimation(unit);
        this.onUnitDie(unit);
    }

    stop(unit: IUnitController): void {
        // 死亡行为不可停止
    }

    update(unit: IUnitController, deltaTime: number): void {
        // 死亡行为不需要特殊更新
    }

    private playDieAnimation(unit: IUnitController): void {
        console.log(`[DieBehavior] ${unit.unitName} 死亡动画`);
    }

    private onUnitDie(unit: IUnitController): void {
        unit.state = 'dead' as any;
        unit.onDie();
        console.log(`[DieBehavior] ${unit.unitName} 已死亡`);
    }
}

/**
 * 眩晕行为
 */
@ccclass('StunBehavior')
export class StunBehavior implements IUnitBehavior {
    type = UnitBehaviorType.STUN;
    interruptible = false;
    duration = 2.0; // 眩晕持续时间
    priority = 8;

    execute(unit: IUnitController): void {
        unit.state = 'stunned' as any;
        this.playStunAnimation(unit);
    }

    stop(unit: IUnitController): void {
        unit.state = 'alive' as any;
    }

    update(unit: IUnitController, deltaTime: number): void {
        // 眩晕期间单位无法行动
    }

    private playStunAnimation(unit: IUnitController): void {
        console.log(`[StunBehavior] ${unit.unitName} 眩晕状态`);
    }
}
