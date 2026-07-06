/**
 * 配置切换工具 - 用于在游戏中切换环境配置
 */

import { EDM } from './ConfigManager';
import { devGameConfig as gcd } from './GameConfig.dev';
import { stagGameConfig as gcs } from './GameConfig.staging';
import { prodGameConfig as gcp } from './GameConfig.prod';
import { IGameConfig } from './GameConfig.type';

// 环境配置映射
const environmentConfigs = {
  development: gcd,
  staging: gcs,
  production: gcp,
};

export class ConfigSwitcher {

  /**
   * 切换到开发环境
   */
  public static switchToDev(): void {
    console.log('🔄 切换到开发环境...');
    const config = environmentConfigs.development as unknown as IGameConfig;
    EDM.setConfig(config);
    this.saveEnvironmentToStorage('development');
    console.log('✅ 已切换到开发环境');
  }

  /**
   * 切换到测试环境
   */
  public static switchToStaging(): void {
    console.log('🔄 切换到测试环境...');
    const config = environmentConfigs.staging as unknown as IGameConfig;
    EDM.setConfig(config);
    this.saveEnvironmentToStorage('staging');
    console.log('✅ 已切换到测试环境');
  }

  /**
   * 切换到生产环境
   */
  public static switchToProd(): void {
    console.log('🔄 切换到生产环境...');
    const config = environmentConfigs.production as unknown as IGameConfig;
    EDM.setConfig(config);
    this.saveEnvironmentToStorage('production');
    console.log('✅ 已切换到生产环境');
  }

  /**
   * 通过 URL 参数切换环境
   * 使用方法：在浏览器地址栏添加 ?env=development 或 ?env=staging 或 ?env=production
   */
  public static switchByUrl(): void {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const envParam = urlParams.get('env');

      if (envParam && ['development', 'staging', 'production'].indexOf(envParam) !== -1) {
        console.log(`🔄 通过 URL 参数切换到 ${envParam} 环境...`);
        const config = environmentConfigs[envParam as keyof typeof environmentConfigs] as unknown as IGameConfig;
        EDM.setConfig(config);
        this.saveEnvironmentToStorage(envParam);
        console.log(`✅ 已切换到 ${envParam} 环境`);
      }
    }
  }

  /**
   * 保存环境设置到本地存储
   */
  private static saveEnvironmentToStorage(env: string): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('game_environment', env);
    }
  }

  /**
   * 显示当前环境信息
   */
  public static showCurrentEnvironment(): void {
    try {
      const env = EDM.config.env;
      const debug = EDM.config.debug;
      const apiUrl = EDM.config.apiUrl;

      console.log('📋 当前环境信息:');
      console.log(`  环境: ${env}`);
      console.log(`  调试模式: ${debug}`);
      console.log(`  API地址: ${apiUrl}`);
      console.log(`  当前语言: ${EDM.currentLanguage}`);
    } catch (error) {
      console.log('❌ 配置未初始化');
    }
  }

  /**
   * 显示所有可用的环境配置
   */
  public static showAllEnvironments(): void {
    console.log('📋 可用环境配置:');
    console.log('  1. 开发环境 (development)');
    console.log('     - 调试模式: 开启');
    console.log('     - 广告: 关闭');
    console.log('     - 支付: 关闭');
    console.log('     - 本地数据: 开启');
    console.log('');
    console.log('  2. 测试环境 (staging)');
    console.log('     - 调试模式: 开启');
    console.log('     - 广告: 开启');
    console.log('     - 支付: 关闭');
    console.log('     - 本地数据: 关闭');
    console.log('');
    console.log('  3. 生产环境 (production)');
    console.log('     - 调试模式: 关闭');
    console.log('     - 广告: 开启');
    console.log('     - 支付: 开启');
    console.log('     - 本地数据: 关闭');
  }

  /**
   * 初始化环境配置
   */
  public static initEnvironment(): void {
    // 尝试从本地存储读取环境设置
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedEnv = localStorage.getItem('game_environment');
      if (savedEnv && ['development', 'staging', 'production'].indexOf(savedEnv) !== -1) {
        const config = environmentConfigs[savedEnv as keyof typeof environmentConfigs] as unknown as IGameConfig;
        EDM.setConfig(config);
        console.log(`🔄 从本地存储恢复环境: ${savedEnv}`);
        return;
      }
    }

    // 尝试从 URL 参数读取环境设置
    this.switchByUrl();
  }
}

// 导出便捷方法
export const switchToDev = ConfigSwitcher.switchToDev;
export const switchToStaging = ConfigSwitcher.switchToStaging;
export const switchToProd = ConfigSwitcher.switchToProd;
export const showCurrentEnv = ConfigSwitcher.showCurrentEnvironment; 