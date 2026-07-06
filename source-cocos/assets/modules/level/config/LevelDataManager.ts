import { Singleton } from "db://assets/utils/common/Singleton";
import { ILevelConfig, ILevelData, IMonsterTypeConfig, ILevelDropConfig, ILevelChestConfig } from "./ILevel";
import { LEVEL_DATA, LevelConfigPath, defaultLevel } from "./LevelConfig";
import { resManager } from "db://assets/utils/data/config/manager/ResourceManager";

export class LevelDataManager extends Singleton {
    private _levelData: ILevelData = LEVEL_DATA;
    private _isInitialized: boolean = false;
    private readonly CONFIG_BUNDLE = 'configs';

    async initialize(): Promise<boolean> {
        if (this._isInitialized) return true;

        try {
            console.log('[LDM] 开始加载关卡配置数据...');

            await this.loadAllConfigs();

            this._isInitialized = true;
            console.log('[LDM] 关卡配置数据初始化完成');
            return true;
        } catch (error) {
            console.error('[LDM] 初始化失败:', error);
            return false;
        }
    }

    private async loadAllConfigs(): Promise<void> {
        const configPromises = [
            this.loadConfig<any[]>(LevelConfigPath.levels),
            this.loadConfig<IMonsterTypeConfig[]>(LevelConfigPath.monsterTypes),
            this.loadConfig<ILevelDropConfig[]>(LevelConfigPath.dropConfigs),
            this.loadConfig<ILevelChestConfig[]>(LevelConfigPath.chestConfigs)
        ];

        const results = await Promise.allSettled(configPromises);

        if (results[0].status === 'fulfilled') {
            const levels = results[0].value as any[];
            if (Array.isArray(levels)) {
                this._levelData.levels = levels.map((level, index) => this.validateLevelConfig(level, index));
                console.log(`[LDM] 关卡配置加载成功，共${this._levelData.levels.length}条`);
            } else {
                console.warn('[LDM] 关卡配置不是数组格式');
                this._levelData.levels = [];
            }
        } else {
            console.warn('[LDM] 关卡配置加载失败:', results[0].reason);
            this._levelData.levels = [];
        }

        if (results[1].status === 'fulfilled') {
            const monsterTypes = results[1].value as IMonsterTypeConfig[];
            if (Array.isArray(monsterTypes)) {
                this._levelData.monsterTypes = monsterTypes;
                console.log(`[LDM] 怪物类型配置加载成功，共${this._levelData.monsterTypes.length}条`);
            } else {
                console.warn('[LDM] 怪物类型配置不是数组格式');
                this._levelData.monsterTypes = [];
            }
        } else {
            console.warn('[LDM] 怪物类型配置加载失败:', results[1].reason);
            this._levelData.monsterTypes = [];
        }

        if (results[2].status === 'fulfilled') {
            const dropConfigs = results[2].value as ILevelDropConfig[];
            if (Array.isArray(dropConfigs)) {
                this._levelData.dropConfigs = dropConfigs;
                console.log(`[LDM] 掉落配置加载成功，共${this._levelData.dropConfigs.length}条`);
            } else {
                console.warn('[LDM] 掉落配置不是数组格式');
                this._levelData.dropConfigs = [];
            }
        } else {
            console.warn('[LDM] 掉落配置加载失败:', results[2].reason);
            this._levelData.dropConfigs = [];
        }

        if (results[3].status === 'fulfilled') {
            const chestConfigs = results[3].value as ILevelChestConfig[];
            if (Array.isArray(chestConfigs)) {
                this._levelData.chestConfigs = chestConfigs;
                console.log(`[LDM] 宝箱配置加载成功，共${this._levelData.chestConfigs.length}条`);
            } else {
                console.warn('[LDM] 宝箱配置不是数组格式');
                this._levelData.chestConfigs = [];
            }
        } else {
            console.warn('[LDM] 宝箱配置加载失败:', results[3].reason);
            this._levelData.chestConfigs = [];
        }
    }

    private async loadConfig<T>(configName: string): Promise<T> {
        try {
            const config = await resManager().loadConfig<T>(
                configName,
                this.CONFIG_BUNDLE
            );
            return this.validateConfig(config, configName);
        } catch (error) {
            console.error(`[LDM] 加载配置${configName}失败:`, error);
            throw error;
        }
    }

    private validateConfig<T>(config: any, configName: string): T {
        if (!config) {
            console.warn(`[LDM] ${configName}配置为空`);
            return [] as any;
        }

        if (configName === LevelConfigPath.monsterTypes) {
            if (!Array.isArray(config)) {
                console.warn(`[LDM] 怪物类型配置应该是一个数组`);
                return [] as any;
            }
            return config.map((monsterType: any) => ({
                id: monsterType.id || 0,
                key: monsterType.key || 'normal',
                name: monsterType.name || '普通怪',
                atk_rate: monsterType.atk_rate || 1,
                hp_rate: monsterType.hp_rate || 1,
                desc: monsterType.desc || ''
            })) as T;
        }

        if (configName === LevelConfigPath.dropConfigs) {
            if (!Array.isArray(config)) {
                console.warn(`[LDM] 掉落配置应该是一个数组`);
                return [] as any;
            }
            return config.map((drop: any) => ({
                level_id: drop.level_id ?? 0,
                item_type: drop.item_type || 'gold',
                min_amount: drop.min_amount || 1,
                max_amount: drop.max_amount || 1,
                item_drop_rate: drop.item_drop_rate || 0,
                rarity: drop.rarity || 'C'
            })) as T;
        }

        return config as T;
    }

    private validateLevelConfig(config: any, index: number): ILevelConfig {
        const defaultConfig = this.getLevelById(0);
        const baseConfig = defaultConfig || defaultLevel;

        return {
            levelId: config.id || 0,
            index: index,
            name: config.name || baseConfig.name,
            description: config.description || baseConfig.description,
            difficulty: this.calculateDifficulty(index),
            recommendedLevel: index + 1,
            maxWave: config.wave || baseConfig.maxWave,
            initialWallHp: 1000 + index * 100,
            timeLimit: 300,
            normalIds: config.normal_ids || baseConfig.normalIds,
            eliteId: config.elite_id ?? baseConfig.eliteId,
            bossId: config.boss_id ?? baseConfig.bossId,
            specialId: config.special_id ?? baseConfig.specialId,
            specialType: config.special_type ?? baseConfig.specialType,
            startNumber: config.start_number ?? baseConfig.startNumber,
            waveNumberAdd: config.wave_number_add ?? baseConfig.waveNumberAdd,
            waveAttrRatio: config.wave_attr_ratio ?? baseConfig.waveAttrRatio,
            monsterGenTime: config.monster_gen_time ?? baseConfig.monsterGenTime,
            intervalTime: config.intervalTime ?? baseConfig.intervalTime
        };
    }

    private calculateDifficulty(index: number): 'easy' | 'normal' | 'hard' | 'expert' | 'nightmare' {
        if (index < 5) return 'easy';
        if (index < 10) return 'normal';
        if (index < 15) return 'hard';
        if (index < 20) return 'expert';
        return 'nightmare';
    }

    getLevelList(): ILevelConfig[] {
        return this._levelData.levels || [];
    }

    getLevelById(levelId: number): ILevelConfig | undefined {
        return this.getLevelList().find(level => level.levelId === levelId);
    }

    getLevelByIndex(index: number): ILevelConfig | undefined {
        return this.getLevelList()[index];
    }

    getLevelByIndexCompatible(index: number): any {
        const level = this.getLevelByIndex(index);
        if (!level) return undefined;

        return {
            index: level.index,
            name: level.name,
            monster: this.convertToMonsterFormat(level),
            wave: level.maxWave,
            monsterGenTime: level.monsterGenTime,
            intervalTime: level.intervalTime,
            reward: this.convertToRewardFormat(level),
            bgColor: level.bgColor || level.bgColors
        };
    }

    private convertToMonsterFormat(level: ILevelConfig): any[] {
        if (!level.normalIds || level.normalIds.length === 0) return [];

        const monsterMap: Map<number, { id: number, number: number[] }> = new Map();

        for (let wave = 1; wave <= level.maxWave; wave++) {
            const isEliteWave = level.eliteId !== null && wave % 5 === 0;
            const isBossWave = level.bossId !== null && wave === level.maxWave;
            const hasSpecialMonster = level.specialId !== null && wave === 6;

            let monsterId = level.normalIds[(wave - 1) % level.normalIds.length];
            let count = level.startNumber + (wave - 1) * level.waveNumberAdd;

            if (isBossWave) {
                monsterId = level.bossId!;
                count = 1;
            } else if (isEliteWave) {
                monsterId = level.eliteId!;
                count = level.startNumber + (wave - 1) * level.waveNumberAdd;
            }

            const existing = monsterMap.get(monsterId);
            if (existing) {
                existing.number.push(count);
            } else {
                monsterMap.set(monsterId, {
                    id: monsterId,
                    number: new Array(level.maxWave).fill(0)
                });
                monsterMap.get(monsterId)!.number[wave - 1] = count;
            }
        }

        return Array.from(monsterMap.values());
    }

    private convertToRewardFormat(level: ILevelConfig): any[] {
        const result = [];

        const dropConfigs = this.getDropConfigsByLevel(level.levelId);
        dropConfigs.forEach(drop => {
            if (drop.item_type === 'gold') {
                result.push({
                    item_id: 0,
                    number: Math.floor((drop.min_amount + drop.max_amount) / 2)
                });
            } else if (drop.item_type === 'gem') {
                result.push({
                    item_id: 3,
                    number: Math.floor((drop.min_amount + drop.max_amount) / 2)
                });
            }
        });

        return result;
    }

    getLevelCount(): number {
        return this.getLevelList().length;
    }

    getMonsterTypeByKey(key: string): IMonsterTypeConfig | undefined {
        return this._levelData.monsterTypes.find(mt => mt.key === key);
    }

    getMonsterTypeById(id: number): IMonsterTypeConfig | undefined {
        return this._levelData.monsterTypes.find(mt => mt.id === id);
    }

    getMonsterTypeList(): IMonsterTypeConfig[] {
        return this._levelData.monsterTypes || [];
    }

    getDropConfigsByLevel(levelId: number): ILevelDropConfig[] {
        const defaultConfigs = this._levelData.dropConfigs.filter(drop => drop.level_id === 0);
        const levelConfigs = this._levelData.dropConfigs.filter(drop => drop.level_id === levelId);

        if (levelConfigs.length > 0) {
            return levelConfigs;
        } else {
            return defaultConfigs;
        }
    }

    getDropConfigsByItemType(levelId: number, itemType: string): ILevelDropConfig[] {
        return this.getDropConfigsByLevel(levelId).filter(drop => drop.item_type === itemType);
    }

    getDropConfigsByRarity(levelId: number, rarity: string): ILevelDropConfig[] {
        return this.getDropConfigsByLevel(levelId).filter(drop => drop.rarity === rarity);
    }

    getDropConfigList(): ILevelDropConfig[] {
        return this._levelData.dropConfigs || [];
    }

    getChestConfigsByLevel(levelId: number): ILevelChestConfig[] {
        const defaultConfigs = this._levelData.chestConfigs.filter(chest => chest.level_id === 0);
        const levelConfigs = this._levelData.chestConfigs.filter(chest => chest.level_id === levelId);

        if (levelConfigs.length > 0) {
            return levelConfigs;
        } else {
            return defaultConfigs;
        }
    }

    getChestConfig(levelId: number, chestType: 'wave1' | 'half' | 'complete'): ILevelChestConfig | undefined {
        const configs = this.getChestConfigsByLevel(levelId);
        return configs.find(chest => chest.chest_type === chestType);
    }

    getChestConfigList(): ILevelChestConfig[] {
        return this._levelData.chestConfigs || [];
    }

    async reloadConfig(configName: string): Promise<void> {
        try {
            if (configName === LevelConfigPath.levels) {
                const config = await this.loadConfig<any[]>(configName);
                this._levelData.levels = config.map((level, index) => this.validateLevelConfig(level, index));
                console.log(`[LDM] 关卡配置重新加载成功`);
            } else if (configName === LevelConfigPath.monsterTypes) {
                const config = await this.loadConfig<IMonsterTypeConfig[]>(configName);
                this._levelData.monsterTypes = config;
                console.log(`[LDM] 怪物类型配置重新加载成功`);
            } else if (configName === LevelConfigPath.dropConfigs) {
                const config = await this.loadConfig<ILevelDropConfig[]>(configName);
                this._levelData.dropConfigs = config;
                console.log(`[LDM] 掉落配置重新加载成功`);
            }
        } catch (error) {
            console.error(`[LDM] 重新加载配置${configName}失败:`, error);
        }
    }

    async reloadAll(): Promise<void> {
        try {
            this._levelData.levels = [];
            this._levelData.monsterTypes = [];
            this._levelData.dropConfigs = [];
            await this.loadAllConfigs();
            console.log(`[LDM] 所有关卡配置重新加载成功`);
        } catch (error) {
            console.error(`[LDM] 重新加载所有关卡配置失败:`, error);
        }
    }
}

export const LDM = LevelDataManager.instance();
