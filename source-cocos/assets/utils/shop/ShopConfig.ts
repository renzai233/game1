// ShopConfig.ts

import { CurrencyType } from "../common/CurrencyManager";

// 商品类型
export enum ShopGoodsType {
    FREE_AD = 'free_ad',    // 免费+广告商品
    PURCHASE = 'purchase',   // 宝石购买商品
    LOTTERY = 'lottery'     // 抽奖商品
}

// 商品配置接口
export interface IShopGoods {
    id: number;
    name: string;
    type: ShopGoodsType;
    currencyType: CurrencyType;
    amount: number;
    freeAvailable: boolean;      // 是否可免费领取
    adAvailable: boolean;        // 是否可看广告领取
    adMaxCount?: number;         // 每日广告最大次数
    adCooldown?: number;         // 广告冷却时间（分钟）
    cost?: number;            // 宝石花费（仅限购买类商品）
    unlimited: boolean;          // 是否不限次数购买
    description: string;
    icon: string;
    lotteryId?: string;          // 抽奖ID（仅限抽奖类商品）
    devOnly?: boolean;           // 是否仅开发版可见
}

// 商品状态接口
export interface IGoodsState {
    id: number;
    freeUsed: boolean;           // 免费领取是否已使用
    adUsedCount: number;         // 今日已看广告次数
    lastAdTime: number;          // 上次看广告的时间戳
    isAvailable: boolean;        // 当前是否可领取
    countdown: number;           // 倒计时剩余秒数
}

// 商店配置数据
export const SHOP_GOODS_LIST: IShopGoods[] = [
    {
        id: 1,
        name: '金币礼包',
        type: ShopGoodsType.FREE_AD,
        currencyType: CurrencyType.Gold,
        amount: 100,
        freeAvailable: true,
        adAvailable: true,
        adMaxCount: 5,
        adCooldown: 5,
        unlimited: false,
        description: '每日首次免费，看广告可额外获得',
        icon: 'gold_icon'
    },
    {
        id: 2,
        name: '宝石礼包',
        type: ShopGoodsType.FREE_AD,
        currencyType: CurrencyType.Gem,
        amount: 12,
        freeAvailable: true,
        adAvailable: true,
        adMaxCount: 5,
        adCooldown: 10,
        unlimited: false,
        description: '每日首次免费，看广告可额外获得',
        icon: 'gem_icon'
    },
    {
        id: 3,
        name: '体力礼包',
        type: ShopGoodsType.FREE_AD,
        currencyType: CurrencyType.Stamina,
        amount: 6,
        freeAvailable: true,
        adAvailable: true,
        adMaxCount: 1,
        adCooldown: 1, // 没有间隔
        unlimited: false,
        description: '每日首次免费，看广告可额外获得',
        icon: 'energy_icon'
    },
    {
        id: 4,
        name: '体力',
        type: ShopGoodsType.PURCHASE,
        currencyType: CurrencyType.Stamina,
        amount: 6,
        cost: 10,
        freeAvailable: false,
        adAvailable: false,
        unlimited: true,
        description: '花费10宝石购买',
        icon: 'energy_icon'
    },
    {
        id: 5,
        name: '金币中包',
        type: ShopGoodsType.PURCHASE,
        currencyType: CurrencyType.Gold,
        amount: 380,
        cost: 30,
        freeAvailable: false,
        adAvailable: false,
        unlimited: true,
        description: '花费30宝石购买',
        icon: 'gold_medium'
    },
    {
        id: 6,
        name: '金币大包',
        type: ShopGoodsType.PURCHASE,
        currencyType: CurrencyType.Gold,
        amount: 1000,
        cost: 88,
        freeAvailable: false,
        adAvailable: false,
        unlimited: true,
        description: '花费88宝石购买',
        icon: 'gold_large'
    },
    {
        id: 7,
        name: '英雄碎片单抽',
        type: ShopGoodsType.LOTTERY,
        currencyType: CurrencyType.Gem,
        amount: 10,
        cost: 100,
        freeAvailable: false,
        adAvailable: false,
        unlimited: true,
        description: '消耗100宝石抽1次，获得10个英雄碎片',
        icon: 'hero_fragment_single',
        lotteryId: 'hero_fragment_single'
    },
    {
        id: 8,
        name: '英雄碎片十连抽',
        type: ShopGoodsType.LOTTERY,
        currencyType: CurrencyType.Gem,
        amount: 100,
        cost: 888,
        freeAvailable: false,
        adAvailable: false,
        unlimited: true,
        description: '消耗888宝石连抽10次，获得100个英雄碎片',
        icon: 'hero_fragment_multi',
        lotteryId: 'hero_fragment_multi'
    },
    {
        id: 9,
        name: '开发版英雄碎片十连抽',
        type: ShopGoodsType.LOTTERY,
        currencyType: CurrencyType.Gold,
        amount: 100,
        cost: 888,
        freeAvailable: false,
        adAvailable: false,
        unlimited: true,
        description: '消耗888金币连抽10次，获得100个英雄碎片（仅开发版）',
        icon: 'hero_fragment_dev',
        lotteryId: 'hero_fragment_dev',
        devOnly: true
    }
];
