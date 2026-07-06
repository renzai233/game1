import { ISkill } from "../../../skill/ISkill";

export type MonsterRarity = 'common' | 'uncommon' | 'rare' | 'super_rare' | 'super_super_rare' | 'legendary' | 'mythic';

export interface IMonster {
    id: number;
    name: string;
    url: string;
    type: string;
    skills: number[];
    rarity: MonsterRarity;
    desc: string | null;
    sprite: any | null;
    camp: string;
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
    dmg_range: number;
    duration: number;
    frequency: number;
    atk_CR: number;
    atk_CRD: number;
}

export interface IMonsterSpriteConfig {
    main_id: number;
    id: number;
    monster_id: string;
    type: string;
    scale: number[];
    width: number;
    height: number;
    item_width: number;
    item_height: number;
}

export interface IMonsterData {
    monsters: IMonster[];
    spriteConfigs: IMonsterSpriteConfig[];
}
