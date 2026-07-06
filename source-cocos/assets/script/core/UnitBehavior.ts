/**
 * 单位行为接口和枚举定义
 */

// 单位行为类型枚举
export enum UnitBehaviorType {
    IDLE = 'idle',           // 待机
    MOVE = 'move',           // 移动
    ATTACK = 'attack',       // 攻击
    SKILL = 'skill',         // 技能
    DIE = 'die',             // 死亡
    HIT = 'hit',             // 受击
    STUN = 'stun',           // 眩晕
    FREEZE = 'freeze',       // 冰冻
    BURN = 'burn',           // 燃烧
    POISON = 'poison',       // 中毒
}

// 单位状态枚举
export enum UnitState {
    ALIVE = 'alive',         // 存活
    DEAD = 'dead',           // 死亡
    STUNNED = 'stunned',     // 眩晕
    FROZEN = 'frozen',       // 冰冻
    BURNING = 'burning',     // 燃烧
    POISONED = 'poisoned',   // 中毒
    INVINCIBLE = 'invincible', // 无敌
}

// 单位类型枚举
export enum UnitType {
    HERO = 'hero',           // 英雄
    MONSTER = 'monster',     // 普通怪物
    ELITE_MONSTER = 'elite_monster', // 精英怪物
    BOSS = 'boss',           // BOSS
    TOWER = 'tower',         // 防御塔
    WALL = 'wall',           // 城墙
    SKILL = 'skill',         // 技能
    PET = 'pet',             // 宠物
    DEMON = 'demon',         // 恶魔
}

// 单位能力枚举
export enum UnitAbility {
    MOVE = 'move',           // 移动能力
    ATTACK = 'attack',       // 攻击能力
    SKILL = 'skill',         // 技能能力
    TARGET = 'target',       // 可被锁定
    DAMAGE = 'damage',       // 可受伤害
    COLLISION = 'collision', // 碰撞检测
    AI = 'ai',               // AI控制
}

// 单位行为接口
export interface IUnitBehavior {
    /** 行为类型 */
    type: UnitBehaviorType;
    /** 是否可中断 */
    interruptible: boolean;
    /** 行为持续时间 */
    duration: number;
    /** 行为优先级 */
    priority: number;
    /** 执行行为 */
    execute(unit: IUnitController): void;
    /** 停止行为 */
    stop(unit: IUnitController): void;
    /** 更新行为 */
    update(unit: IUnitController, deltaTime: number): void;
}

// 单位控制器接口
export interface IUnitController {
    /** 单位ID */
    id: number;
    /** 单位名称 */
    unitName: string;
    /** 单位类型 */
    type: string;
    /** 单位阵营 */
    camp: string;
    /** 当前血量 */
    hp: number;
    /** 最大血量 */
    maxHp: number;
    /** 攻击力 */
    atk: number;
    /** 攻击范围 */
    attackRange: number;
    /** 攻击速度 */
    attackSpeed: number;
    /** 移动速度 */
    moveSpeed: number;
    /** 检测范围 */
    detectRange: number;
    /** 是否可移动 */
    canMove: boolean;
    /** 是否可攻击 */
    canAttack: boolean;
    /** 是否可释放技能 */
    canSkill: boolean;
    /** 当前目标 */
    target: any;
    /** 当前状态 */
    state: UnitState;
    /** 单位能力列表 */
    abilities: Set<UnitAbility>;
    /** 当前行为 */
    currentBehavior: IUnitBehavior | null;
    /** 行为队列 */
    behaviorQueue: IUnitBehavior[];
    
    /** 初始化单位 */
    init(data: any): Promise<void>;
    /** 更新单位 */
    update(deltaTime: number): void;
    /** 设置目标 */
    setTarget(target: any): void;
    /** 清除目标 */
    clearTarget(): void;
    /** 执行行为 */
    executeBehavior(behavior: IUnitBehavior): void;
    /** 停止当前行为 */
    stopCurrentBehavior(): void;
    /** 添加行为到队列 */
    addBehavior(behavior: IUnitBehavior): void;
    /** 受到攻击 */
    takeDamage(damage: number, attacker?: any): void;
    /** 死亡处理 */
    onDie(): void;
    /** 销毁单位 */
    destroy(): void;
}

// 单位配置接口
export interface IUnitConfig {
    /** 基础属性 */
    base: {
        hp: number;
        atk: number;
        defense: number;
        moveSpeed: number;
        attackSpeed: number;
        attackRange: number;
        detectRange: number;
    };
    /** 能力配置 */
    abilities: UnitAbility[];
    /** 行为配置 */
    behaviors: {
        [key in UnitBehaviorType]?: {
            enabled: boolean;
            priority: number;
            duration?: number;
            interruptible?: boolean;
        };
    };
    /** 技能配置 */
    skills: {
        enabled: boolean;
        skillIds: number[];
        cooldown: number;
    };
    /** AI配置 */
    ai: {
        enabled: boolean;
        targetPriority: string[];
        behaviorStrategy: string;
    };
}

// 单位事件类型
export enum UnitEventType {
    INIT = 'unit_init',
    DIE = 'unit_die',
    DAMAGE = 'unit_damage',
    HEAL = 'unit_heal',
    TARGET_CHANGE = 'unit_target_change',
    BEHAVIOR_CHANGE = 'unit_behavior_change',
    STATE_CHANGE = 'unit_state_change',
    SKILL_CAST = 'unit_skill_cast',
    ATTACK = 'unit_attack',
    MOVE = 'unit_move',
}

// 单位事件数据接口
export interface IUnitEventData {
    unit: IUnitController;
    type: UnitEventType;
    data?: any;
    timestamp: number;
}
