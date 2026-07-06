import { IItem, ItemRarity } from '../material/ItemTypes';

export enum LotteryType {
    HERO_FRAGMENT = 'hero_fragment',
    EQUIPMENT = 'equipment',
    MATERIAL = 'material',
    MIXED = 'mixed'
}

export enum LotteryResultType {
    SUCCESS = 'success',
    INSUFFICIENT_CURRENCY = 'insufficient_currency',
    LOTTERY_NOT_FOUND = 'lottery_not_found',
    INVALID_CONFIG = 'invalid_config',
    INVENTORY_FULL = 'inventory_full',
    UNKNOWN_ERROR = 'unknown_error'
}

export interface ILotteryCost {
    itemId: number;
    quantity: number;
}

export interface ILotteryReward {
    configId: number;
    minQuantity: number;
    maxQuantity: number;
    weight: number;
    rarity?: ItemRarity;
    guaranteed?: boolean;
}

export interface ILotteryPool {
    poolId: string;
    name: string;
    rewards: ILotteryReward[];
    totalWeight: number;
}

export interface ILotteryConfig {
    id: string;
    name: string;
    type: LotteryType;
    description: string;
    icon: string;
    singleDrawCost: ILotteryCost;
    multiDrawCost: ILotteryCost;
    multiDrawCount: number;
    multiDrawDiscount: number;
    pools: ILotteryPool[];
    maxDailyDraws?: number;
    cooldown?: number;
    guaranteeMechanic?: {
        pityCount: number;
        guaranteedRewardConfigId: number;
        guaranteedRewardQuantity: number;
    };
}

export interface ILotteryDrawResult {
    success: boolean;
    resultType: LotteryResultType;
    message?: string;
    draws: ILotterySingleDrawResult[];
    totalCost: ILotteryCost;
    pityCounter?: number;
}

export interface ILotterySingleDrawResult {
    item: IItem;
    quantity: number;
    rarity: ItemRarity;
    isGuaranteed: boolean;
    poolId: string;
}

export interface ILotteryPlayerData {
    lotteryId: string;
    totalDraws: number;
    dailyDraws: number;
    lastDrawTime: number;
    pityCounter: number;
}

export interface ILotteryStatistics {
    totalDraws: number;
    totalCost: ILotteryCost;
    rewardsByRarity: Map<ItemRarity, number>;
    rewardsByItemId: Map<number, number>;
}
