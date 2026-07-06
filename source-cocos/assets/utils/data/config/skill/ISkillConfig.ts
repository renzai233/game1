export type SkillRarity = 'common' | 'base' | 'normal' | 'advanced' | 'ultimate';

export type SkillReleaseType = 'auto' | 'manual' | 'passive';

export type SkillGroup = 'ballistic' | 'range' | 'laser' | 'point' | 'debuff' | 'buff';

export type SkillEffectType = 'damage' | 'heal' | 'control' | 'position';

export interface ISkillConfig {
    id: number;
    name: string;
    url: string;
    type: string;
    skills: number[];
    rarity: SkillRarity;
    desc: string;
    sprite: Record<string, any>;
    camp: string;
    can_move: boolean;
    can_skill: boolean;
    can_attack: boolean;
    can_learn: boolean;
    release_type: SkillReleaseType;
    group: SkillGroup;
    effect_type: SkillEffectType;
    detect_range: number;
    atk: number;
    atk_range: number;
    cooldown: number;
    hp: number;
    move_speed: number;
    repeat: number;
    quantity: number;
    scatterAngle?: number;
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
    width?: number;
    damageSpeed?: number;
    color?: string;
}

export interface ISpriteConfig {
    id: number;
    skill_id: number;
    type: string;
    scale: number[];
    width: number;
    height: number;
    item_width: number;
    item_height: number;
}

export interface ISkillEffectConfig {
    id: number;
    skill_id: number;
    name: string;
    desc: string;
    can_learn: boolean;
    rarity: string;
    repeat: number;
    quantity: number;
    pierce: number;
    atk_rate: number;
    atk: number;
    cooldown: number;
    move_speed: number;
    dmg_range_rate: number;
    dmg_duration: number;
    dmg_frequency: number;
    atk_distance: number;
    hp: number;
    hp_recover: number;
    hp_recover_speed: number;
    detect_range: number;
    defense: number;
    atk_CR: number;
    atk_CRD: number;
    unlock_skill_effect_ids: number[];
}

export interface ISkillData {
    skills: ISkillConfig[];
    skillSprites: ISpriteConfig[];
    skillEffects: ISkillEffectConfig[];
}
