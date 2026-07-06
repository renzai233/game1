export type LevelDifficulty = 'easy' | 'normal' | 'hard' | 'expert' | 'nightmare';

export interface ILevelBaseConfig {
    id: number;
    name: string;
    wave: number;
    normal_ids: number[] | null;
    elite_id: number | null;
    boss_id: number | null;
    special_id: number | null;
    special_type: string | null;
    start_number: number;
    wave_number_add: number;
    wave_attr_ratio: number | null;
    monster_gen_time: number;
    intervalTime: number;
}

export interface IMonsterTypeConfig {
    id: number;
    key: string;
    name: string;
    atk_rate: number;
    hp_rate: number;
    desc: string;
}

export interface ILevelDropConfig {
    level_id: number;
    item_type: string;
    min_amount: number;
    max_amount: number;
    item_drop_rate: number;
    rarity: string;
}

export enum MonsterRarity {
    NORMAL = 'normal',
    ELITE = 'elite',
    BOSS = 'boss',
    SPECIAL = 'special'
}

export interface IMonsterSpawnData {
    monsterId: number;
    position: { x: number; y: number };
    rarity: MonsterRarity;
    atkMultiplier: number;
    hpMultiplier: number;
    dropMultiplier: number;
    skillReward?: number;
    specialDrop?: {
        type: string;
        amount: number;
    };
}

export interface IWaveConfig {
    waveNumber: number;
    monsters: IMonsterSpawnData[];
    isEliteWave: boolean;
    isBossWave: boolean;
    hasSpecialMonster: boolean;
}

export interface ILevelRuntimeData {
    levelId: number;
    currentWave: number;
    monstersRemaining: number;
    monstersSpawned: number;
    monstersKilled: number;
    timeElapsed: number;
    wallHp: number;
    wallMaxHp: number;
    stars: number;
}

export interface ILevelProgress {
    levelId: number;
    currentWave: number;
    maxWave: number;
    wave1ChestClaimed: boolean;
    halfChestClaimed: boolean;
    completeChestClaimed: boolean;
}

export interface ILevelConfig {
    levelId: number;
    index: number;
    name: string;
    description: string;
    difficulty: LevelDifficulty;
    recommendedLevel: number;
    maxWave: number;
    initialWallHp: number;
    timeLimit: number;
    normalIds: number[];
    eliteId: number | null;
    bossId: number | null;
    specialId: number | null;
    specialType: string | null;
    startNumber: number;
    waveNumberAdd: number;
    waveAttrRatio: number;
    monsterGenTime: number;
    intervalTime: number;
    bgColor?: string | string[];
    bgColors?: string | string[];
}

export interface IChestReward {
    item_type: string;
    amount: number;
    rarity?: string;
}

export interface ILevelChestConfig {
    level_id: number;
    chest_type: 'wave1' | 'half' | 'complete';
    chest_name: string;
    description: string;
    rewards: IChestReward[];
}

export interface ILevelData {
    levels: ILevelConfig[];
    monsterTypes: IMonsterTypeConfig[];
    dropConfigs: ILevelDropConfig[];
    chestConfigs: ILevelChestConfig[];
}
