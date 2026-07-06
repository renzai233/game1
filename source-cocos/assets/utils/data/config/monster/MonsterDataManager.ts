import { Singleton } from "../../../common/Singleton";
import { resManager } from "../manager/ResourceManager";
import { IMonster, IMonsterData, IMonsterSpriteConfig, MonsterRarity } from "./IMonster";
import { MONSTER_DATA, MonsterConfigPath, defaultMonsterSpriteConfig } from "./MonsterConfig";
import { SpriteFrame } from "cc";
import { loadResSingleAsset, createStripFrames } from "../../../utils";

export class MonsterDataManager extends Singleton {
    private _monsterData: IMonsterData = MONSTER_DATA;
    private _isInitialized: boolean = false;
    private readonly CONFIG_BUNDLE = 'configs';

    async initialize(): Promise<boolean> {
        if (this._isInitialized) return true;

        try {
            console.log('[MonsterDataManager] 开始加载怪物配置数据...');

            await this.loadAllConfigs();

            this._isInitialized = true;
            console.log('[MonsterDataManager] 怪物配置数据初始化完成');
            return true;
        } catch (error) {
            console.error('[MonsterDataManager] 初始化失败:', error);
            return false;
        }
    }

    private async loadAllConfigs(): Promise<void> {
        const configPromises = [
            this.loadConfig<IMonster[]>(MonsterConfigPath.monsters),
            this.loadConfig<IMonsterSpriteConfig[]>(MonsterConfigPath.monsterSprites)
        ];

        const results = await Promise.allSettled(configPromises);

        if (results[0].status === 'fulfilled') {
            this._monsterData.monsters = results[0].value as IMonster[];
            console.log(`[MonsterDataManager] 怪物配置加载成功，共${this._monsterData.monsters.length}条`);
        } else {
            console.warn('[MonsterDataManager] 怪物配置加载失败:', results[0].reason);
            this._monsterData.monsters = [];
        }

        if (results[1].status === 'fulfilled') {
            this._monsterData.spriteConfigs = results[1].value as IMonsterSpriteConfig[];
            console.log(`[MonsterDataManager] 怪物精灵配置加载成功，共${this._monsterData.spriteConfigs.length}条`);
        } else {
            console.warn('[MonsterDataManager] 怪物精灵配置加载失败:', results[1].reason);
            this._monsterData.spriteConfigs = [];
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
            console.error(`[MonsterDataManager] 加载配置${configName}失败:`, error);
            throw error;
        }
    }

    private validateConfig<T>(config: any, configName: string): T {
        if (!config) {
            console.warn(`[MonsterDataManager] ${configName}配置为空`);
            return [] as any;
        }

        switch (configName) {
            case MonsterConfigPath.monsters:
                if (!Array.isArray(config)) {
                    console.warn(`[MonsterDataManager] 怪物配置应该是一个数组`);
                    return [] as any;
                }
                return config.map(monster => ({
                    id: monster.id || 0,
                    name: monster.name || '未知怪物',
                    url: monster.url || 'default',
                    type: monster.type || 'monster',
                    skills: monster.skills || [],
                    rarity: monster.rarity || 'common',
                    desc: monster.desc || null,
                    sprite: monster.sprite || null,
                    camp: monster.camp || 'demon',
                    can_move: monster.can_move ?? true,
                    can_skill: monster.can_skill ?? false,
                    can_attack: monster.can_attack ?? true,
                    detect_range: monster.detect_range ?? 50,
                    atk: monster.atk ?? 5,
                    atk_range: monster.atk_range ?? 50,
                    cooldown: monster.cooldown ?? 5,
                    hp: monster.hp ?? 50,
                    move_speed: monster.move_speed ?? 25,
                    repeat: monster.repeat ?? 0,
                    quantity: monster.quantity ?? 0,
                    pierce: monster.pierce ?? 0,
                    level: monster.level ?? 1,
                    max_level: monster.max_level ?? 99,
                    star: monster.star ?? 1,
                    max_star: monster.max_star ?? 5,
                    defense: monster.defense ?? 0,
                    hp_recover: monster.hp_recover ?? 0,
                    hp_recover_speed: monster.hp_recover_speed ?? 5,
                    dmg_range: monster.dmg_range ?? 0,
                    duration: monster.duration ?? 0,
                    frequency: monster.frequency ?? 1,
                    atk_CR: monster.atk_CR ?? 0,
                    atk_CRD: monster.atk_CRD ?? 2,
                    ...monster
                })) as T;

            case MonsterConfigPath.monsterSprites:
                if (!Array.isArray(config)) {
                    console.warn(`[MonsterDataManager] 怪物精灵配置应该是一个数组`);
                    return [] as any;
                }
                return config as T;

            default:
                return config as T;
        }
    }

    getMonsterList(): IMonster[] {
        return this._monsterData.monsters || [];
    }

    getMonsterById(id: number): IMonster | undefined {
        return this.getMonsterList().find(monster => monster.id === id);
    }

    getMonsterListByRarity(rarity: MonsterRarity): IMonster[] {
        return this.getMonsterList().filter(monster => monster.rarity === rarity);
    }

    getMonsterListByCamp(camp: string): IMonster[] {
        return this.getMonsterList().filter(monster => monster.camp === camp);
    }

    getMonsterPathById(id: number, spriteType: string = 'walk'): string {
        const monster = this.getMonsterById(id);
        if (!monster || !monster.url) {
            console.warn(`[MonsterDataManager] 怪物ID${id}配置不存在或URL为空`);
            return '';
        }
        const path = `textures/monster/${monster.url}/${spriteType}/spriteFrame`;
        return path || `textures/monster/default/${spriteType}/spriteFrame`;
    }

    getMonsterSpriteConfig(monsterId: number, spriteType: string = 'walk'): IMonsterSpriteConfig {
        const monster = this.getMonsterById(monsterId);
        if (!monster || !monster.url) {
            console.warn(`[MonsterDataManager] 怪物ID${monsterId}配置不存在或URL为空`);
            return defaultMonsterSpriteConfig[spriteType] || defaultMonsterSpriteConfig.walk;
        }

        const spriteConfig = this._monsterData.spriteConfigs.find(
            config => config.monster_id === monster.url && config.type === spriteType
        );

        return spriteConfig || defaultMonsterSpriteConfig[spriteType] || defaultMonsterSpriteConfig.walk;
    }

    getMonsterSpriteConfigs(monsterId: number): Record<string, IMonsterSpriteConfig> {
        const monster = this.getMonsterById(monsterId);
        if (!monster || !monster.url) {
            console.warn(`[MonsterDataManager] 怪物ID${monsterId}配置不存在或URL为空`);
            return defaultMonsterSpriteConfig;
        }

        const configs: Record<string, IMonsterSpriteConfig> = {};
        const monsterSprites = this._monsterData.spriteConfigs.filter(
            config => config.monster_id === monster.url
        );

        monsterSprites.forEach(config => {
            configs[config.type] = config;
        });

        return configs;
    }

    getMonsterAnimationFrames(monsterId: number, animationState: string, callback: (frames: SpriteFrame[] | null) => void): void {
        const monster = this.getMonsterById(monsterId);
        if (!monster || !monster.url) {
            console.warn(`[MonsterDataManager] 怪物ID${monsterId}配置不存在或URL为空`);
            callback(null);
            return;
        }

        const path = this.getMonsterPathById(monsterId, animationState);
        if (!path) {
            callback(null);
            return;
        }

        const loadFrames = (assetPath: string, state: string, allowFallback: boolean) => {
            loadResSingleAsset(assetPath, (spriteFrame) => {
                if (!spriteFrame) {
                    console.warn(`[MonsterDataManager] 动画资源不存在: ${assetPath}`);
                    if (allowFallback && state !== 'walk') {
                        const fallbackPath = this.getMonsterPathById(monsterId, 'walk');
                        if (fallbackPath && fallbackPath !== assetPath) {
                            loadFrames(fallbackPath, 'walk', false);
                            return;
                        }
                    }
                    callback(null);
                    return;
                }

                const frames = createStripFrames(spriteFrame, `MonsterDataManager:${monsterId}:${state}`, assetPath);
                if (!frames || frames.length === 0) {
                    console.warn(`[MonsterDataManager] 动画帧切分失败: ${assetPath}`);
                    if (allowFallback && state !== 'walk') {
                        const fallbackPath = this.getMonsterPathById(monsterId, 'walk');
                        if (fallbackPath && fallbackPath !== assetPath) {
                            loadFrames(fallbackPath, 'walk', false);
                            return;
                        }
                    }
                    callback(null);
                    return;
                }

                console.log(`[MonsterDataManager] 动画帧加载完成: ${assetPath}, 帧数: ${frames.length}`);
                callback(frames);
            });
        };

        loadFrames(path, animationState, true);
    }

    getMonsterStats(): { total: number; byRarity: Record<MonsterRarity, number> } {
        const monsters = this.getMonsterList();
        const byRarity: Record<MonsterRarity, number> = {
            common: 0,
            uncommon: 0,
            rare: 0,
            super_rare: 0,
            super_super_rare: 0,
            legendary: 0,
            mythic: 0
        };

        monsters.forEach(monster => {
            byRarity[monster.rarity]++;
        });

        return {
            total: monsters.length,
            byRarity
        };
    }

    async reloadConfig(configName: string): Promise<void> {
        try {
            if (configName === MonsterConfigPath.monsters) {
                const config = await this.loadConfig<IMonster[]>(configName);
                this._monsterData.monsters = config;
                console.log(`[MonsterDataManager] 怪物配置重新加载成功`);
            } else if (configName === MonsterConfigPath.monsterSprites) {
                const config = await this.loadConfig<IMonsterSpriteConfig[]>(configName);
                this._monsterData.spriteConfigs = config;
                console.log(`[MonsterDataManager] 怪物精灵配置重新加载成功`);
            }
        } catch (error) {
            console.error(`[MonsterDataManagerDataManager] 重新加载配置${configName}失败:`, error);
        }
    }
}

export const MDM = MonsterDataManager.instance();
