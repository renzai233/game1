import { _decorator } from 'cc';
import { saveData } from './DataManager';
import { STORAGE_KEYS } from '../../../signal/ISignal';
import { Singleton } from '../../../common/Singleton';
const { ccclass } = _decorator;

export interface IGameData {
    heroes: any[]; // 本局可上阵英雄数组 （最多5个）[{id, ...}]
    heroOnField: any[]; // 当前上阵英雄id列表（最多5个）[{id, ...}]    .
    heroSkills: any[]; // 每个英雄的技能卡组 [{ heroId, skills: [Skills] }]
    heroSkillGroupUpgrade: any; // 每个英雄每组技能升级次数 { [heroId]: { [groupId]: number } }
    heroSkillGroupAttrs: any; // 每个英雄每组技能的属性 { [heroId]: { [groupId]: { atk, cooldown, range, ... } } }
    gameLevel: number; // 游戏等级
    exp: number; // 经验值，经验满后升级
    lvExpMultiple: number; // 每级经验倍数
    allNumbers: number; // 敌人总数
    killNumbers: number; // 消灭敌人数量
    hp: number; // 本局游戏城墙HP
    maxHp: number; // 本局游戏城墙最大HP
    pause: boolean; // 是否暂停游戏
    speedScale: number; // 全局速度系数，默认为1
    damageScale: number; // 全局伤害加成系数，默认为1
    heroMaxLevel: number; // 英雄最大等级
    heroUseMaxLevel: boolean; // 英雄是否使用最大等级
}

// 游戏数据
export let GameData: IGameData = {
    heroes: [], // 本局可上阵英雄数组 （最多5个）[{id, ...}]
    heroOnField: [], // 当前上阵英雄id列表（最多5个）[{id, ...}]    .
    heroSkills: [], // 每个英雄的技能卡组 [{ heroId, skills: [Skills] }]
    heroSkillGroupUpgrade: {}, // 每个英雄每组技能升级次数 { [heroId]: { [groupId]: number } }
    heroSkillGroupAttrs: {}, // 每个英雄每组技能的属性 { [heroId]: { [groupId]: { atk, cooldown, range, ... } } }
    gameLevel: 1, // 游戏等级
    exp: 0, // 经验值，经验满后升级
    lvExpMultiple: 2, // 每级经验倍数
    allNumbers: 0, // 敌人总数
    killNumbers: 0, // 消灭敌人数量
    hp: 1000, // 本局游戏城墙HP
    maxHp: 1000, // 本局游戏城墙最大HP
    pause: false, // 是否暂停游戏
    speedScale: 1, // 全局速度系数，默认为1
    damageScale: 1, // 全局伤害加成系数，默认为1
    heroMaxLevel: 10, // 英雄最大等级
    heroUseMaxLevel: true, // 英雄是否使用最大等级
}

// 重置游戏数据
export const resetGameData = () => {
    GameData = {
        heroes: [], // 本局可上阵英雄数组
        heroOnField: [], // 当前上阵英雄id列表（最多5个）
        heroSkills: [], // 每个英雄的技能卡组 [{ heroId, skills: [Skills] }]
        heroSkillGroupUpgrade: {}, // 新增：每个英雄每组技能升级次数
        heroSkillGroupAttrs: {}, // 新增：每个英雄每组技能的属性
        gameLevel: 1, // 游戏等级
        exp: 0, // 经验值，经验满后升级
        lvExpMultiple: 2, // 每级经验倍数
        allNumbers: 0, // 敌人总数
        killNumbers: 0, // 消灭敌人数量
        hp: 1000, // 本局游戏城墙HP
        maxHp: 1000, // 本局游戏城墙最大HP
        pause: false, // 是否暂停游戏
        speedScale: 1, // 全局速度系数，默认为1
        damageScale: 1, // 全局伤害加成系数，默认为1
        heroMaxLevel: 10, // 英雄最大等级
        heroUseMaxLevel: true, // 英雄是否使用最大等级
    }
}

/**
 * 全局速度缩放工具方法
 * @param value 原始速度/时间/频率等
 * @returns 按当前全局速度系数缩放后的值
 */
export function applySpeedScale(value: number): number {
    return value * GameData.speedScale;
}
// 游戏数据接口
interface IGameSettings {
    version: string;
    language: string;
    musicVolume: number;
    sfxVolume: number;
}

interface IHeroData {
    id: number;
    name: string;
    level: number;
    hp: number;
    attack: number;
    skills: number[];
}

interface ILevelData {
    id: number;
    name: string;
    difficulty: number;
    enemyCount: number;
    reward: number;
}

@ccclass('GameDataManager')
export class GameDataManager extends Singleton {
    private static _instance: GameDataManager;

    private _gameSettings: IGameSettings | null = null;
    private _heroes: Map<number, IHeroData> = new Map();
    private _levels: Map<number, ILevelData> = new Map();
    private _playerData: any = null;

    static getInstance(): GameDataManager {
        if (!this._instance) {
            this._instance = new GameDataManager();
        }
        return this._instance;
    }

    // 初始化游戏设置
    initGameSettings(settings: any): void {
        this._gameSettings = {
            version: settings.version || '1.0.0',
            language: settings.language || 'zh',
            musicVolume: settings.musicVolume || 0.7,
            sfxVolume: settings.sfxVolume || 0.8
        };
        console.log('[GameDataManager] 游戏设置加载完成');
    }

    // 初始化英雄数据
    initHeroes(heroesData: any[]): void {
        this._heroes.clear();
        heroesData.forEach(hero => {
            this._heroes.set(hero.id, {
                id: hero.id,
                name: hero.name,
                level: hero.level || 1,
                hp: hero.hp,
                attack: hero.attack,
                skills: hero.skills || []
            });
        });
        console.log(`[GameDataManager] 英雄数据加载完成，共 ${this._heroes.size} 个英雄`);
    }

    // 初始化关卡数据
    initLevels(levelsData: any[]): void {
        this._levels.clear();
        levelsData.forEach(level => {
            this._levels.set(level.id, {
                id: level.id,
                name: level.name,
                difficulty: level.difficulty,
                enemyCount: level.enemyCount,
                reward: level.reward
            });
        });
        console.log(`[GameDataManager] 关卡数据加载完成，共 ${this._levels.size} 个关卡`);
    }

    // 初始化玩家数据
    initPlayerData(playerData: any): void {
        this._playerData = playerData;
        console.log('[GameDataManager] 玩家数据加载完成');
    }

    // 获取方法
    getGameSettings(): IGameSettings | null {
        return this._gameSettings;
    }

    getHero(id: number): IHeroData | undefined {
        return this._heroes.get(id);
    }

    getAllHeroes(): IHeroData[] {
        return Array.from(this._heroes.values());
    }

    getLevel(id: number): ILevelData | undefined {
        return this._levels.get(id);
    }

    getAllLevels(): ILevelData[] {
        return Array.from(this._levels.values());
    }

    getPlayerData(): any {
        return this._playerData;
    }

    // 更新玩家数据
    updatePlayerData(updates: Partial<any>): void {
        if (this._playerData) {
            this._playerData = { ...this._playerData, ...updates };
            // 这里可以添加保存到本地存储的逻辑
            saveData(STORAGE_KEYS.PLAYER_DATA, JSON.stringify(this._playerData));
        }
    }

    // 清空所有数据（用于调试）
    clearAllData(): void {
        this._gameSettings = null;
        this._heroes.clear();
        this._levels.clear();
        this._playerData = null;
        console.log('[GameDataManager] 所有数据已清空');
    }
}

// 便捷访问函数
export function gameDataManager(): GameDataManager {
    return GameDataManager.getInstance();
}

export const GDM = GameDataManager.instance()