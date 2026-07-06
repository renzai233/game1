/**
 * 生产环境配置
 * 用于正式发布和运营
 */

import { IGameConfig, Platform } from './GameConfig.type';

export const prodGameConfig: IGameConfig = {
  // 环境配置
  // env: 'production',

  // API 配置
  apiUrl: '',
  apiKey: '',
  authorization: '',

  // 广告配置
  enableAd: true,
  adPlatform: Platform.DOUYIN,
  adUnitId: '',

  // 支付配置
  enablePay: true,

  // 数据配置
  useLocal: true,
  useCache: true,
  useLocalization: false,

  // 语言配置
  defaultLanguage: 'zh',
  supportedLanguages: ['zh', 'en', 'ja', 'ko'],

  platformFeatures: {
    douyinShare: {
      rewardTemplateId: '',
      defaultChannel: '',
    },
  },

  // 经济系统配置
  economy: {
    // 货币默认值
    defaultGold: 100,
    defaultGem: 10,
    defaultStamina: 30,
    maxStamina: 30,

    // 商店配置
    enableStore: true,
    enableAds: true,
    enablePayments: true,

    // 每日重置配置
    dailyResetTime: "00:00",
    enableDailyReset: true,

    // 货币获取倍率
    goldRewardMultiplier: 1.0,
    gemRewardMultiplier: 1.0,
    staminaRewardMultiplier: 1.0,

    // 商店商品配置
    storeRefreshInterval: 86400,
    adCooldownTime: 3600,

    // 调试配置
    enableDebugMode: false,
    enableInfiniteCurrency: false,
    monsterDrop: {
      enableDrop: false,
      baseDropRate: 0,
      goldDropRange: {
        min: 0,
        max: 0
      },
      gemDropRange: {
        min: 0,
        max: 0
      },
      heroFragmentDropRange: {
        min: 0,
        max: 0
      },
      rareDropRate: 0,
      bossDropMultiplier: 0
    },
    consumption: {
      talentUpgrade: {
        goldCost: 0,
        gemCost: 0,
      },
      skillUpgrade: {
        goldCost: 0,
        gemCost: 0,
      },
      heroUpgrade: {
        goldCost: 0,
        heroFragmentCost: 0
      },
      heroStarUp: {
        goldCost: 0,
        gemCost: 0,
      }
    },
    ads: {
      enableAds: false,
      adRewardGold: 0,
      adRewardGem: 0,
      adRewardStamina: 0,
      adRewardHeroFragment: 0,
      dailyAdLimit: 0,
      adCooldownSeconds: 0
    },
    payments: {
      enablePayments: false,
      packages: []
    }
  },
};
