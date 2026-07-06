/**
 * 配置管理器
 * 统一管理环境和语言配置
 */
import { IGameConfig, Language } from './GameConfig.type';
import { languageDataManager } from '../language/LanguageDataManager';
import { Singleton } from '../../common/Singleton';
import { defaultGameConfig } from './GameConfig.default';
import { prodGameConfig } from './GameConfig.prod';
import { devGameConfig } from './GameConfig.dev';
import { economyConfigManager } from './EconomyConfig';
import { ConfigUtils } from './ConfigUtils';

export class ConfigManager extends Singleton {
  // 修改这里调整当前环境: dev prod stag
  private _initEnv: string = 'prod';

  private _currentLanguage: Language = 'zh';
  private _config: IGameConfig | null = null;

  /**
   * 获取当前环境的配置
   */
  private getEnvironmentConfig(): Partial<IGameConfig> {
    // 这里可以根据构建环境、URL参数等动态选择配置
    // 示例：根据环境变量或构建参数选择
    switch (this._initEnv) {
      case 'dev':
        return devGameConfig;
      case 'prod':
        return prodGameConfig;
      case 'stag':
        // 可以添加测试环境配置
        return defaultGameConfig; // 临时使用开发配置
      default:
        return defaultGameConfig;
    }
  }

  /**
   * 初始化配置系
   */
  async init() {
    if (this._initEnv === 'dev') console.log('🚀 初始化环境配置...');
    // 根据环境选择配置
    const envConfig = this.getEnvironmentConfig();

    // 合并配置：环境配置覆盖默认配置
    const mergedConfig = ConfigUtils.mergeConfig(defaultGameConfig, envConfig);
    this.setConfig(mergedConfig);

    economyConfigManager.refreshConfig(); // 刷新经济配置
    this.initLanguage(); // 初始化语言设置
    if (this._initEnv === 'dev') { this.logConfig(); }
  }

  /**
   * 设置配置
   */
  setConfig(config: IGameConfig): void { this._config = config; }

  /**
   * 获取当前环境配置
   */
  get config(): IGameConfig {
    if (!this._config) {
      if (this._initEnv === 'dev') console.warn('[ConfigManager] 配置未初始化，使用默认配置');
      return ConfigUtils.mergeConfig(defaultGameConfig, this.getEnvironmentConfig());
    }
    return this._config;
  }


  /**
   * 手动切换环境（用于调试）
   */
  setEnvironment(env: 'development' | 'production' | 'staging'): void {
    let envConfig: Partial<IGameConfig>;

    switch (env) {
      case 'production':
        envConfig = prodGameConfig;
        break;
      case 'staging':
        envConfig = defaultGameConfig; // 临时使用开发配置
        break;
      case 'development':
      default:
        envConfig = devGameConfig;
    }

    this._config = ConfigUtils.mergeConfig(defaultGameConfig, envConfig);

    // 保存环境到本地存储
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('game_environment', env);
    }

    if (this._initEnv === 'dev') console.log(`🔄 环境已切换为: ${env}`);
    this.logConfig();
  }

  /**
   * 获取当前语言
   */
  get currentLanguage(): Language {
    return this._currentLanguage;
  }

  /**
   * 设置当前语言
   */
  setLanguage(lang: Language): void {
    // 验证语言是否支持
    if (!this.isLanguageSupported(lang)) {
      if (this._initEnv === 'dev') console.warn(`⚠️ 不支持的语言: ${lang}`);
      return;
    }

    this._currentLanguage = lang;

    // 保存到本地存储（仅在浏览器环境中）
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('language', lang);
    }

    if (this._initEnv === 'dev') console.log(`🌍 语言已设置为: ${lang}`);
  }

  /**
   * 初始化语言设置
   */
  initLanguage(): void {
    // 从本地存储读取语言设置（仅在浏览器环境中）
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedLang = localStorage.getItem('language') as Language;
      if (savedLang && this.isLanguageSupported(savedLang)) {
        this._currentLanguage = savedLang;
      } else {
        // 使用配置中的默认语言
        this._currentLanguage = this._config?.defaultLanguage || 'zh';
        if (this._initEnv === 'dev') console.log(`🌍 使用默认语言: ${this._currentLanguage}`);
      }
    } else {
      // 在非浏览器环境中，使用配置中的默认语言
      this._currentLanguage = this._config?.defaultLanguage || 'zh';
    }
  }

  /**
   * 获取翻译文本
   */
  getText(key: string): string {
    return languageDataManager.getText(key, this._currentLanguage);
  }

  getTextByLang(key: string, lang: Language): string {
    return languageDataManager.getText(key, lang);
  }

  getSupportedLanguages(): Language[] {
    return languageDataManager.getSupportedLanguages().map((lang: any) => lang.code);
  }

  isLanguageSupported(lang: string): boolean {
    return languageDataManager.isLanguageSupported(lang);
  }

  getLanguageDict(lang: Language) {
    return (languageDataManager as any)._languageData[lang] || (languageDataManager as any)._languageData['zh'];
  }

  /**
   * 切换到下一个语言
   */
  switchToNextLanguage(): Language {
    const languages = this.getSupportedLanguages();
    const currentIndex = languages.indexOf(this._currentLanguage);
    const nextIndex = (currentIndex + 1) % languages.length;
    const nextLanguage = languages[nextIndex];

    this.setLanguage(nextLanguage);
    return nextLanguage;
  }

  /**
   * 获取语言显示名称
   */
  getLanguageDisplayName(language: Language): string {
    return (languageDataManager as any).getLanguageDisplayName(language, true);
  }

  /**
   * 获取当前语言的显示名称
   */
  getCurrentLanguageDisplayName(): string {
    return this.getLanguageDisplayName(this._currentLanguage);
  }

  /**
   * 检查是否为开发环境
   */
  isDev(): boolean {
    return this.config.env === 'development';
  }

  /**
   * 检查是否为测试环境
   */
  isStaging(): boolean {
    return this.config.env === 'staging';
  }

  /**
   * 检查是否为生产环境
   */
  isProd(): boolean {
    return this.config.env === 'production';
  }

  /**
   * 获取API配置
   */
  getApiConfig() {
    return {
      url: this.config.apiUrl,
      key: this.config.apiKey,
      authorization: this.config.authorization
    };
  }

  /**
   * 获取广告配置
   */
  getAdConfig() {
    return {
      enabled: this.config.enableAd,
      platform: this.config.adPlatform,
      unitId: this.config.adUnitId
    };
  }

  /**
   * 获取支付配置
   */
  getPaymentConfig() {
    return {
      enabled: this.config.enablePay
    };
  }

  /**
   * 获取游戏配置
   */
  getGameConfig() {
    return {
      defaultGold: this.config.economy.defaultGold,
      defaultGem: this.config.economy.defaultGem,
      maxStamina: this.config.economy.maxStamina,
      defaultLanguage: this.config.defaultLanguage,
      supportedLanguages: this.config.supportedLanguages
    };
  }

  /**
   * 获取性能配置
   */
  getPerformanceConfig() {
    return {
      debug: this.config.debug,
      useLocal: this.config.useLocal,
      useCache: this.config.useCache
    };
  }

  /**
   * 获取远程配置
   */
  getRemoteConfig() {
    return {
      apiUrl: this.config.apiUrl,
      apiKey: this.config.apiKey
    };
  }

  /**
   * 获取数据配置
   */
  getDataConfig() {
    return {
      useLocal: this.config.useLocal,
      useCache: this.config.useCache,
      defaultLanguage: this.config.defaultLanguage
    };
  }

  /**
   * 打印当前配置信息
   */
  logConfig(): void {
    console.log('=== 当前配置信息 ===');
    console.log(`环境: ${this.config.env}`);
    console.log(`调试模式: ${this.config.debug}`);
    console.log(`API地址: ${this.config.apiUrl}`);
    console.log(`广告启用: ${this.config.enableAd}`);
    console.log(`支付启用: ${this.config.enablePay}`);
    console.log(`默认语言: ${this.config.defaultLanguage}`);
    console.log(`当前语言: ${this._currentLanguage}`);
    console.log('==================');
  }
}

// 导出单例实例
export const EDM = ConfigManager.instance(); 