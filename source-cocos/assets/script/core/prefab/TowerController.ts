// import { _decorator } from 'cc';
// import { UnitController } from './UnitController';
// import { IUnit } from '../IUnit';
// import { UnitBehaviorType, UnitAbility, UnitState } from '../UnitBehavior';
// import { AttackBehavior, SkillBehavior } from '../behaviors/UnitBehaviors';
// import { AIStrategy, TargetPriority } from '../UnitAI';

// const { ccclass } = _decorator;

// /**
//  * 防御塔控制器
//  * 继承自UnitController，实现防御塔特有的行为
//  */
// @ccclass('TowerController')
// export class TowerController extends UnitController {
    
//     /**
//      * 初始化防御塔
//      */
//     async init(data: IUnit, isStand: boolean = false): Promise<void> {
//         // 防御塔不能移动，可以攻击和释放技能
//         data.can_move = false;
//         data.can_attack = true;
//         data.can_skill = true;
        
//         await super.init(data, isStand);
        
//         // 设置防御塔特有的能力
//         this.setupTowerAbilities();
        
//         console.log(`[TowerController] 防御塔 ${this.unitName} 初始化完成`);
//     }

//     /**
//      * 设置防御塔特有能力
//      */
//     private setupTowerAbilities(): void {
//         // 防御塔可以攻击和释放技能
//         this.abilities.add(UnitAbility.ATTACK);
//         this.abilities.add(UnitAbility.SKILL);
        
//         // 防御塔可以被攻击
//         this.abilities.add(UnitAbility.DAMAGE);
//         this.abilities.add(UnitAbility.COLLISION);
        
//         // 防御塔不能移动
//         this.abilities.delete(UnitAbility.MOVE);
//     }

//     /**
//      * 获取AI策略（防御塔使用防御策略）
//      */
//     protected getAIStrategy(): AIStrategy {
//         return AIStrategy.DEFENSIVE;
//     }

//     /**
//      * 获取目标优先级（防御塔优先攻击最近目标）
//      */
//     protected getTargetPriority(): TargetPriority {
//         return TargetPriority.NEAREST;
//     }

//     /**
//      * 防御塔是否在攻击
//      */
//     isAttacking(): boolean {
//         return this._behaviorManager?.hasBehavior(UnitBehaviorType.ATTACK) || false;
//     }

//     /**
//      * 防御塔是否在释放技能
//      */
//     isCastingSkill(): boolean {
//         return this._behaviorManager?.hasBehavior(UnitBehaviorType.SKILL) || false;
//     }
// }
