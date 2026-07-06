/**
 * 游戏配置类型定义
 */

import { INavigationConfig } from "../../navigation";

// 环境类型
export type Environment = 'development' | 'staging' | 'production';

// 语言类型
export type Language = 'zh' | 'en' | 'ja' | 'ko';

// 平台类型
export enum Platform {
  WX = 'wx',
  DOUYIN = 'douyin',
  PC = 'pc',
  ANDROID = 'android',
  IOS = 'ios'
}

// 经济系统配置接口
export interface IEconomyConfig {
  // 货币默认值
  defaultGold: number;
  defaultGem: number;
  defaultStamina: number;
  maxStamina: number;

  // 商店配置
  enableStore: boolean;
  enableAds: boolean;
  enablePayments: boolean;

  // 每日重置配置
  dailyResetTime: string; // "00:00"
  enableDailyReset: boolean;

  // 货币获取倍率
  goldRewardMultiplier: number;
  gemRewardMultiplier: number;
  staminaRewardMultiplier: number;

  // 商店商品配置
  storeRefreshInterval: number; // 秒
  adCooldownTime: number; // 秒

  // 调试配置
  enableDebugMode: boolean;
  enableInfiniteCurrency: boolean;

  // 怪物掉落配置
  monsterDrop: {
    enableDrop: boolean;
    baseDropRate: number; // 基础掉落率 0-1
    goldDropRange: { min: number; max: number }; // 金币掉落范围
    gemDropRange: { min: number; max: number }; // 宝石掉落范围
    heroFragmentDropRange: { min: number; max: number }; // 英雄碎片掉落范围
    rareDropRate: number; // 稀有掉落率
    bossDropMultiplier: number; // Boss掉落倍率
  };

  // 消耗配置
  consumption: {
    // 天赋升级消耗
    talentUpgrade: {
      goldCost: number;
      gemCost: number;
    };
    // 技能升级消耗
    skillUpgrade: {
      goldCost: number;
      gemCost: number;
    };
    // 英雄升级消耗
    heroUpgrade: {
      goldCost: number;
      heroFragmentCost: number;
    };
    // 英雄升星消耗
    heroStarUp: {
      goldCost: number;
      gemCost: number;
    };
  };

  // 广告配置
  ads: {
    enableAds: boolean;
    adRewardGold: number;
    adRewardGem: number;
    adRewardStamina: number;
    adRewardHeroFragment: number; // 新增英雄碎片奖励
    dailyAdLimit: number;
    adCooldownSeconds: number;
  };

  // 充值配置
  payments: {
    enablePayments: boolean;
    packages: Array<{
      id: string;
      name: string;
      price: number; // 人民币价格
      rewards: Array<{
        type: string;
        amount: number;
      }>;
    }>;
  };
}

// 配置接口
export interface IGameConfig {
  gameName?: string; // 游戏名称
  gameIcon?: string; // 游戏图标
  // 环境配置
  env?: Environment;
  version?: string;
  platform?: Platform;
  debug?: boolean;

  // API 配置
  apiUrl: string;
  apiKey: string;
  authorization: string;

  // 手机信息
  phoneMac?: string;
  viewWidth?: number; // 视图宽度
  viewHeight?: number; // 视图高度
  viewScale?: number; // 视图缩放

  // 广告配置
  enableAd: boolean;
  adPlatform: string;
  adUnitId: string;

  // 支付配置
  enablePay: boolean;

  // 数据配置
  useLocal: boolean;
  useCache: boolean;
  useLocalization: boolean;

  // 语言配置
  defaultLanguage: Language;
  supportedLanguages: Language[];

  // 经济系统配置
  economy?: IEconomyConfig;

  // 导航栏配置
  navigation?: INavigationConfig;

  // 资源预加载配置
  resourcePreload?: {
    enabled: boolean;
    maxConcurrentLoads: number;
    enableLazyLoad: boolean;
    enableProgressDisplay: {
      enabled: boolean;
      showPercentage: boolean;
      showCurrentTask: boolean;
    };
    retryConfig: {
      maxRetries: number;
      retryDelay: number;
      exponentialBackoff: boolean;
    };
    priorities: {
      critical: string[]; // 立即加载的资源
      high: string[]; // 高优先级资源
      normal: string[]; // 普通优先级资源
      low: string[]; // 低优先级资源
    };
  };

  platformFeatures?: {
    douyinShare?: {
      rewardTemplateId?: string;
      defaultChannel?: string;
      title?: string;
      desc?: string;
      imageUrl?: string;
    };
  };
}
