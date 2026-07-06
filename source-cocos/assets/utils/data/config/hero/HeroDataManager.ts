import { Singleton } from "../../../common/Singleton";
import { resManager } from "../manager/ResourceManager";
import { IHeroData, IHeroConfig, IHeroSpriteConfig, IUnitAttrConfig, IUnitCampConfig, IUnitPositionConfig, IUnitRarityConfig, IUnitTypeConfig, HeroRarity, IHeroRuntimeData } from "./IHeroConfig";
import { DEFAULT_HERO_DATA, HERO_DATA, HeroConfigPath, defaultHeroSpriteConfig } from "./HeroConfig";
import { gameBus } from "../../../signal/GameBus";
import { SIGNAL_TYPES, STORAGE_KEYS } from "../../../signal/ISignal";
import { loadData, saveData } from "../manager/DataManager";
import { CDM } from "../../../common/CurrencyManager";
import { SpriteFrame } from "cc";
import { loadResSingleAsset, createStripFrames } from "../../../utils";

export class HeroDataManager extends Singleton {
    private _heroData: IHeroData = HERO_DATA;
    private _heroesRuntimeData: Map<number, IHeroRuntimeData> = new Map();
    private _deployedHeroIds: Set<number> = new Set();
    private _isInitialized: boolean = false;
    private readonly CONFIG_BUNDLE = 'configs';

    async initialize(): Promise<boolean> {
        if (this._isInitialized) return true;

        try {
            console.log('[HeroDataManager] 开始加载英雄配置数据...');

            await this.loadAllConfigs();
            await this.loadHeroesRuntimeDataFromLocalStorage();

            this._isInitialized = true;
            console.log('[HeroDataManager] 英雄配置数据初始化完成');
            return true;
        } catch (error) {
            console.error('[HeroDataManager] 初始化失败:', error);
            return false;
        }
    }

    // ==================== 配置数据操作方法 ====================

    private async loadAllConfigs(): Promise<void> {
        const configPromises = [
            this.loadConfig<IHeroConfig[]>(HeroConfigPath.heroes),
            this.loadConfig<IHeroSpriteConfig[]>(HeroConfigPath.heroSprites),
            this.loadConfig<IUnitAttrConfig[]>(HeroConfigPath.unitAttrs),
            this.loadConfig<IUnitCampConfig[]>(HeroConfigPath.unitCamps),
            this.loadConfig<IUnitPositionConfig[]>(HeroConfigPath.unitPositions),
            this.loadConfig<IUnitRarityConfig[]>(HeroConfigPath.unitRarities),
            this.loadConfig<IUnitTypeConfig[]>(HeroConfigPath.unitTypes)
        ];

        const results = await Promise.allSettled(configPromises);

        if (results[0].status === 'fulfilled') {
            this._heroData.heroes = results[0].value as IHeroConfig[];
            console.log(`[HeroDataManager] 英雄配置加载成功，共${this._heroData.heroes.length}条`);
        } else {
            console.warn('[HeroDataManager] 英雄配置加载失败:', results[0].reason);
            this._heroData.heroes = [];
        }

        if (results[1].status === 'fulfilled') {
            this._heroData.heroSprites = results[1].value as IHeroSpriteConfig[];
            console.log(`[HeroDataManager] 英雄精灵配置加载成功，共${this._heroData.heroSprites.length}条`);
        } else {
            console.warn('[HeroDataManager] 英雄精灵配置加载失败:', results[1].reason);
            this._heroData.heroSprites = [];
        }

        if (results[2].status === 'fulfilled') {
            this._heroData.unitAttrs = results[2].value as IUnitAttrConfig[];
            console.log(`[HeroDataManager] 单位属性配置加载成功，共${this._heroData.unitAttrs.length}条`);
        } else {
            console.warn('[HeroDataManager] 单位属性配置加载失败:', results[2].reason);
            this._heroData.unitAttrs = [];
        }

        if (results[3].status === 'fulfilled') {
            this._heroData.unitCamps = results[3].value as IUnitCampConfig[];
            console.log(`[HeroDataManager] 单位阵营配置加载成功，共${this._heroData.unitCamps.length}条`);
        } else {
            console.warn('[HeroDataManager] 单位阵营配置加载失败:', results[3].reason);
            this._heroData.unitCamps = [];
        }

        if (results[4].status === 'fulfilled') {
            this._heroData.unitPositions = results[4].value as IUnitPositionConfig[];
            console.log(`[HeroDataManager] 单位位置配置加载成功，共${this._heroData.unitPositions.length}条`);
        } else {
            console.warn('[HeroDataManager] 单位位置配置加载失败:', results[4].reason);
            this._heroData.unitPositions = [];
        }

        if (results[5].status === 'fulfilled') {
            this._heroData.unitRarities = results[5].value as IUnitRarityConfig[];
            console.log(`[HeroDataManager] 单位稀有度配置加载成功，共${this._heroData.unitRarities.length}条`);
        } else {
            console.warn('[HeroDataManager] 单位稀有度配置加载失败:', results[5].reason);
            this._heroData.unitRarities = [];
        }

        if (results[6].status === 'fulfilled') {
            this._heroData.unitTypes = results[6].value as IUnitTypeConfig[];
            console.log(`[HeroDataManager] 单位类型配置加载成功，共${this._heroData.unitTypes.length}条`);
        } else {
            console.warn('[HeroDataManager] 单位类型配置加载失败:', results[6].reason);
            this._heroData.unitTypes = [];
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
            console.error(`[HeroDataManager] 加载配置${configName}失败:`, error);
            throw error;
        }
    }

    private validateConfig<T>(config: any, configName: string): T {
        if (!config) {
            console.warn(`[HeroDataManager] ${configName}配置为空`);
            return [] as any;
        }

        switch (configName) {
            case HeroConfigPath.heroes:
                if (!Array.isArray(config)) {
                    console.warn(`[HeroDataManager] 英雄配置应该是一个数组`);
                    return [] as any;
                }
                return config.map(hero => ({
                    id: hero.id || 0,
                    name: hero.name || '未知英雄',
                    url: hero.url || 'default',
                    icon: hero.icon || 'illustration',
                    type: hero.type || 'hero',
                    skills: hero.skills || [],
                    rarity: hero.rarity || 'common',
                    position: hero.position || 'tank',
                    desc: hero.desc || '',
                    attr: hero.attr || 'UNIT_ATTR_EARTH',
                    camp: hero.camp || 'human',
                    status: hero.status || 'unlocked',
                    sprite: hero.sprite || null,
                    can_move: hero.can_move ?? false,
                    can_skill: hero.can_skill ?? true,
                    can_attack: hero.can_attack ?? false,
                    detect_range: hero.detect_range ?? 50,
                    atk: hero.atk ?? 1,
                    atk_range: hero.atk_range ?? 50,
                    cooldown: hero.cooldown ?? 0.5,
                    hp: hero.hp ?? 25,
                    move_speed: hero.move_speed ?? 0,
                    repeat: hero.repeat ?? 0,
                    quantity: hero.quantity ?? 0,
                    pierce: hero.pierce ?? 0,
                    level: hero.level ?? 1,
                    max_level: hero.max_level ?? 999,
                    star: hero.star ?? 1,
                    max_star: hero.max_star ?? 99,
                    defense: hero.defense ?? 0,
                    hp_recover: hero.hp_recover ?? 0,
                    hp_recover_speed: hero.hp_recover_speed ?? 5,
                    duration: hero.duration ?? 0,
                    frequency: hero.frequency ?? 1,
                    atk_CR: hero.atk_CR ?? 0.01,
                    atk_CRD: hero.atk_CRD ?? 2,
                    unlockCondition: hero.unlockCondition ?? null,
                    ...hero
                })) as T;

            case HeroConfigPath.heroSprites:
            case HeroConfigPath.unitAttrs:
            case HeroConfigPath.unitCamps:
            case HeroConfigPath.unitPositions:
            case HeroConfigPath.unitRarities:
            case HeroConfigPath.unitTypes:
                if (!Array.isArray(config)) {
                    console.warn(`[HeroDataManager] ${configName}配置应该是一个数组`);
                    return [] as any;
                }
                return config as T;

            default:
                return config as T;
        }
    }

    getHeroList(): IHeroConfig[] {
        return this._heroData.heroes || [];
    }

    getHeroById(id: number): IHeroConfig | undefined {
        return this.getHeroList().find(hero => hero.id === id);
    }

    getHeroRuntimeData(heroId: number): IHeroRuntimeData | undefined {
        return this._heroesRuntimeData.get(heroId);
    }

    getHeroWithRuntimeData(heroId: number): IHeroConfig & Partial<IHeroRuntimeData> | undefined {
        const hero = this.getHeroById(heroId);
        if (!hero) return undefined;

        const runtimeData = this.getHeroRuntimeData(heroId);
        if (runtimeData) {
            return {
                ...hero,
                level: runtimeData.level,
                exp: runtimeData.exp,
                fragment: runtimeData.fragment,
                star: runtimeData.star,
                deployed: runtimeData.deployed,
                deployPosition: runtimeData.deployPosition,
                lastUpgradeTime: runtimeData.lastUpgradeTime,
                upgradeCount: runtimeData.upgradeCount
            };
        }

        return hero;
    }

    getHeroListByRarity(rarity: HeroRarity): IHeroConfig[] {
        return this.getHeroList().filter(hero => hero.rarity === rarity);
    }

    getHeroListByCamp(camp: string): IHeroConfig[] {
        return this.getHeroList().filter(hero => hero.camp === camp);
    }

    getHeroListByPosition(position: string): IHeroConfig[] {
        return this.getHeroList().filter(hero => hero.position === position);
    }

    getHeroListByAttr(attr: string): IHeroConfig[] {
        return this.getHeroList().filter(hero => hero.attr === attr);
    }

    getHeroPathById(id: number, spriteType: string = 'idle'): string {
        const hero = this.getHeroById(id);
        if (!hero || !hero.url) {
            console.warn(`[HeroDataManager] 英雄ID${id}配置不存在或URL为空`);
            return '';
        }
        if (spriteType === 'attr') {
            const attr = this.getUnitAttrByKey(hero.attr);
            return attr.icon;
        }
        const path = `textures/hero/${hero.url}/${spriteType}/spriteFrame`;
        return path || `textures/hero/default/${spriteType}/spriteFrame`;
    }

    getHeroSpriteFrame(heroId: number, spriteType: string = 'idle', callback?: (spriteFrame: SpriteFrame | null) => void): SpriteFrame | null {
        const path = this.getHeroPathById(heroId, spriteType);

        const hero = this.getHeroById(heroId);
        if (!hero || !path) {
            console.warn(`[HeroDataManager] 英雄ID${heroId}配置不存在或URL为空`);
            callback?.(null);
            return null;
        }

        if (callback) {
            loadResSingleAsset(path, (spriteFrame) => {
                console.log(`[HeroDataManager] 加载英雄ID${heroId} ${spriteType} 精灵帧: ${path}`);
                callback(spriteFrame);
            });
            return null;
        }

        let sprite = null;
        loadResSingleAsset(path, (spriteFrame) => {
            console.log(`[HeroDataManager] 加载英雄ID${heroId} ${spriteType} 精灵帧: ${path}`);
            sprite = spriteFrame;
        });
        return sprite;
    }

    getHeroSpriteConfig(heroId: number, spriteType: string = 'idle'): IHeroSpriteConfig {
        const hero = this.getHeroById(heroId);
        if (!hero || !hero.url) {
            console.warn(`[HeroDataManager] 英雄ID${heroId}配置不存在或URL为空`);
            return defaultHeroSpriteConfig[spriteType] || defaultHeroSpriteConfig.idle;
        }

        const spriteConfig = this._heroData.heroSprites.find(
            config => config.hero_id === hero.url && config.type === spriteType
        );

        return spriteConfig || defaultHeroSpriteConfig[spriteType] || defaultHeroSpriteConfig.idle;
    }

    getHeroSpriteConfigs(heroId: number): Record<string, IHeroSpriteConfig> {
        const hero = this.getHeroById(heroId);
        if (!hero || !hero.url) {
            console.warn(`[HeroDataManager] 英雄ID${heroId}配置不存在或URL为空`);
            return defaultHeroSpriteConfig;
        }

        const configs: Record<string, IHeroSpriteConfig> = {};
        const heroSprites = this._heroData.heroSprites.filter(
            config => config.hero_id === hero.url
        );

        heroSprites.forEach(config => {
            configs[config.type] = config;
        });

        return configs;
    }

    getHeroAnimationFrames(heroId: number, animationState: string, callback: (frames: SpriteFrame[] | null) => void): void {
        const hero = this.getHeroById(heroId);
        if (!hero || !hero.url) {
            console.warn(`[HeroDataManager] 英雄ID${heroId}配置不存在或URL为空`);
            callback(null);
            return;
        }

        const path = this.getHeroPathById(heroId, animationState);
        if (!path) {
            callback(null);
            return;
        }

        const loadFrames = (assetPath: string, state: string, allowFallback: boolean) => {
            loadResSingleAsset(assetPath, (spriteFrame) => {
                if (!spriteFrame) {
                    console.warn(`[HeroDataManager] 动画资源不存在: ${assetPath}`);
                    if (allowFallback && state !== 'idle') {
                        const fallbackPath = this.getHeroPathById(heroId, 'idle');
                        if (fallbackPath && fallbackPath !== assetPath) {
                            loadFrames(fallbackPath, 'idle', false);
                            return;
                        }
                    }
                    callback(null);
                    return;
                }

                const frames = createStripFrames(spriteFrame, `HeroDataManager:${heroId}:${state}`, assetPath);
                if (!frames || frames.length === 0) {
                    console.warn(`[HeroDataManager] 动画帧切分失败: ${assetPath}`);
                    if (allowFallback && state !== 'idle') {
                        const fallbackPath = this.getHeroPathById(heroId, 'idle');
                        if (fallbackPath && fallbackPath !== assetPath) {
                            loadFrames(fallbackPath, 'idle', false);
                            return;
                        }
                    }
                    callback(null);
                    return;
                }

                console.log(`[HeroDataManager] 动画帧加载完成: ${assetPath}, 帧数: ${frames.length}`);
                callback(frames);
            });
        };

        loadFrames(path, animationState, true);
    }

    getHeroStats(): { total: number; byRarity: Record<HeroRarity, number> } {
        const heroes = this.getHeroList();
        const byRarity: Record<HeroRarity, number> = {
            common: 0,
            uncommon: 0,
            rare: 0,
            sr: 0,
            ssr: 0,
            legendary: 0,
            mythic: 0
        };

        heroes.forEach(hero => {
            byRarity[hero.rarity]++;
        });

        return {
            total: heroes.length,
            byRarity
        };
    }

    getUnitAttrByName(name: string): IUnitAttrConfig | undefined {
        return this._heroData.unitAttrs.find(attr => attr.name === name);
    }

    getUnitAttrByKey(key: string): IUnitAttrConfig | undefined {
        return this._heroData.unitAttrs.find(attr => attr.key === key);
    }

    getUnitCampByName(name: string): IUnitCampConfig | undefined {
        return this._heroData.unitCamps.find(camp => camp.name === name);
    }

    getUnitCampByKey(key: string): IUnitCampConfig | undefined {
        return this._heroData.unitCamps.find(camp => camp.key === key);
    }

    getUnitPositionByName(name: string): IUnitPositionConfig | undefined {
        return this._heroData.unitPositions.find(pos => pos.name === name);
    }

    getUnitPositionByKey(key: string): IUnitPositionConfig | undefined {
        return this._heroData.unitPositions.find(pos => pos.key === key);
    }

    getUnitRarityByName(name: string): IUnitRarityConfig | undefined {
        return this._heroData.unitRarities.find(rarity => rarity.name === name);
    }

    getUnitRarityByKey(key: string): IUnitRarityConfig | undefined {
        return this._heroData.unitRarities.find(rarity => rarity.key === key);
    }

    getUnitTypeByName(name: string): IUnitTypeConfig | undefined {
        return this._heroData.unitTypes.find(type => type.name === name);
    }

    getUnitTypeByKey(key: string): IUnitTypeConfig | undefined {
        return this._heroData.unitTypes.find(type => type.key === key);
    }

    async reloadConfig(configName: string): Promise<void> {
        try {
            if (configName === HeroConfigPath.heroes) {
                const config = await this.loadConfig<IHeroConfig[]>(configName);
                this._heroData.heroes = config;
                console.log(`[HeroDataManager] 英雄配置重新加载成功`);
            } else if (configName === HeroConfigPath.heroSprites) {
                const config = await this.loadConfig<IHeroSpriteConfig[]>(configName);
                this._heroData.heroSprites = config;
                console.log(`[HeroDataManager] 英雄精灵配置重新加载成功`);
            } else if (configName === HeroConfigPath.unitAttrs) {
                const config = await this.loadConfig<IUnitAttrConfig[]>(configName);
                this._heroData.unitAttrs = config;
                console.log(`[HeroDataManager] 单位属性配置重新加载成功`);
            } else if (configName === HeroConfigPath.unitCamps) {
                const config = await this.loadConfig<IUnitCampConfig[]>(configName);
                this._heroData.unitCamps = config;
                console.log(`[HeroDataManager] 单位阵营配置重新加载成功`);
            } else if (configName === HeroConfigPath.unitPositions) {
                const config = await this.loadConfig<IUnitPositionConfig[]>(configName);
                this._heroData.unitPositions = config;
                console.log(`[HeroDataManager] 单位位置配置重新加载成功`);
            } else if (configName === HeroConfigPath.unitRarities) {
                const config = await this.loadConfig<IUnitRarityConfig[]>(configName);
                this._heroData.unitRarities = config;
                console.log(`[HeroDataManager] 单位稀有度配置重新加载成功`);
            } else if (configName === HeroConfigPath.unitTypes) {
                const config = await this.loadConfig<IUnitTypeConfig[]>(configName);
                this._heroData.unitTypes = config;
                console.log(`[HeroDataManager] 单位类型配置重新加载成功`);
            }
        } catch (error) {
            console.error(`[HeroDataManager] 重新加载配置${configName}失败:`, error);
        }
    }

    // ==================== 本地数据操作方法 ====================

    /**
     * 从本地存储加载英雄运行时数据
     */
    private async loadHeroesRuntimeDataFromLocalStorage(): Promise<void> {
        try {
            const data = loadData(STORAGE_KEYS.HERO_RUNTIME_DATA);

            if (data) {
                const parsed = typeof data === 'string' ? JSON.parse(data) : data;

                if (Array.isArray(parsed)) {
                    parsed.forEach((heroData: any) => {
                        // 确保所有必要字段都有值
                        const runtimeData: IHeroRuntimeData = {
                            id: heroData.id,
                            level: heroData.level || 1,
                            exp: heroData.exp || 0,
                            fragment: heroData.fragment || 0,
                            star: heroData.star || 1,
                            deployed: heroData.isDeployed || false,
                            deployPosition: heroData.deployPosition,
                            lastUpgradeTime: heroData.lastUpgradeTime,
                            upgradeCount: heroData.upgradeCount
                        };

                        this._heroesRuntimeData.set(runtimeData.id, runtimeData);
                        if (runtimeData.deployed) {
                            this._deployedHeroIds.add(runtimeData.id);
                        }
                    });
                    console.log(`[HeroDataManager] 从本地存储加载了 ${this._heroesRuntimeData.size} 个英雄的运行时数据`);
                }
            } else {
                // 如果没有本地数据，从JDM配置初始化英雄运行时数据
                await this.initHeroesRuntimeData();
            }
        } catch (error) {
            console.error('[HeroDataManager] 加载英雄数据失败:', error);
            await this.initHeroesRuntimeData();
        }
    }

    /**
     * 初始化运行时数据
     */
    private async initHeroesRuntimeData(): Promise<void> {
        try {
            // 从HeroConfigDataManager获取英雄配置列表
            const heroConfigs = this.getHeroList();
            if (!heroConfigs || heroConfigs.length === 0) {
                console.warn('[HeroDataManager] HeroConfigDataManager返回了空的英雄配置列表');
                return;
            }
            console.log(`[HeroDataManager] 从HeroDataManager获取了 ${heroConfigs.length} 个英雄配置`);

            // 为每个英雄配置创建运行时数据
            for (const config of heroConfigs) {
                try {
                    const heroId = config.id;
                    if (!heroId) {
                        console.warn('[HeroDataManager] 英雄配置缺少ID字段，跳过:', config);
                        continue;
                    }

                    // 从配置中提取运行时数据（如果配置中有的话）
                    // 否则使用HDM的默认数据
                    const heroData: IHeroRuntimeData = {
                        id: heroId,
                        level: config.level !== undefined ? config.level : DEFAULT_HERO_DATA.level!,
                        exp: DEFAULT_HERO_DATA.exp!,
                        fragment: config.fragment !== undefined ? config.fragment : DEFAULT_HERO_DATA.fragment!,
                        star: config.star !== undefined ? config.star : DEFAULT_HERO_DATA.star!,
                        deployed: config.deployed !== undefined ? config.deployed : DEFAULT_HERO_DATA.deployed!,
                        deployPosition: undefined,
                        lastUpgradeTime: undefined,
                        upgradeCount: undefined
                    };

                    this._heroesRuntimeData.set(heroId, heroData);

                    if (heroData.deployed) {
                        this._deployedHeroIds.add(heroId);
                    }

                    console.log(`[HeroDataManager] 为英雄 ${heroId} 初始化运行时数据:`, heroData);
                } catch (configError) {
                    console.error(`[HeroDataManager] 处理英雄配置失败 (ID: ${config.id}):`, configError);
                }
            }

            // 如果HeroConfigDataManager配置中没有任何英雄，则创建几个默认英雄
            if (this._heroesRuntimeData.size === 0) {
                console.warn('[HeroDataManager] JDM配置中没有英雄，创建默认英雄');
            }

            // 保存初始化后的数据到本地存储
            await this.saveHeroesRuntimeDataToLocalStorage();
            console.log(`[HeroDataManager] 从配置初始化了 ${this._heroesRuntimeData.size} 个英雄的运行时数据`);

        } catch (error) {
            console.error('[HeroDataManager] 从配置初始化英雄数据失败:', error);
        }
    }

    /**
     * 保存到本地存储
     */
    private async saveHeroesRuntimeDataToLocalStorage(): Promise<void> {
        try {
            const heroesArray = Array.from(this._heroesRuntimeData.values());
            saveData(STORAGE_KEYS.HERO_RUNTIME_DATA, JSON.stringify(heroesArray));
        } catch (error) {
            console.error('[HeroDataManager] 保存英雄数据失败:', error);
        }
    }

    /**
     * 获取已部署的英雄ID列表
     */
    getDeployedHeroIds(): number[] {
        return Array.from(this._deployedHeroIds);
    }

    /**
     * 获取已部署的英雄数据列表
     */
    getDeployedHeroes(): IHeroRuntimeData[] {
        return Array.from(this._deployedHeroIds)
            .map(id => this._heroesRuntimeData.get(id))
            .filter(hero => hero !== undefined) as IHeroRuntimeData[];
    }

    /**
     * 更新英雄运行时数据（核心方法）
     * @param heroId 英雄ID
     * @param updates 要更新的数据
     * @param emitEvent 是否触发更新事件（默认true）
     */
    async updateHero(heroId: number, updates: Partial<IHeroRuntimeData>, emitEvent: boolean = true): Promise<IHeroRuntimeData> {
        let hero = this._heroesRuntimeData.get(heroId);

        if (!hero) {
            // 如果英雄不存在，创建新的
            hero = {
                id: heroId,
                level: updates.level || 1,
                exp: updates.exp || 0,
                fragment: updates.fragment || 0,
                star: updates.star || 1,
                deployed: updates.deployed || false,
                deployPosition: updates.deployPosition
            };
        } else {
            // 更新现有数据
            hero = { ...hero, ...updates };
        }

        // 更新部署状态
        if (updates.deployed !== undefined) {
            if (updates.deployed) {
                this._deployedHeroIds.add(heroId);
            } else {
                this._deployedHeroIds.delete(heroId);
                hero.deployPosition = undefined; // 取消部署时清空位置
            }
        }

        this._heroesRuntimeData.set(heroId, hero);

        // 保存到本地存储
        await this.saveHeroesRuntimeDataToLocalStorage();

        // 触发更新事件
        if (emitEvent) {
            gameBus.emit(SIGNAL_TYPES.HERO_DATA_UPDATED, {
                heroId,
                heroData: hero,
                updates
            });
        }

        console.log(`[HeroDataManager] 更新英雄 ${heroId}: ${hero.level} 数据:`, updates);
        return hero;
    }

    /**
     * 批量更新英雄数据（用于战斗结算等场景）
     */
    async updateHeroesBatch(updates: Array<{ heroId: number, updates: Partial<IHeroRuntimeData> }>): Promise<void> {
        const results = [];

        for (const { heroId, updates: heroUpdates } of updates) {
            try {
                const result = await this.updateHero(heroId, heroUpdates, false); // 不触发单个事件
                results.push(result);
            } catch (error) {
                console.error(`[HeroDataManager] 更新英雄 ${heroId} 失败:`, error);
            }
        }

        // 批量保存后触发一次批量更新事件
        gameBus.emit(SIGNAL_TYPES.HERO_DATA_BATCH_UPDATED, {
            updates: results,
            count: results.length
        });

        console.log(`[HeroDataManager] 批量更新了 ${results.length} 个英雄的数据`);
    }

    // ==================== 业务操作方法 ====================

    /**
     * 给英雄添加经验
     * @param heroId 英雄ID
     * @param exp 要添加的经验值
     * @returns 返回升级后的等级（如果没有升级则返回当前等级）
     */
    async addHeroExp(heroId: number, exp: number): Promise<number> {
        const hero = this._heroesRuntimeData.get(heroId);
        if (!hero) {
            console.error(`[HeroDataManager] 英雄运行时数据不存在，ID: ${heroId}`);
            return hero.level; // 直接返回当前等级（无升级）
        }
        const newExp = hero.exp + exp;

        // 这里应该根据配置计算升级逻辑
        // 假设每100经验升1级
        const expPerLevel = 100;
        const oldLevel = hero.level;
        const newLevel = Math.min(oldLevel + Math.floor(newExp / expPerLevel), 100); // 假设最大100级

        const remainingExp = newExp % expPerLevel;

        const updatedHero = await this.updateHero(heroId, {
            exp: remainingExp,
            level: newLevel
        });

        // 如果升级了，触发升级事件
        if (newLevel > oldLevel) {
            gameBus.emit(SIGNAL_TYPES.HERO_UPGRADED, {
                heroId,
                oldLevel,
                newLevel,
                heroData: updatedHero
            });
        }

        return newLevel;
    }

    // TODO: 运行时数据需要保存到本地
    deployHero(id: number, position?: number): boolean {
        const hero = this._heroesRuntimeData.get(id);
        if (!hero) {
            console.error(`[HeroDataManager] 部署英雄失败：英雄ID ${id} 不存在`);
            return false;
        }

        // 检查位置是否已被占用
        if (position !== undefined && hero.deployed) {
            console.error(`[HeroDataManager] 部署英雄失败：位置 ${position} 已被占用`);
            return false;
        }

        // 部署英雄
        hero.deployed = true;
        // 保存到本地
        this.saveHeroesRuntimeDataToLocalStorage();
        console.log(`[HeroDataManager] 成功部署英雄 ${hero.id} 到位置 ${position || 0}`);
        return true;
    }

    /**
     * 给英雄添加碎片
     * @param heroId 英雄ID
     * @param fragment 要添加的碎片数量
     * @returns 返回添加后的碎片数量
     */
    async addHeroFragment(heroId: number, fragment: number): Promise<number> {
        const hero = this._heroesRuntimeData.get(heroId);
        if (!hero) {
            console.error(`[HeroDataManager] 英雄运行时数据不存在，ID: ${heroId}`);
            return hero.fragment; // 直接返回当前碎片数量（无添加）
        }
        const newFragment = hero.fragment + fragment;

        const updatedHero = await this.updateHero(heroId, {
            fragment: newFragment
        });

        // 触发碎片添加事件
        gameBus.emit(SIGNAL_TYPES.HERO_FRAGMENT_ADDED, {
            heroId,
            addedFragment: fragment,
            totalFragment: newFragment,
            heroData: updatedHero
        });

        return newFragment;
    }

    /**
     * 升级英雄（增加等级）
     * @param heroId 英雄ID
     * @param levels 要增加的等级数（默认为1）
     */
    async upgradeHeroLevel(heroId: number, levels: number = 1): Promise<boolean> {
        const hero = this._heroesRuntimeData.get(heroId);
        if (!hero) {
            console.error(`[HeroDataManager] 英雄运行时数据不存在，ID: ${heroId}`);
            return false; // 直接返回当前等级（无升级）
        }
        const newLevel = hero.level + levels;

        // 这里应该检查是否超过最大等级（需要从配置获取）
        // 暂时假设最大999级
        if (newLevel > 999) {
            console.warn(`[HeroDataManager] 英雄 ${heroId} 已达到最大等级`);
            return false;
        }

        await this.updateHero(heroId, {
            level: newLevel,
            lastUpgradeTime: Date.now(),
            upgradeCount: (hero.upgradeCount || 0) + 1
        });

        return true;
    }

    // ==================== 业务辅助方法 ====================

    /**
     * 检查英雄是否可以升级
     */
    canUpgradeHero(heroId: number): boolean {
        const hero = this.getHeroById(heroId);
        if (!hero) {
            console.warn(`[HeroDataManager] canUpgradeHero: 英雄不存在，ID: ${heroId}`);
            return false;
        }

        const runtimeData = this.getHeroRuntimeData(heroId);
        const currentLevel = runtimeData?.level || 1;

        if (currentLevel >= (hero.max_level || 99)) {
            console.log(`[HeroDataManager] canUpgradeHero: 英雄 ${hero.name} 已达到最大等级 ${currentLevel}`);
            return false;
        }

        const requiredFragments = this.calculateUpgradeFragments(currentLevel);
        const currentFragments = this.getHeroFragmentCount(heroId);

        console.log(`[HeroDataManager] canUpgradeHero: 英雄 ${hero.name}, 等级 ${currentLevel}, 碎片 ${currentFragments}/${requiredFragments}`);

        if (currentFragments < requiredFragments) {
            console.log(`[HeroDataManager] canUpgradeHero: 碎片不足，无法升级`);
            return false;
        }

        try {
            const { CDM, CurrencyType } = require('../../common/CurrencyManager');
            const baseUpgradeCost = 100;
            const upgradeCost = baseUpgradeCost * currentLevel;
            const currentGold = CDM.getCurrency(CurrencyType.Gold) || 0;

            console.log(`[HeroDataManager] canUpgradeHero: 金币 ${currentGold}/${upgradeCost}`);

            const canUpgrade = currentGold >= upgradeCost;
            console.log(`[HeroDataManager] canUpgradeHero: 英雄 ${hero.name} ${canUpgrade ? '可以' : '不可以'}升级`);
            return canUpgrade;
        } catch (error) {
            console.warn('[HeroDataManager] 无法检查金币数量，跳过金币检查:', error);
            return true;
        }
    }

    /**
     * 检查英雄是否可以升星
     */
    canStarUpHero(heroId: number): boolean {
        const hero = this.getHeroById(heroId);
        if (!hero) return false;

        const runtimeData = this.getHeroRuntimeData(heroId);
        const currentStar = runtimeData?.star || 1;

        if (currentStar >= (hero.max_star || 5)) {
            return false;
        }
        const requiredFragments = this.calculateStarUpFragments(currentStar);
        const currentFragments = this.getHeroFragmentCount(heroId);

        return currentFragments >= requiredFragments;
    }

    /**
     * 检查英雄是否可以解锁
     */
    canUnlockHero(heroId: number): boolean {
        const hero = this.getHeroById(heroId);
        if (!hero) return false;

        const currentFragments = this.getHeroFragmentCount(heroId);
        const maxFragment = hero.fragment || 100;
        return currentFragments >= maxFragment;
    }

    /**
     * 计算升级需要的碎片数量
     */
    calculateUpgradeFragments(currentLevel: number): number {
        return 5 * Math.pow(2, currentLevel - 1);
    }

    /**
     * 计算升星需要的碎片数量
     */
    calculateStarUpFragments(currentStar: number): number {
        return 10 * Math.pow(2, currentStar - 1);
    }

    /**
     * 获取英雄碎片数量
     */
    getHeroFragmentCount(heroId: number): number {
        try {
            const runtimeData = this._heroesRuntimeData.get(heroId);
            if (runtimeData) {
                return runtimeData.fragment || 0;
            }
        } catch (error) {
            console.warn('[HeroDataManager] 获取英雄碎片数量失败:', error);
        }

        return 0;
    }

    /**
     * 获取英雄升级进度
     */
    getHeroUpgradeProgress(heroId: number): number {
        const hero = this.getHeroById(heroId);
        if (!hero) return 0;

        const runtimeData = this._heroesRuntimeData.get(heroId);
        const exp = runtimeData?.exp || 0;
        return exp / 100;
    }

    /**
     * 获取英雄解锁进度
     */
    getHeroUnlockProgress(heroId: number): number {
        const hero = this.getHeroById(heroId);
        if (!hero) return 0;

        if (hero.status === 'unlocked') {
            return 100;
        }

        const currentFragments = this.getHeroFragmentCount(heroId);
        const maxFragment = hero.fragment || 100;
        return Math.min((currentFragments / maxFragment) * 100, 100);
    }
}

export const HDM = HeroDataManager.instance();
