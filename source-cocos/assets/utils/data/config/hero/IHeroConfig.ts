export type HeroRarity = 'common' | 'uncommon' | 'rare' | 'sr' | 'ssr' | 'legendary' | 'mythic';

export type HeroPosition = 'warrior' | 'mage' | 'archer' | 'tank' | 'support' | 'assassin';

export type HeroCamp = 'human' | 'demon' | 'nature';

export type HeroAttr = 'dark' | 'light' | 'water' | 'fire' | 'earth';

export type HeroType = 'hero' | 'monster' | 'pet' | 'role' | 'skill' | 'build' | 'wall' | 'tower';

/**
 * 英雄运行时数据接口 - 只包含玩家游玩过程中产生的数据
 * 这些数据从本地存储加载，首次登录时从JDM配置初始化
 */
export interface IHeroRuntimeData {
    id: number;              // 英雄ID - 必须字段
    level: number;           // 当前等级 - 如果JDM配置中有则使用，否则使用默认值1
    exp: number;             // 当前经验值 - 如果JDM配置中有则使用，否则使用默认值0
    fragment: number;        // 拥有碎片数量 - 如果JDM配置中有则使用，否则使用默认值0
    star: number;            // 当前星级 - 如果JDM配置中有则使用，否则使用默认值1
    deployed: boolean;     // 是否已部署（上阵）- 如果JDM配置中有则使用，否则使用默认值false
    deployPosition?: number; // 部署位置 - 可选字段
    lastUpgradeTime?: number; // 最后升级时间 - 可选字段
    upgradeCount?: number;    // 升级次数 - 可选字段
}

export interface IHeroConfig {
    id: number;
    name: string;
    url: string;
    icon: string;
    type: HeroType;
    skills: number[];
    rarity: HeroRarity;
    position: HeroPosition;
    desc: string;
    attr: string;
    camp: HeroCamp;
    status: string;
    sprite: any;
    can_move: boolean;
    can_skill: boolean;
    can_attack: boolean;
    detect_range: number;
    atk: number;
    atk_range: number;
    cooldown: number;
    hp: number;
    move_speed: number;
    repeat: number;
    quantity: number;
    pierce: number;
    level: number;
    max_level: number;
    star: number;
    max_star: number;
    defense: number;
    hp_recover: number;
    hp_recover_speed: number;
    duration: number;
    frequency: number;
    atk_CR: number;
    atk_CRD: number;
    unlockCondition: any;
    fragment?: number;
    deployed?: boolean;
}

export interface IHeroSpriteConfig {
    main_id: number;
    hero_id: string;
    type: string;
    scale: number[];
    width: number;
    height: number;
    item_width: number;
    item_height: number;
}

export interface IUnitAttrConfig {
    id: number;
    key: string;
    name: HeroAttr;
    color: string;
    icon: string;
}

export interface IUnitCampConfig {
    id: number;
    key: string;
    name: HeroCamp;
}

export interface IUnitPositionConfig {
    id: number;
    key: string;
    name: HeroPosition;
}

export interface IUnitRarityConfig {
    id: number;
    key: string;
    name: HeroRarity;
    abbreviation: string;
    desc: string;
    color: string;
    color_desc: string;
}

export interface IUnitTypeConfig {
    id: number;
    key: string;
    name: HeroType;
    parent_key: string | null;
}

export interface IHeroData {
    heroes: IHeroConfig[];
    heroSprites: IHeroSpriteConfig[];
    unitAttrs: IUnitAttrConfig[];
    unitCamps: IUnitCampConfig[];
    unitPositions: IUnitPositionConfig[];
    unitRarities: IUnitRarityConfig[];
    unitTypes: IUnitTypeConfig[];
}
