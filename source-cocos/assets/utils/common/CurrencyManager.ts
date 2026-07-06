/**
 * 货币管理器
 * 统一管理游戏中的所有货币操作和游戏资源
 */

import { gameBus } from '../signal/GameBus';
import { loadData, saveData } from '../data/config/manager/DataManager';
import { economyConfigManager } from '../data/env/EconomyConfig';
import { EDM } from '../data/env/ConfigManager';
import { SIGNAL_TYPES } from '../signal/ISignal';
import { HDM } from '../data/config/hero/HeroDataManager';
import { Singleton } from './Singleton';

// 货币类型枚举 - 只保留实际使用的核心货币类型

export enum CurrencyType {
    Gold = 'gold',
    Gem = 'gem',
    Tinder = 'tinder',
    Stamina = 'stamina',
    MaxStamina = 'maxStamina',
    HeroFragment = 'heroFragment',
    HeroHead = 'hero_',
    Stars = "stars",
    EXP = 'exp',
    AD = 'ad',
    SHARE = 'share'
}

export interface ICurrencyNumber {
    type: CurrencyType; // 资源类型
    amount: number;  // 资源数量
    desc?: string;  // 资源描述
}

// 货币配置接口
export interface ICurrencyConfig {
    type: CurrencyType;
    name: string;
    icon: string;
    maxAmount?: number; // 最大数量限制
    minAmount?: number; // 最小数量限制
    defaultValue: any; // 默认值
}

// 货币变化事件数据
export interface ICurrencyChangeEvent {
    type: CurrencyType;
    oldAmount: any;
    newAmount: any;
    changeAmount?: number;
    reason: string;
}

/**
 * 货币管理器类
 */
export class CurrencyDataManager extends Singleton {
    private _currencies: Map<CurrencyType, any> = new Map();
    private _configs: Map<CurrencyType, ICurrencyConfig> = new Map();

    async init() {
        this.initCurrencyConfigs();
        this.loadCurrencies();
    }

    /**
     * 初始化货币配置
     */
    private initCurrencyConfigs(): void {
        const configs: ICurrencyConfig[] = [
            {
                type: CurrencyType.Gold,
                name: '金币',
                icon: 'icon_coin',
                defaultValue: 100,
                minAmount: 0
            },
            {
                type: CurrencyType.Stamina,
                name: '体力',
                icon: 'icon_stamina',
                defaultValue: 30,
                maxAmount: 30,
                minAmount: 0
            },
            {
                type: CurrencyType.MaxStamina,
                name: '最大体力',
                icon: 'icon_max_stamina',
                defaultValue: 30,
                minAmount: 0
            },
            {
                type: CurrencyType.Gem,
                name: '宝石',
                icon: 'icon_gem',
                defaultValue: 50,
                minAmount: 0
            },
            {
                type: CurrencyType.HeroFragment,
                name: '英雄碎片',
                icon: 'icon_hero_fragment',
                defaultValue: 0,
                minAmount: 0
            }
        ];

        configs.forEach(config => {
            this._configs.set(config.type, config);
        });

        // 延迟更新配置值
        this.updateConfigFromEnvironment();
    }

    /**
     * 从环境配置更新货币配置
     */
    private updateConfigFromEnvironment(): void {
        try {
            // 检查配置管理器是否可用
            if (!economyConfigManager) {
                console.warn('[CurrencyDataManager] 配置管理器不可用，使用默认值');
                return;
            }

            // 如果配置管理器已初始化，直接更新
            if (economyConfigManager.isInitialized()) {
                this.updateConfigFromManager();
                return;
            }

            // 如果配置管理器未初始化，使用默认值并设置延迟更新
            setTimeout(() => {
                this.updateConfigFromEnvironment();
            }, 1000);
        } catch (error) {
            console.warn('[CurrencyDataManager] 无法从环境配置更新，使用默认值:', error);
        }
    }

    /**
     * 从配置管理器更新配置
     */
    private updateConfigFromManager(): void {
        try {
            const defaultCurrency = economyConfigManager.getDefaultCurrency();

            // 更新金币配置
            const goldConfig = this._configs.get(CurrencyType.Gold);
            if (goldConfig) {
                goldConfig.defaultValue = defaultCurrency.coin;
            }

            // 更新钻石配置
            const gemConfig = this._configs.get(CurrencyType.Gem);
            if (gemConfig) {
                gemConfig.defaultValue = defaultCurrency.gem;
            }

            // 更新体力配置
            const staminaConfig = this._configs.get(CurrencyType.Stamina);
            if (staminaConfig) {
                staminaConfig.defaultValue = defaultCurrency.stamina;
                staminaConfig.maxAmount = defaultCurrency.maxStamina;
            }
        } catch (error) {
            console.warn('[CurrencyDataManager] 配置更新失败:', error);
        }
    }

    /**
     * 加载货币数据
     */
    private loadCurrencies(): void {
        const currencyKeys = Object.keys(CurrencyType);
        currencyKeys.forEach(key => {
            const type = CurrencyType[key as keyof typeof CurrencyType];
            const config = this._configs.get(type);
            if (!config) return;

            const savedAmount = loadData(type);
            let amount;

            if (savedAmount && savedAmount !== 'null') {
                try {
                    amount = JSON.parse(savedAmount);
                } catch {
                    console.warn(`[CurrencyDataManager] 解析保存的数据失败: ${type} = ${savedAmount}`);
                    amount = config.defaultValue;
                }
            } else {
                amount = config.defaultValue;
            }

            this._currencies.set(type, amount);
        });
    }

    /**
     * 刷新配置并重新加载货币
     */
    public refreshConfig(): void {
        this.updateConfigFromEnvironment();
        this.loadCurrencies();
        // this.syncWithGlobalData();
    }

    /**
     * 保存货币数据
     */
    private saveCurrency(type: CurrencyType): void {
        const value = this._currencies.get(type);
        if (value !== undefined) {
            saveData(type, JSON.stringify(value));
        }
    }

    /**
     * 获取货币数量
     */
    public getCurrency(type: CurrencyType): any {
        return this._currencies.get(type) || 0;
    }

    /**
     * 金币数据
     */
    public getCoin() {
        return this.getCurrency(CurrencyType.Gold);
    }

    /**
     * 宝石数据
     */
    public getGem() {
        return this.getCurrency(CurrencyType.Gem);
    }

    /**
     * 体力数据
     */
    public getStamina() {
        return this.getCurrency(CurrencyType.Stamina);
    }

    /**
     * 最大体力
     */
    public getMaxStamina() {
        return this.getCurrency(CurrencyType.MaxStamina);
    }

    /**
     * 设置货币数量
     */
    public setCurrency(type: CurrencyType, amount: any, reason: string = 'set'): boolean {
        const config = this._configs.get(type);
        if (!config) {
            console.error(`[CurrencyDataManager] 未找到货币配置: ${type}`);
            return false;
        }

        const oldAmount = this._currencies.get(type) || config.defaultValue;

        // 应用限制（仅对数字类型）
        let newAmount = amount;
        if (typeof amount === 'number' && typeof oldAmount === 'number') {
            if (config.minAmount !== undefined && newAmount < config.minAmount) {
                newAmount = config.minAmount;
            }
            // 体力特殊处理：允许超过最大值上限
            if (type !== CurrencyType.Stamina && config.maxAmount !== undefined && newAmount > config.maxAmount) {
                newAmount = config.maxAmount;
            }
        }

        this._currencies.set(type, newAmount);
        this.saveCurrency(type);

        // 发送货币变化事件
        const changeEvent: ICurrencyChangeEvent = {
            type,
            oldAmount,
            newAmount,
            changeAmount: typeof newAmount === 'number' && typeof oldAmount === 'number' ? newAmount - oldAmount : undefined,
            reason
        };

        // 发送资源变化事件（兼容旧系统）
        gameBus.emit(SIGNAL_TYPES.CURRENCY_CHANGED, changeEvent);
        if (EDM.isDev()) console.log(`[CurrencyDataManager] ${config.name} ${reason}: ${oldAmount} -> ${newAmount}`);
        return true;
    }

    /**
     * 增加货币
     */
    public addCurrency(type: CurrencyType, amount: number, reason: string = 'add'): boolean {
        const currentAmount = this.getCurrency(type);
        if (typeof currentAmount === 'number') {
            return this.setCurrency(type, currentAmount + amount, reason);
        }
        return false;
    }

    /**
     * 减少货币
     */
    public subtractCurrency(type: CurrencyType, amount: number, reason: string = 'subtract'): boolean {
        const currentAmount = this.getCurrency(type);
        if (typeof currentAmount === 'number') {
            return this.setCurrency(type, currentAmount - amount, reason);
        }
        return false;
    }

    /**
     * 检查是否有足够货币
     */
    public hasEnoughCurrency(type: CurrencyType, amount: number): boolean {
        const current = this.getCurrency(type);
        return typeof current === 'number' && current >= amount;
    }

    /**
     * 获取货币配置
     */
    public getCurrencyConfig(type: CurrencyType): ICurrencyConfig | undefined {
        return this._configs.get(type);
    }

    /**
     * 获取所有货币配置
     */
    public getAllCurrencyConfigs(): ICurrencyConfig[] {
        return Array.from(this._configs.values());
    }

    /**
     * 获取所有货币数据
     */
    public getAllCurrencies(): Map<CurrencyType, any> {
        return new Map(this._currencies);
    }

    /**
     * 重置所有货币到默认值
     */
    public resetAllCurrencies(): void {
        this._currencies.clear();
        this.loadCurrencies();
        // this.syncWithGlobalData();
        if (EDM.isDev()) console.log('[CurrencyDataManager] 所有货币已重置到默认值');
    }

    /**
     * 货币兑换
     */
    public exchangeCurrency(
        fromType: CurrencyType,
        fromAmount: number,
        toType: CurrencyType,
        toAmount: number,
        reason: string = 'exchange'
    ): boolean {
        // 检查源货币是否足够
        if (!this.hasEnoughCurrency(fromType, fromAmount)) {
            console.warn(`[CurrencyDataManager] 货币不足，无法兑换: ${fromType} ${fromAmount}`);
            return false;
        }

        // 执行兑换
        const success1 = this.subtractCurrency(fromType, fromAmount, `${reason}_from`);
        const success2 = this.addCurrency(toType, toAmount, `${reason}_to`);

        return success1 && success2;
    }

    /**
     * 批量货币操作
     */
    public batchCurrencyOperation(operations: Array<{
        type: CurrencyType;
        amount: any;
        operation: 'add' | 'subtract' | 'set';
        reason: string;
    }>): boolean {
        // 先检查所有操作是否可行
        for (const op of operations) {
            if (op.operation === 'subtract') {
                if (!this.hasEnoughCurrency(op.type, op.amount)) {
                    console.warn(`[CurrencyDataManager] 批量操作失败，货币不足: ${op.type} ${op.amount}`);
                    return false;
                }
            }
        }

        // 执行所有操作
        let allSuccess = true;
        for (const op of operations) {
            let success = false;
            switch (op.operation) {
                case 'add':
                    success = this.addCurrency(op.type, op.amount, op.reason);
                    break;
                case 'subtract':
                    success = this.subtractCurrency(op.type, op.amount, op.reason);
                    break;
                case 'set':
                    success = this.setCurrency(op.type, op.amount, op.reason);
                    break;
            }
            if (!success) {
                allSuccess = false;
            }
        }

        return allSuccess;
    }

    /**
     * 获取英雄碎片数量（委托给HDM）
     */
    public getHeroFragmentCount(heroId: number): number {
        return HDM.getHeroFragmentCount(heroId);
    }

    /**
     * 设置英雄碎片数量（委托给HDM）
     */
    public setHeroFragmentCount(heroId: number, fragmentCount: number, reason: string = 'set'): boolean {
        try {
            const runtimeData = HDM.getHeroRuntimeData(heroId);
            const oldFragmentCount = runtimeData?.fragment || 0;
            
            HDM.updateHero(heroId, { fragment: fragmentCount });
            
            if (EDM.isDev()) console.log(`[CurrencyDataManager] 英雄${heroId}碎片 ${reason}: ${oldFragmentCount} -> ${fragmentCount}`);
            return true;
        } catch (error) {
            console.error(`[CurrencyDataManager] 设置英雄碎片失败:`, error);
            return false;
        }
    }

    /**
     * 增加英雄碎片数量（委托给HDM）
     */
    public addHeroFragmentCount(heroId: number, amount: number, reason: string = 'add'): boolean {
        try {
            const currentCount = this.getHeroFragmentCount(heroId);
            return this.setHeroFragmentCount(heroId, currentCount + amount, reason);
        } catch (error) {
            console.error(`[CurrencyDataManager] 增加英雄碎片失败:`, error);
            return false;
        }
    }

    /**
     * 发放英雄碎片奖励并触发碎片事件
     */
    public rewardHeroFragment(heroId: number, amount: number, reason: string = "reward"): boolean {
        const success = this.addHeroFragmentCount(heroId, amount, reason);
        if (success) {
            gameBus.emit(SIGNAL_TYPES.HERO_FRAGMENT_ADDED, {
                heroId,
                addedFragment: amount,
                totalFragment: this.getHeroFragmentCount(heroId),
                reason
            });
        }
        return success;
    }

    /**
     * 减少英雄碎片数量（委托给HDM）
     */
    public subtractHeroFragmentCount(heroId: number, amount: number, reason: string = 'subtract'): boolean {
        try {
            const currentCount = this.getHeroFragmentCount(heroId);
            return this.setHeroFragmentCount(heroId, currentCount - amount, reason);
        } catch (error) {
            console.error(`[CurrencyDataManager] 减少英雄碎片失败:`, error);
            return false;
        }
    }

    /**
     * 检查英雄是否有足够碎片（委托给HDM）
     */
    public hasEnoughHeroFragment(heroId: number, amount: number): boolean {
        try {
            const current = this.getHeroFragmentCount(heroId);
            return current >= amount;
        } catch (error) {
            console.error(`[CurrencyDataManager] 检查英雄碎片失败:`, error);
            return false;
        }
    }
}

// 导出单例实例
export const CDM = CurrencyDataManager.instance();
