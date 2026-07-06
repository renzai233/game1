import { LTM } from './LotteryManager';
import { ILotteryConfig, ILotteryPool, LotteryType } from './LotteryTypes';
import { ItemRarity } from '../material/ItemTypes';
import { Singleton } from '../../utils/common/Singleton';

export class LotteryConfigManager extends Singleton {
    private _configs: Map<string, ILotteryConfig> = new Map();

    async initialize(): Promise<boolean> {
        try {
            console.log('[LotteryConfigManager] 初始化抽奖配置管理器...');

            await this.loadDefaultConfigs();

            console.log(`[LotteryConfigManager] 加载了 ${this._configs.size} 个抽奖配置`);
            return true;
        } catch (error) {
            console.error('[LotteryConfigManager] 初始化失败:', error);
            return false;
        }
    }

    private async loadDefaultConfigs(): Promise<void> {
    }

    registerConfig(config: ILotteryConfig): boolean {
        if (this._configs.has(config.id)) {
            console.warn(`[LotteryConfigManager] 配置已存在: ${config.id}`);
            return false;
        }

        this._configs.set(config.id, config);
        LTM.registerLotteryConfig(config);

        return true;
    }

    getConfig(lotteryId: string): ILotteryConfig | undefined {
        return this._configs.get(lotteryId);
    }

    getAllConfigs(): ILotteryConfig[] {
        return Array.from(this._configs.values());
    }

    getConfigsByType(type: LotteryType): ILotteryConfig[] {
        return Array.from(this._configs.values()).filter(config => config.type === type);
    }

    createHeroFragmentLotteryConfig(): ILotteryConfig {
        const pool: ILotteryPool = {
            poolId: 'hero_fragment_pool',
            name: '晶核碎片池',
            rewards: [
                {
                    configId: 4001,
                    minQuantity: 10,
                    maxQuantity: 20,
                    weight: 50,
                    rarity: ItemRarity.COMMON
                },
                {
                    configId: 4002,
                    minQuantity: 5,
                    maxQuantity: 10,
                    weight: 30,
                    rarity: ItemRarity.RARE
                },
                {
                    configId: 4003,
                    minQuantity: 3,
                    maxQuantity: 5,
                    weight: 15,
                    rarity: ItemRarity.EPIC
                },
                {
                    configId: 4004,
                    minQuantity: 1,
                    maxQuantity: 2,
                    weight: 5,
                    rarity: ItemRarity.LEGENDARY
                }
            ],
            totalWeight: 100
        };

        return {
            id: 'hero_fragment_lottery',
            name: '晶核碎片补给',
            type: LotteryType.HERO_FRAGMENT,
            description: '消耗棱钻抽取晶核碎片，有机会强化守卫',
            icon: 'textures/ui/popup/fragment/spriteFrame',
            singleDrawCost: {
                itemId: 100,
                quantity: 100
            },
            multiDrawCost: {
                itemId: 100,
                quantity: 888
            },
            multiDrawCount: 10,
            multiDrawDiscount: 0.12,
            pools: [pool],
            maxDailyDraws: 100,
            guaranteeMechanic: {
                pityCount: 50,
                guaranteedRewardConfigId: 4004,
                guaranteedRewardQuantity: 1
            }
        };
    }

    createEquipmentLotteryConfig(): ILotteryConfig {
        const pool: ILotteryPool = {
            poolId: 'equipment_pool',
            name: '晶核装备池',
            rewards: [
                {
                    configId: 1001,
                    minQuantity: 1,
                    maxQuantity: 1,
                    weight: 60,
                    rarity: ItemRarity.COMMON
                },
                {
                    configId: 1002,
                    minQuantity: 1,
                    maxQuantity: 1,
                    weight: 25,
                    rarity: ItemRarity.UNCOMMON
                },
                {
                    configId: 1003,
                    minQuantity: 1,
                    maxQuantity: 1,
                    weight: 10,
                    rarity: ItemRarity.RARE
                },
                {
                    configId: 1004,
                    minQuantity: 1,
                    maxQuantity: 1,
                    weight: 4,
                    rarity: ItemRarity.EPIC
                },
                {
                    configId: 1005,
                    minQuantity: 1,
                    maxQuantity: 1,
                    weight: 1,
                    rarity: ItemRarity.LEGENDARY
                }
            ],
            totalWeight: 100
        };

        return {
            id: 'equipment_lottery',
            name: '晶核装备补给',
            type: LotteryType.EQUIPMENT,
            description: '消耗晶币抽取装备，获得强力武器',
            icon: 'textures/icon/res/treasure/spriteFrame',
            singleDrawCost: {
                itemId: 200,
                quantity: 1000
            },
            multiDrawCost: {
                itemId: 200,
                quantity: 8000
            },
            multiDrawCount: 10,
            multiDrawDiscount: 0.2,
            pools: [pool],
            maxDailyDraws: 50,
            guaranteeMechanic: {
                pityCount: 30,
                guaranteedRewardConfigId: 1005,
                guaranteedRewardQuantity: 1
            }
        };
    }

    createMixedLotteryConfig(): ILotteryConfig {
        const pool: ILotteryPool = {
            poolId: 'mixed_pool',
            name: '晶核混合补给池',
            rewards: [
                {
                    configId: 2001,
                    minQuantity: 5,
                    maxQuantity: 10,
                    weight: 40,
                    rarity: ItemRarity.COMMON
                },
                {
                    configId: 3001,
                    minQuantity: 3,
                    maxQuantity: 8,
                    weight: 30,
                    rarity: ItemRarity.COMMON
                },
                {
                    configId: 4001,
                    minQuantity: 2,
                    maxQuantity: 5,
                    weight: 20,
                    rarity: ItemRarity.RARE
                },
                {
                    configId: 1002,
                    minQuantity: 1,
                    maxQuantity: 1,
                    weight: 8,
                    rarity: ItemRarity.UNCOMMON
                },
                {
                    configId: 4003,
                    minQuantity: 1,
                    maxQuantity: 2,
                    weight: 2,
                    rarity: ItemRarity.EPIC
                }
            ],
            totalWeight: 100
        };

        return {
            id: 'mixed_lottery',
            name: '晶核混合补给',
            type: LotteryType.MIXED,
            description: '消耗棱钻抽取多种奖励',
            icon: 'textures/icon/res/gift/spriteFrame',
            singleDrawCost: {
                itemId: 300,
                quantity: 50
            },
            multiDrawCost: {
                itemId: 300,
                quantity: 400
            },
            multiDrawCount: 10,
            multiDrawDiscount: 0.2,
            pools: [pool],
            maxDailyDraws: 20,
            guaranteeMechanic: {
                pityCount: 20,
                guaranteedRewardConfigId: 4003,
                guaranteedRewardQuantity: 1
            }
        };
    }

    createCustomLotteryConfig(config: Partial<ILotteryConfig>): ILotteryConfig | null {
        if (!config.id || !config.name || !config.pools || config.pools.length === 0) {
            console.error('[LotteryConfigManager] 无效的自定义配置');
            return null;
        }

        const defaultConfig: ILotteryConfig = {
            id: config.id,
            name: config.name,
            type: config.type || LotteryType.MIXED,
            description: config.description || '',
            icon: config.icon || 'textures/ui/popup/fragment/spriteFrame',
            singleDrawCost: config.singleDrawCost || { itemId: 100, quantity: 100 },
            multiDrawCost: config.multiDrawCost || { itemId: 100, quantity: 1000 },
            multiDrawCount: config.multiDrawCount || 10,
            multiDrawDiscount: config.multiDrawDiscount || 0.1,
            pools: config.pools,
            maxDailyDraws: config.maxDailyDraws,
            cooldown: config.cooldown,
            guaranteeMechanic: config.guaranteeMechanic
        };

        return defaultConfig;
    }
}

export const LCM = LotteryConfigManager.instance();
