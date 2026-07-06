import { LCM } from './LotteryConfigManager';
import { LotteryType } from './LotteryTypes';
import { ItemRarity } from '../material/ItemTypes';
import { HeroRarity } from '../../utils/data/config/hero/IHeroConfig';

interface IHeroFragmentReward {
    heroRarity: HeroRarity;
    itemRarity: ItemRarity;
    configId: number;
    weight: number;
    minQuantity: number;
    maxQuantity: number;
}

export class HeroFragmentLotteryConfig {
    private static readonly HERO_FRAGMENT_REWARDS: IHeroFragmentReward[] = [
        {
            heroRarity: 'common',
            itemRarity: ItemRarity.COMMON,
            configId: 4001,
            weight: 45,
            minQuantity: 10,
            maxQuantity: 15
        },
        {
            heroRarity: 'uncommon',
            itemRarity: ItemRarity.UNCOMMON,
            configId: 4002,
            weight: 25,
            minQuantity: 8,
            maxQuantity: 12
        },
        {
            heroRarity: 'rare',
            itemRarity: ItemRarity.RARE,
            configId: 4003,
            weight: 15,
            minQuantity: 5,
            maxQuantity: 8
        },
        {
            heroRarity: 'sr',
            itemRarity: ItemRarity.EPIC,
            configId: 4004,
            weight: 8,
            minQuantity: 3,
            maxQuantity: 5
        },
        {
            heroRarity: 'ssr',
            itemRarity: ItemRarity.LEGENDARY,
            configId: 4005,
            weight: 5,
            minQuantity: 2,
            maxQuantity: 3
        },
        {
            heroRarity: 'legendary',
            itemRarity: ItemRarity.LEGENDARY,
            configId: 4006,
            weight: 1.5,
            minQuantity: 1,
            maxQuantity: 2
        },
        {
            heroRarity: 'mythic',
            itemRarity: ItemRarity.MYTHIC,
            configId: 4007,
            weight: 0.5,
            minQuantity: 1,
            maxQuantity: 1
        }
    ];

    static createHeroFragmentSingleDrawConfig() {
        const pool = {
            poolId: 'hero_fragment_single_pool',
            name: '晶核碎片单抽池',
            rewards: this.HERO_FRAGMENT_REWARDS.map(reward => ({
                configId: reward.configId,
                minQuantity: reward.minQuantity,
                maxQuantity: reward.maxQuantity,
                weight: reward.weight,
                rarity: reward.itemRarity
            })),
            totalWeight: 100
        };

        return LCM.createCustomLotteryConfig({
            id: 'hero_fragment_single',
            name: '晶核碎片单抽',
            type: LotteryType.HERO_FRAGMENT,
            description: '消耗100棱钻抽1次，获得10个晶核碎片',
            icon: 'textures/ui/popup/fragment/spriteFrame',
            singleDrawCost: {
                itemId: 100,
                quantity: 100
            },
            multiDrawCost: {
                itemId: 100,
                quantity: 100
            },
            multiDrawCount: 1,
            multiDrawDiscount: 0,
            pools: [pool],
            maxDailyDraws: 100,
            guaranteeMechanic: {
                pityCount: 50,
                guaranteedRewardConfigId: 4005,
                guaranteedRewardQuantity: 2
            }
        });
    }

    static createHeroFragmentMultiDrawConfig() {
        const pool = {
            poolId: 'hero_fragment_multi_pool',
            name: '晶核碎片十连池',
            rewards: this.HERO_FRAGMENT_REWARDS.map(reward => ({
                configId: reward.configId,
                minQuantity: reward.minQuantity,
                maxQuantity: reward.maxQuantity,
                weight: reward.weight,
                rarity: reward.itemRarity
            })),
            totalWeight: 100
        };

        return LCM.createCustomLotteryConfig({
            id: 'hero_fragment_multi',
            name: '晶核碎片十连',
            type: LotteryType.HERO_FRAGMENT,
            description: '消耗888棱钻连抽10次，获得100个晶核碎片',
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
                guaranteedRewardConfigId: 4005,
                guaranteedRewardQuantity: 2
            }
        });
    }

    static createHeroFragmentDevDrawConfig() {
        const pool = {
            poolId: 'hero_fragment_dev_pool',
            name: '开发版晶核碎片池',
            rewards: this.HERO_FRAGMENT_REWARDS.map(reward => ({
                configId: reward.configId,
                minQuantity: reward.minQuantity,
                maxQuantity: reward.maxQuantity,
                weight: reward.weight,
                rarity: reward.itemRarity
            })),
            totalWeight: 100
        };

        return LCM.createCustomLotteryConfig({
            id: 'hero_fragment_dev',
            name: '开发版晶核碎片十连',
            type: LotteryType.HERO_FRAGMENT,
            description: '消耗888晶币连抽10次，获得100个晶核碎片（仅开发版）',
            icon: 'textures/ui/popup/fragment/spriteFrame',
            singleDrawCost: {
                itemId: 200,
                quantity: 888
            },
            multiDrawCost: {
                itemId: 200,
                quantity: 888
            },
            multiDrawCount: 10,
            multiDrawDiscount: 0,
            pools: [pool],
            maxDailyDraws: 999,
            guaranteeMechanic: {
                pityCount: 20,
                guaranteedRewardConfigId: 4007,
                guaranteedRewardQuantity: 1
            }
        });
    }

    static registerAllConfigs(): void {
        const singleConfig = this.createHeroFragmentSingleDrawConfig();
        const multiConfig = this.createHeroFragmentMultiDrawConfig();
        const devConfig = this.createHeroFragmentDevDrawConfig();

        if (singleConfig) {
            LCM.registerConfig(singleConfig);
            console.log('[HeroFragmentLotteryConfig] 已注册晶核碎片单抽配置');
        }

        if (multiConfig) {
            LCM.registerConfig(multiConfig);
            console.log('[HeroFragmentLotteryConfig] 已注册晶核碎片十连配置');
        }

        if (devConfig) {
            LCM.registerConfig(devConfig);
            console.log('[HeroFragmentLotteryConfig] 已注册开发版英雄碎片配置');
        }
    }

    static getRewardByHeroRarity(heroRarity: HeroRarity): IHeroFragmentReward | undefined {
        return this.HERO_FRAGMENT_REWARDS.find(r => r.heroRarity === heroRarity);
    }

    static getAllRewards(): IHeroFragmentReward[] {
        return [...this.HERO_FRAGMENT_REWARDS];
    }
}
