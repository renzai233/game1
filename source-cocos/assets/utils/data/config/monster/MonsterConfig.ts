import { IMonster, IMonsterSpriteConfig, IMonsterData } from "./IMonster";

export const MonsterConfigPath = {
    monsters: 'base/unit_monsters',
    monsterSprites: 'base/unit_monster_sprites'
}

export const MONSTER_DATA: IMonsterData = {
    monsters: [],
    spriteConfigs: []
}

export const defaultMonsterSpriteConfig: Record<string, IMonsterSpriteConfig> = {
    walk: {
        main_id: 0,
        id: 0,
        monster_id: 'default',
        type: 'walk',
        scale: [1, 1, 1],
        width: 255,
        height: 64,
        item_width: 64,
        item_height: 64
    },
    die: {
        main_id: 0,
        id: 0,
        monster_id: 'default',
        type: 'die',
        scale: [1, 1, 1],
        width: 319,
        height: 64,
        item_width: 64,
        item_height: 64
    },
    attack: {
        main_id: 0,
        id: 0,
        monster_id: 'default',
        type: 'attack',
        scale: [1, 1, 1],
        width: 255,
        height: 64,
        item_width: 64,
        item_height: 64
    }
}
