import { IHeroAttr } from "db://assets/utils/data/dict/base/UnitAttrList";

export interface IHeroRes {
    id: number;
    level: number;
    star: number;
    exp: number;
    fragment: number;
    status?: 'locked' | 'unlocked' | 'deployed';
    hp: number;
    atk: number;
    defense: number;
    move_speed: number;
    cooldown: number;
}

export interface IHero {
    id: string;
    name: string;
    url?: string;
    icon?: string;
    image?: string;
    type: string;
    skills?: (number | string)[];
    rarity: string;
    desc?: string;
    spriteConfig?: any;
    camp: string;
    // 元素/属性，用于筛选标签：可使用如 'FIRE' | 'ICE' | 'EARTH' | 'DARK' | 'LIGHT'
    attr?: IHeroAttr;

    // 行为与战斗参数
    can_move: boolean;
    can_attack: boolean;
    can_skill: boolean;
    detect_range: number;
    atk: number;
    atk_range: number;
    cooldown: number;
    hp: number;
    move_speed: number;
    repeat: number;
    quantity: number;
    pierce: number;
    defense?: number;
    hp_recover: number;
    hp_recover_speed: number;
    dmg_range: number;
    duration: number;
    frequency: number;
    atk_CR: number;
    atk_CRD: number;

    // 养成进度（可选，面板会用到）
    level: number;
    max_level: number;
    star: number;
    max_star: number;
    exp?: number;
    maxExp?: number;
    fragmentCount?: number;
    maxFragmentCount?: number;

    // 状态与编队（可选）
    status?: 'locked' | 'unlocked' | 'deployed';
    isDeployed?: boolean;
    deployPosition?: number;

    hero_res?: IHeroRes;

    // 其他
    story?: string;
    upgradeCost?: { coin: number; fragments: number };
    starUpCost?: { coin: number; fragments: number };
    unlockCondition: any;
}