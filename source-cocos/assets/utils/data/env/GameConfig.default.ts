/**
 * 生产环境配置
 * 用于正式发布和运营
 */

import { IGameConfig, Platform } from './GameConfig.type';

export const defaultGameConfig: IGameConfig = {
    gameName: "晶核防线",
    gameIcon: 'textures/base/logo/spriteFrame',

    // 环境配置
    env: 'production',
    version: '2.0.0',
    platform: Platform.DOUYIN,
    debug: true,

    // API 配置
    apiUrl: '',
    apiKey: '',
    authorization: '',

    // 广告配置
    enableAd: true,
    adPlatform: Platform.DOUYIN,
    adUnitId: '',

    viewWidth: 750,
    viewHeight: 1334,

    // 支付配置
    enablePay: false,

    // 数据配置
    useLocal: true,
    useCache: true,
    useLocalization: true,

    // 语言配置
    defaultLanguage: 'zh',
    supportedLanguages: ['zh', 'en'],

    // 经济系统配置
    economy: {
        // 货币默认值
        defaultGold: 1000,
        defaultGem: 100,
        defaultStamina: 600,
        maxStamina: 100,

        // 商店配置
        enableStore: true,
        enableAds: true,
        enablePayments: true,

        // 每日重置配置
        dailyResetTime: "00:00",
        enableDailyReset: true,

        // 货币获取倍率
        goldRewardMultiplier: 2.0,
        gemRewardMultiplier: 2.0,
        staminaRewardMultiplier: 1.5,

        // 商店商品配置
        storeRefreshInterval: 3600,
        adCooldownTime: 300,

        // 调试配置
        enableDebugMode: true,
        enableInfiniteCurrency: true,

        // 怪物掉落配置
        monsterDrop: {
            enableDrop: true,
            baseDropRate: 0.8, // 80%基础掉落率
            goldDropRange: { min: 10, max: 50 },
            gemDropRange: { min: 1, max: 5 },
            heroFragmentDropRange: { min: 0, max: 1 },
            rareDropRate: 0.1, // 10%稀有掉落率
            bossDropMultiplier: 3.0, // Boss掉落3倍
        },

        // 消耗配置
        consumption: {
            // 天赋升级消耗
            talentUpgrade: {
                goldCost: 100,
                gemCost: 10,
            },
            // 技能升级消耗
            skillUpgrade: {
                goldCost: 200,
                gemCost: 10,
            },
            // 英雄升级消耗
            heroUpgrade: {
                goldCost: 500,
                heroFragmentCost: 10,
            },
            // 英雄升星消耗
            heroStarUp: {
                goldCost: 1000,
                gemCost: 50,
            },
        },

        // 广告配置
        ads: {
            enableAds: true,
            adRewardGold: 200,
            adRewardGem: 10,
            adRewardStamina: 10,
            dailyAdLimit: 10,
            adCooldownSeconds: 300,
            adRewardHeroFragment: 0
        },

        // 充值配置
        payments: {
            enablePayments: true,
            packages: [
                {
                    id: 'package_small',
                    name: '小礼包',
                    price: 6,
                    rewards: [
                        { type: 'coin', amount: 1000 },
                        { type: 'gem', amount: 50 },
                    ],
                },
                {
                    id: 'package_medium',
                    name: '中礼包',
                    price: 30,
                    rewards: [
                        { type: 'coin', amount: 5000 },
                        { type: 'gem', amount: 250 },
                        { type: 'heroFragment', amount: 20 },
                    ],
                },
                {
                    id: 'package_large',
                    name: '大礼包',
                    price: 98,
                    rewards: [
                        { type: 'coin', amount: 15000 },
                        { type: 'gem', amount: 800 },
                        { type: 'heroFragment', amount: 50 },
                    ],
                },
            ],
        },
    },
    // 导航栏配置
    navigation: {
        height: 176,
        bottomMargin: 34,
        buttonSpacing: 20,
        buttonSize: 104,
        iconSize: 56,
        textSize: 20,
        backgroundColor: '#2C2C2C',
        selectedColor: '#4A90E2',
        unselectedColor: '#FFFFFF',
        showButtonNames: true,
        buttons: [
            {
                id: 'shop',
                name: 'home.menu.shop',
                showName: true,
                panelPath: 'ui/shop/ShopPanel', // 指向StorePanel预制体
                feedbackType: 'scale',
                enabled: true
            },
            {
                id: 'bag',
                name: 'home.menu.bag',
                showName: true,
                panelPath: 'ui/bag/BagPanel', // 指向BagPanel预制体
                feedbackType: 'scale',
                enabled: true
            },
            {
                id: 'home',
                name: 'home.menu.home',
                showName: true,
                panelPath: 'home_scene', // 特殊标识，表示回到主页场景
                feedbackType: 'scale',
                enabled: true
            },
            {
                id: 'hero',
                'name': 'home.menu.hero',
                showName: true,
                panelPath: 'ui/hero/HeroPanel', // 指向HeroPanel预制体
                feedbackType: 'scale',
                enabled: true
            }
        ]
    },

    // 资源预加载配置
    resourcePreload: {
        enabled: true,
        maxConcurrentLoads: 3,
        enableLazyLoad: true,
        enableProgressDisplay: {
            enabled: true,
            showPercentage: true,
            showCurrentTask: true
        },
        retryConfig: {
            maxRetries: 2,
            retryDelay: 100,
            exponentialBackoff: true
        },
        priorities: {
            critical: [],
            high: [],
            normal: [],
            low: []
        }
    },

    platformFeatures: {
        douyinShare: {
            rewardTemplateId: '',
            defaultChannel: 'invite',
            title: '',
            desc: '',
            imageUrl: ''
        }
    }
};
