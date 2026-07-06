/**
 * 测试环境配置
 * 用于测试和预发布验证
 */

import { IGameConfig } from './GameConfig.type';

export const stagGameConfig: IGameConfig = {
  // 环境配置
  env: 'staging',
  debug: true,

  // API 配置
  apiUrl: 'https://staging-api.example.com/rest/v1/',
  apiKey: 'staging-api-key-789012',
  authorization: 'Bearer staging-token-ghijkl',

  // 广告配置
  enableAd: true,
  adPlatform: 'wx',
  adUnitId: 'staging-ad-unit-id',

  // 支付配置
  enablePay: true,

  // 数据配置
  useLocal: false,
  useCache: true,
  useLocalization: true,

  // 语言配置
  defaultLanguage: 'zh',
  supportedLanguages: ['zh', 'en', 'ja', 'ko'],
  navigation: undefined
};

// 导出配置管理器
export class StagingConfigManager {
  private static _instance: StagingConfigManager;
  private _config: IGameConfig;
  private _currentLanguage: string = 'zh';
  
  public static get instance(): StagingConfigManager {
    if (!this._instance) {
      this._instance = new StagingConfigManager();
    }
    return this._instance;
  }
  
  constructor() {
    this._config = stagGameConfig;
    this.initLanguage();
  }
  
  public get config(): IGameConfig {
    return this._config;
  }
  
  public get currentLanguage(): string {
    return this._currentLanguage;
  }
  
  private initLanguage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedLang = localStorage.getItem('game_language');
      if (savedLang && ['zh', 'en', 'ja', 'ko'].indexOf(savedLang) !== -1) {
        this._currentLanguage = savedLang;
      }
    }
  }
  
  public setLanguage(lang: string): void {
    if (['zh', 'en', 'ja', 'ko'].indexOf(lang) !== -1) {
      this._currentLanguage = lang;
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('game_language', lang);
      }
    }
  }
  
  public isDev(): boolean {
    return false;
  }
  
  public isStaging(): boolean {
    return true;
  }
  
  public isProd(): boolean {
    return false;
  }
  
  public setEnvironment(env: string): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('game_environment', env);
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }
  
  public getApiConfig() {
    return {
      url: this._config.apiUrl,
      key: this._config.apiKey,
      authorization: this._config.authorization
    };
  }
  
  public getAdConfig() {
    return {
      enabled: this._config.enableAd,
      platform: this._config.adPlatform,
      unitId: this._config.adUnitId
    };
  }
  
  public getPayConfig() {
    return {
      enabled: this._config.enablePay
    };
  }
} 