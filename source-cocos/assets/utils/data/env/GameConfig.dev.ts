/**
 * 开发环境配置
 * 用于本地开发和调试
 */

import { IGameConfig, Platform } from './GameConfig.type';

export const devGameConfig: IGameConfig = {
  // 环境配置
  env: 'development',
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
  enablePay: true,

  // 数据配置
  useLocal: true,
  useCache: true,
  useLocalization: true,

  // 语言配置
  defaultLanguage: 'zh',
  supportedLanguages: ['zh', 'en'],

  platformFeatures: {
    douyinShare: {
      rewardTemplateId: '',
      defaultChannel: '',
    },
  },
};
