/**
 * 经济系统环境配置
 * 根据不同环境设置不同的经济参数
 */
import { EDM } from './ConfigManager';
import { IEconomyConfig } from './GameConfig.type';

/**
 * 经济配置管理器
 */
export class EconomyConfigManager {
    private static _instance: EconomyConfigManager;
    private _config: IEconomyConfig | null = null;
    private _environment: string;
    private _initialized: boolean = false;

    private constructor() {
        this._environment = this.getEnvironment();
        // 延迟初始化配置，避免在ConfigManager未初始化时调用
        setTimeout(() => {
            this.initializeConfig();
        }, 100);
    }

    public static getInstance(): EconomyConfigManager {
        if (!this._instance) {
            this._instance = new EconomyConfigManager();
        }
        return this._instance;
    }

    /**
     * 初始化配置
     */
    private initializeConfig(): void {
        try {
            this._config = this.getConfigByEnvironment();
            this._initialized = true;
        } catch (error) {
            console.warn('[EconomyConfigManager] 配置初始化失败');
        }
    }

    /**
     * 获取当前环境
     */
    private getEnvironment(): string {
        // 从localStorage或环境变量获取
        if (typeof window !== 'undefined' && window.localStorage) {
            const env = localStorage.getItem('game_environment');
            if (env) return env;
        }
        
        // 默认使用测试环境
        return 'staging';
    }

    /**
     * 根据环境获取配置
     */
    private getConfigByEnvironment(): IEconomyConfig {
        try {
            // 从EDM获取当前环境配置
            const gameConfig = EDM.config;
            // console.log('[EconomyConfigManager] 当前环境配置:', gameConfig);
            
            if (gameConfig && gameConfig.economy) {
                return gameConfig.economy;
            }
            
            // 如果配置不完整，返回默认配置
            console.warn('[EconomyConfigManager] 配置不完整，使用默认配置');
        } catch (error) {
            console.warn('[EconomyConfigManager] 无法获取环境配置，使用默认配置:', error);
        }
    }

    /**
     * 获取当前配置（延迟初始化）
     */
    public getConfig(): IEconomyConfig {
        if (!this._config) {
            try {
                this._config = this.getConfigByEnvironment();
                this._initialized = true;
            } catch (error) {
                console.warn('[EconomyConfigManager] 获取配置失败');
            }
        }
        return this._config;
    }

    /**
     * 强制刷新配置
     */
    public refreshConfig(): void {
        this._config = null;
        this._initialized = false;
        this.getConfig(); // 重新获取配置
    }

    /**
     * 检查是否已初始化
     */
    public isInitialized(): boolean {
        return this._initialized;
    }

    /**
     * 设置环境
     */
    public setEnvironment(env: string): void {
        this._environment = env;
        this._config = null; // 重置配置，下次获取时重新初始化
        
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('game_environment', env);
        }
    }

    /**
     * 检查是否为开发环境
     */
    public isDevelopment(): boolean {
        return this._environment === 'development';
    }

    /**
     * 检查是否为测试环境
     */
    public isStaging(): boolean {
        return this._environment === 'staging';
    }

    /**
     * 检查是否为生产环境
     */
    public isProduction(): boolean {
        return this._environment === 'production';
    }

    /**
     * 获取货币默认值
     */
    public getDefaultCurrency(): { coin: number; gem: number; stamina: number; maxStamina: number } {
        const config = this.getConfig();
        return {
            coin: config.defaultGold,
            gem: config.defaultGem,
            stamina: config.defaultStamina,
            maxStamina: config.maxStamina
        };
    }

    /**
     * 获取商店配置
     */
    public getStoreConfig(): { enabled: boolean; adsEnabled: boolean; paymentsEnabled: boolean } {
        const config = this.getConfig();
        return {
            enabled: config.enableStore,
            adsEnabled: config.enableAds,
            paymentsEnabled: config.enablePayments
        };
    }

    /**
     * 获取调试配置
     */
    public getDebugConfig(): { debugMode: boolean; infiniteCurrency: boolean } {
        const config = this.getConfig();
        return {
            debugMode: config.enableDebugMode,
            infiniteCurrency: config.enableInfiniteCurrency
        };
    }

    /**
     * 获取奖励倍率
     */
    public getRewardMultipliers(): { coin: number; gem: number; stamina: number } {
        const config = this.getConfig();
        return {
            coin: config.goldRewardMultiplier,
            gem: config.gemRewardMultiplier,
            stamina: config.staminaRewardMultiplier
        };
    }

    /**
     * 获取怪物掉落配置
     */
    public getMonsterDropConfig(): any {
        const config = this.getConfig();
        return config.monsterDrop;
    }

    /**
     * 获取消耗配置
     */
    public getConsumptionConfig(): any {
        const config = this.getConfig();
        return config.consumption;
    }

    /**
     * 获取广告配置
     */
    public getAdConfig(): any {
        const config = this.getConfig();
        return config.ads;
    }

    /**
     * 获取充值配置
     */
    public getPaymentConfig(): any {
        const config = this.getConfig();
        return config.payments;
    }
}

// 导出单例实例
export const economyConfigManager = EconomyConfigManager.getInstance(); 