import { IHeroData, IHeroConfig, IHeroSpriteConfig, IUnitAttrConfig, IUnitCampConfig, IUnitPositionConfig, IUnitRarityConfig, IUnitTypeConfig, IHeroRuntimeData } from "./IHeroConfig";

// 默认运行时数据配置
export const DEFAULT_HERO_DATA: Partial<IHeroRuntimeData> = {
    level: 1,
    exp: 0,
    fragment: 0,
    star: 1,
    deployed: false
};

export const HeroConfigPath = {
    heroes: 'base/unit_heroes',
    heroSprites: 'base/unit_hero_sprites',
    unitAttrs: 'base/unit_attr',
    unitCamps: 'base/unit_camp',
    unitPositions: 'base/unit_posi',
    unitRarities: 'base/unit_rarity',
    unitTypes: 'base/unit_type'
}

export const HERO_DATA: IHeroData = {
    heroes: [],
    heroSprites: [],
    unitAttrs: [],
    unitCamps: [],
    unitPositions: [],
    unitRarities: [],
    unitTypes: []
}

export const defaultHeroSpriteConfig: Record<string, IHeroSpriteConfig> = {
    idle: {
        main_id: 0,
        hero_id: 'default',
        type: 'idle',
        scale: [1, 1, 1],
        width: 363,
        height: 64,
        item_width: 64,
        item_height: 64
    },
    skill: {
        main_id: 0,
        hero_id: 'default',
        type: 'skill',
        scale: [1, 1, 1],
        width: 363,
        height: 64,
        item_width: 64,
        item_height: 64
    }
}
