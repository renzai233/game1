import { _decorator, Component, Node, Vec3 } from 'cc';
import { IUnitController, UnitBehaviorType, UnitAbility } from './UnitBehavior';
import { IdleBehavior, MoveBehavior, AttackBehavior, SkillBehavior } from './behaviors/UnitBehaviors';
import { gameBus } from 'db://assets/utils/signal/GameBus';

const { ccclass } = _decorator;

/**
 * AI策略类型
 */
export enum AIStrategy {
    PASSIVE = 'passive',     // 被动：只反击
    AGGRESSIVE = 'aggressive', // 主动：主动攻击
    DEFENSIVE = 'defensive', // 防御：优先保护
    SUPPORT = 'support',     // 支援：优先支援队友
    BERSERK = 'berserk',     // 狂暴：无差别攻击
}

/**
 * 目标优先级
 */
export enum TargetPriority {
    NEAREST = 'nearest',     // 最近目标
    WEAKEST = 'weakest',     // 最弱目标
    STRONGEST = 'strongest', // 最强目标
    RANDOM = 'random',       // 随机目标
    LOW_HP = 'low_hp',      // 低血量目标
    HIGH_HP = 'high_hp',    // 高血量目标
}

/**
 * 单位AI配置
 */
export interface IUnitAIConfig {
    strategy: AIStrategy;
    targetPriority: TargetPriority;
    detectionRange: number;
    attackRange: number;
    skillRange: number;
    skillCooldown: number;
    moveSpeed: number;
    canUseSkills: boolean;
    skillIds: number[];
    reactionTime: number; // 反应时间
    memoryTime: number;   // 记忆时间
}

/**
 * 单位AI系统
 * 负责单位的智能行为决策
 */
@ccclass('UnitAI')
export class UnitAI extends Component {
    private _unit: IUnitController;
    private _config: IUnitAIConfig;
    private _targets: Map<string, any> = new Map();
    private _currentTarget: any = null;
    private _lastTargetTime: number = 0;
    private _lastSkillTime: number = 0;
    private _isActive: boolean = true;
    private _reactionTimer: number = 0;

    /**
     * 初始化AI系统
     * @param unit 单位控制器
     * @param config AI配置
     */
    init(unit: IUnitController, config: IUnitAIConfig): void {
        this._unit = unit;
        this._config = config;
        this._targets.clear();
        this._currentTarget = null;
        this._lastTargetTime = 0;
        this._lastSkillTime = 0;
        this._isActive = true;
        this._reactionTimer = 0;
    }

    /**
     * 更新AI系统
     * @param deltaTime 帧时间
     */
    update(deltaTime: number): void {
        if (!this._isActive || !this._unit) return;

        this._reactionTimer += deltaTime;
        if (this._reactionTimer < this._config.reactionTime) return;

        // 更新目标列表
        this.updateTargets();

        // 选择目标
        this.selectTarget();

        // 执行AI策略
        this.executeStrategy(deltaTime);

        // 清理过期目标
        this.cleanupTargets();
    }

    /**
     * 更新目标列表
     */
    private updateTargets(): void {
        if (!this._unit.target) return;

        const parent = this._unit.target.parent;
        if (!parent) return;

        // 查找范围内的敌方单位
        const enemies = parent.children.filter(node => {
            if (node === this._unit.target) return false;
            if (!node.activeInHierarchy) return false;

            // 检查是否是敌方单位
            const unit = this.getUnitFromNode(node);
            if (!unit || unit.camp === this._unit.camp) return false;

            // 检查距离
            const distance = Vec3.distance(this._unit.target.position, node.position);
            return distance <= this._config.detectionRange;
        });

        // 更新目标信息
        enemies.forEach(node => {
            const unit = this.getUnitFromNode(node);
            if (unit) {
                this._targets.set(node.uuid, {
                    node: node,
                    unit: unit,
                    distance: Vec3.distance(this._unit.target.position, node.position),
                    lastSeen: Date.now(),
                    hp: unit.hp,
                    maxHp: unit.maxHp
                });
            }
        });
    }

    /**
     * 选择目标
     */
    private selectTarget(): void {
        if (this._targets.size === 0) {
            this._currentTarget = null;
            return;
        }

        const targets = Array.from(this._targets.values());
        let selectedTarget = null;

        switch (this._config.targetPriority) {
            case TargetPriority.NEAREST:
                selectedTarget = this.selectNearestTarget(targets);
                break;
            case TargetPriority.WEAKEST:
                selectedTarget = this.selectWeakestTarget(targets);
                break;
            case TargetPriority.STRONGEST:
                selectedTarget = this.selectStrongestTarget(targets);
                break;
            case TargetPriority.LOW_HP:
                selectedTarget = this.selectLowHpTarget(targets);
                break;
            case TargetPriority.HIGH_HP:
                selectedTarget = this.selectHighHpTarget(targets);
                break;
            case TargetPriority.RANDOM:
                selectedTarget = this.selectRandomTarget(targets);
                break;
        }

        if (selectedTarget && selectedTarget !== this._currentTarget) {
            this._currentTarget = selectedTarget;
            this._lastTargetTime = Date.now();
            this._unit.setTarget(selectedTarget.node);
        }
    }

    /**
     * 选择最近目标
     */
    private selectNearestTarget(targets: any[]): any {
        return targets.reduce((nearest, current) => {
            return current.distance < nearest.distance ? current : nearest;
        });
    }

    /**
     * 选择最弱目标
     */
    private selectWeakestTarget(targets: any[]): any {
        return targets.reduce((weakest, current) => {
            return current.unit.atk < weakest.unit.atk ? current : weakest;
        });
    }

    /**
     * 选择最强目标
     */
    private selectStrongestTarget(targets: any[]): any {
        return targets.reduce((strongest, current) => {
            return current.unit.atk > strongest.unit.atk ? current : strongest;
        });
    }

    /**
     * 选择低血量目标
     */
    private selectLowHpTarget(targets: any[]): any {
        return targets.reduce((lowest, current) => {
            const currentHpPercent = current.unit.hp / current.unit.maxHp;
            const lowestHpPercent = lowest.unit.hp / lowest.unit.maxHp;
            return currentHpPercent < lowestHpPercent ? current : lowest;
        });
    }

    /**
     * 选择高血量目标
     */
    private selectHighHpTarget(targets: any[]): any {
        return targets.reduce((highest, current) => {
            const currentHpPercent = current.unit.hp / current.unit.maxHp;
            const highestHpPercent = highest.unit.hp / highest.unit.maxHp;
            return currentHpPercent > highestHpPercent ? current : highest;
        });
    }

    /**
     * 选择随机目标
     */
    private selectRandomTarget(targets: any[]): any {
        const index = Math.floor(Math.random() * targets.length);
        return targets[index];
    }

    /**
     * 执行AI策略
     * @param deltaTime 帧时间
     */
    private executeStrategy(deltaTime: number): void {
        if (!this._currentTarget) {
            this.executeIdleBehavior();
            return;
        }

        const distance = this._currentTarget.distance;
        const canAttack = distance <= this._config.attackRange;
        const canUseSkill = distance <= this._config.skillRange && 
                           this.canUseSkill() && 
                           this._config.canUseSkills;

        switch (this._config.strategy) {
            case AIStrategy.PASSIVE:
                this.executePassiveStrategy(canAttack, canUseSkill);
                break;
            case AIStrategy.AGGRESSIVE:
                this.executeAggressiveStrategy(canAttack, canUseSkill);
                break;
            case AIStrategy.DEFENSIVE:
                this.executeDefensiveStrategy(canAttack, canUseSkill);
                break;
            case AIStrategy.SUPPORT:
                this.executeSupportStrategy(canAttack, canUseSkill);
                break;
            case AIStrategy.BERSERK:
                this.executeBerserkStrategy(canAttack, canUseSkill);
                break;
        }
    }

    /**
     * 执行被动策略
     */
    private executePassiveStrategy(canAttack: boolean, canUseSkill: boolean): void {
        if (canAttack) {
            this.executeAttackBehavior();
        } else {
            this.executeIdleBehavior();
        }
    }

    /**
     * 执行主动策略
     */
    private executeAggressiveStrategy(canAttack: boolean, canUseSkill: boolean): void {
        if (canAttack) {
            if (canUseSkill && Math.random() < 0.3) { // 30%概率使用技能
                this.executeSkillBehavior();
            } else {
                this.executeAttackBehavior();
            }
        } else {
            this.executeMoveBehavior();
        }
    }

    /**
     * 执行防御策略
     */
    private executeDefensiveStrategy(canAttack: boolean, canUseSkill: boolean): void {
        if (canAttack) {
            this.executeAttackBehavior();
        } else if (this._unit.hp < this._unit.maxHp * 0.5) { // 血量低于50%时移动
            this.executeMoveBehavior();
        } else {
            this.executeIdleBehavior();
        }
    }

    /**
     * 执行支援策略
     */
    private executeSupportStrategy(canAttack: boolean, canUseSkill: boolean): void {
        if (canUseSkill) {
            this.executeSkillBehavior();
        } else if (canAttack) {
            this.executeAttackBehavior();
        } else {
            this.executeMoveBehavior();
        }
    }

    /**
     * 执行狂暴策略
     */
    private executeBerserkStrategy(canAttack: boolean, canUseSkill: boolean): void {
        if (canUseSkill) {
            this.executeSkillBehavior();
        } else if (canAttack) {
            this.executeAttackBehavior();
        } else {
            this.executeMoveBehavior();
        }
    }

    /**
     * 执行待机行为
     */
    private executeIdleBehavior(): void {
        this._unit.executeBehavior(new IdleBehavior());
    }

    /**
     * 执行移动行为
     */
    private executeMoveBehavior(): void {
        if (!this._currentTarget) return;
        this._unit.executeBehavior(new MoveBehavior(this._currentTarget.node.position, this._config.moveSpeed));
    }

    /**
     * 执行攻击行为
     */
    private executeAttackBehavior(): void {
        this._unit.executeBehavior(new AttackBehavior());
    }

    /**
     * 执行技能行为
     */
    private executeSkillBehavior(): void {
        if (this._config.skillIds.length > 0) {
            const skillId = this._config.skillIds[Math.floor(Math.random() * this._config.skillIds.length)];
            this._unit.executeBehavior(new SkillBehavior(skillId));
            this._lastSkillTime = Date.now();
        }
    }

    /**
     * 检查是否可以使用技能
     */
    private canUseSkill(): boolean {
        return Date.now() - this._lastSkillTime >= this._config.skillCooldown * 1000;
    }

    /**
     * 从节点获取单位控制器
     */
    private getUnitFromNode(node: Node): IUnitController | null {
        const controllerTypes = ['UnitController', 'HeroController', 'MonsterController', 'DemonController'];
        for (const type of controllerTypes) {
            const component = node.getComponent(type);
            if (component) return component as any;
        }
        return null;
    }

    /**
     * 清理过期目标
     */
    private cleanupTargets(): void {
        const now = Date.now();
        for (const [uuid, target] of this._targets) {
            if (now - target.lastSeen > this._config.memoryTime * 1000) {
                this._targets.delete(uuid);
                if (this._currentTarget === target) {
                    this._currentTarget = null;
                }
            }
        }
    }

    /**
     * 设置AI配置
     * @param config AI配置
     */
    setConfig(config: IUnitAIConfig): void {
        this._config = config;
    }

    /**
     * 激活/停用AI
     * @param active 是否激活
     */
    setActive(active: boolean): void {
        this._isActive = active;
    }

    /**
     * 获取当前目标
     */
    getCurrentTarget(): any {
        return this._currentTarget;
    }

    /**
     * 获取目标列表
     */
    getTargets(): Map<string, any> {
        return new Map(this._targets);
    }

    /**
     * 强制选择目标
     * @param target 目标
     */
    forceSelectTarget(target: any): void {
        this._currentTarget = target;
        this._unit.setTarget(target.node);
    }

    /**
     * 清除当前目标
     */
    clearTarget(): void {
        this._currentTarget = null;
        this._unit.clearTarget();
    }

    /**
     * 销毁AI系统
     */
    onDestroy(): void {
        this._targets.clear();
        this._currentTarget = null;
        this._unit = null;
    }
}
