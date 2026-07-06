import { ILevelData, ILevelConfig } from "./ILevel";

export const LevelConfigPath = {
    levels: 'levels/level_base',
    monsterTypes: 'levels/level_monster_type',
    dropConfigs: 'levels/level_drop',
    chestConfigs: 'levels/level_chest'
}

export const LEVEL_DATA: ILevelData = {
    levels: [],
    monsterTypes: [],
    dropConfigs: [],
    chestConfigs: []
}

export const defaultLevel: ILevelConfig = {
    levelId: 0,
    index: 0,
    name: '默认关卡',
    description: '击败所有入侵的怪物，保护城墙',
    difficulty: 'easy',
    recommendedLevel: 1,
    maxWave: 10,
    initialWallHp: 1000,
    timeLimit: 300,
    normalIds: [],
    eliteId: null,
    bossId: null,
    specialId: null,
    specialType: null,
    startNumber: 5,
    waveNumberAdd: 2,
    waveAttrRatio: 0.01,
    monsterGenTime: 0.5,
    intervalTime: 3
}
