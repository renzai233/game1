import { CurrencyType } from "../../../common/CurrencyManager";
import { Singleton } from "../../../common/Singleton";
import { gameBus } from "../../../signal/GameBus";
import { SIGNAL_TYPES, STORAGE_KEYS } from "../../../signal/ISignal";
import { EDM } from "../../env/ConfigManager";
import { loadData, restoreMap, saveData } from "../manager/DataManager";
import { IPlayer, IAdStats } from "./IPlayer";
import { IBagItemConfig } from "db://assets/script/bag/BagConfig";
import { PLAYER_DATA } from "./PlayerConfig";

/**
 * 玩家数据管理器 - 管理玩家进度和运行时数据
 */
export class PlayerDataManager extends Singleton {
    private _playerData: IPlayer | null = null;
    private _isInitialized: boolean = false;

    /**
     * 初始化玩家数据
     */
    async initialize(): Promise<boolean> {
        if (this._isInitialized) return true;

        try {
            // 1. 尝试从本地存储加载
            const savedData = this.loadFromLocalStorage();
            console.log('[PlayerDataManager] savedData:', savedData);

            if (savedData && this.validatePlayerData(savedData)) {
                this._playerData = savedData;
                console.log('[PlayerDataManager] 从本地存储加载玩家数据');
            } else {
                // 2. 创建新玩家数据
                this._playerData = PLAYER_DATA;
                this.saveToLocalStorage();
                console.log('[PlayerDataManager] 创建新玩家数据:', this._playerData);
            }


            // 进入页面默认展示latestLevel
            this.setCurrentLevel(this._playerData.progress.latestLevel);

            // 3. 发送初始化完成信号
            gameBus.emit(SIGNAL_TYPES.PLAYER_INIT_COMPLETE, { playerData: this._playerData });

            this._isInitialized = true;
            return true;
        } catch (error) {
            console.error('[PlayerDataManager] 初始化失败:', error);
            return false;
        }
    }

    /**
     * 获取玩家数据
     */
    getPlayerData(): IPlayer | null {
        return this._playerData;
    }

    /**
     * 更新玩家数据
     */
    updatePlayerData(updates: Partial<IPlayer>): void {
        if (!this._playerData) return;

        const oldData = { ...this._playerData };
        this._playerData = { ...this._playerData, ...updates };
        this.saveToLocalStorage();

        // 发送数据更新信号
        gameBus.emit(SIGNAL_TYPES.PLAYER_DATA_UPDATED, {
            oldData,
            newData: this._playerData,
            updates
        });
    }

    /**
     * 更新货币
     */
    updateCurrency(type: CurrencyType, amount: number, reason: string = 'update'): boolean {
        if (!this._playerData) return false;

        const oldAmount = this._playerData.currencies.get(type) || 0;
        this._playerData.currencies.set(type, amount);
        this.saveToLocalStorage();

        // 发送货币变化信号
        gameBus.emit(SIGNAL_TYPES.CURRENCY_CHANGED, {
            type,
            oldAmount,
            newAmount: amount,
            changeAmount: amount - oldAmount,
            reason
        });

        return true;
    }

    /**
     * 增加货币
     */
    addCurrency(type: CurrencyType, amount: number, reason: string = 'add'): boolean {
        if (!this._playerData) return false;

        const current = this._playerData.currencies.get(type) || 0;
        return this.updateCurrency(type, current + amount, reason);
    }

    /**
     * 减少货币
     */
    subtractCurrency(type: CurrencyType, amount: number, reason: string = 'subtract'): boolean {
        if (!this._playerData) return false;

        const current = this._playerData.currencies.get(type) || 0;
        if (current < amount) {
            console.warn(`[PlayerDataManager] 货币不足: ${type}, 当前: ${current}, 需要: ${amount}`);
            return false;
        }
        return this.updateCurrency(type, current - amount, reason);
    }

    /**
     * 检查货币是否足够
     */
    hasEnoughCurrency(type: CurrencyType, amount: number): boolean {
        if (!this._playerData) return false;

        const current = this._playerData.currencies.get(type) || 0;
        return current >= amount;
    }

    /**
     * 获取当前关卡
     */
    getCurrentLevel(): number {
        return this._playerData?.progress.levelIndex;
    }

    /**
     * 设置当前关卡
     */
    setCurrentLevel(levelIndex: number): void {
        if (!this._playerData) return;

        const oldLevel = this._playerData.progress.levelIndex;
        this._playerData.progress.levelIndex = levelIndex;

        this.saveToLocalStorage();
        console.log(`[PlayerDataManager] 关卡更新: ${oldLevel} -> ${levelIndex}`);
    }

    /**
     * 获取最新关卡
     */
    getLatestLevel(): number {
        return this._playerData?.progress.latestLevel;
    }

    /**
     * 设置最新关卡
     */
    setLatestLevel(latestLevel: number): void {
        if (!this._playerData) return;
        const oldLevel = this._playerData.progress.latestLevel;
        this._playerData.progress.latestLevel = latestLevel;
        this.saveToLocalStorage();
        console.log(`[PlayerDataManager] 解锁新关卡: ${oldLevel} -> ${latestLevel}`);
    }


    // 简化 loadFromLocalStorage
    private loadFromLocalStorage(): IPlayer | null {
        try {
            const data = loadData(STORAGE_KEYS.PLAYER_DATA);
            if (!data) return null;
            let parsed = data;
            if (typeof data === 'string') parsed = JSON.parse(data);
            // 恢复 currencies
            parsed.currencies = restoreMap(parsed.currencies);
            return parsed;
        } catch (error) {
            console.error('[PlayerDataManager] 读取本地存储失败:', error);
            return null;
        }
    }

    private saveToLocalStorage(): void {
        if (!this._playerData) return;

        try {
            // 转换Map为数组以便序列化
            const dataToSave = {
                ...this._playerData,
                currencies: Array.from(this._playerData.currencies.entries())
            };

            saveData(STORAGE_KEYS.PLAYER_DATA, JSON.stringify(dataToSave));
        } catch (error) {
            console.error('[PlayerDataManager] 保存到本地存储失败:', error);
        }
    }

    private validatePlayerData(data: any): data is IPlayer {
        // 生产环境简化验证
        if (EDM.isDev()) {
            return data &&
                data.user &&
                data.progress &&
                data.currencies instanceof Map;
        }

        // 生产环境只做必要检查
        return !!(data?.user && data?.progress && data.currencies instanceof Map);
    }

    /**
     * 获取玩家等级
     */
    getPlayerLevel(): number {
        return this._playerData?.progress.playerLevel || 0;
    }

    /**
     * 获取最后登录时间
     */
    getLastLoginTime(): string {
        return this._playerData?.progress.lastLoginTime || new Date().toISOString();
    }

    /**
     * 设置最后登录时间
     */
    setLastLoginTime(time: string): void {
        if (!this._playerData) return;
        this._playerData.progress.lastLoginTime = time;
        this.saveToLocalStorage();
    }

    /**
     * 获取今天日期
     */
    getToday(): string {
        return this._playerData?.progress.today || new Date().toISOString();
    }

    /**
     * 设置今天日期
     */
    setToday(date: string): void {
        if (!this._playerData) return;
        this._playerData.progress.today = date;
        this.saveToLocalStorage();
    }

    /**
     * 获取视图缩放
     */
    getViewScale(): number {
        return this._playerData?.progress.viewScale || 1;
    }

    /**
     * 设置视图缩放
     */
    setViewScale(scale: number): void {
        if (!this._playerData) return;
        this._playerData.progress.viewScale = scale;
        this.saveToLocalStorage();
    }

    /**
     * 获取是否为广告VIP用户
     */
    getIsAdVip(): boolean {
        return this._playerData?.progress.isAdVip || false;
    }

    /**
     * 设置是否为广告VIP用户
     */
    setIsAdVip(isVip: boolean): void {
        if (!this._playerData) return;
        this._playerData.progress.isAdVip = isVip;
        this.saveToLocalStorage();
    }

    /**
     * 获取VIP等级
     */
    getVipLevel(): number {
        return this._playerData?.progress.vipLevel || 0;
    }

    /**
     * 设置VIP等级
     */
    setVipLevel(level: number): void {
        if (!this._playerData) return;
        this._playerData.progress.vipLevel = level;
        this.saveToLocalStorage();
    }

    /**
     * 获取广告观看次数
     */
    getAdCount(): number {
        return this._playerData?.progress.adCount || 0;
    }

    /**
     * 增加广告观看次数
     */
    incrementAdCount(): void {
        if (!this._playerData) return;
        this._playerData.progress.adCount++;
        this.saveToLocalStorage();
    }

    /**
     * 获取广告统计数据
     */
    getAdStats(): IAdStats {
        return this._playerData?.progress.adStats || {};
    }

    /**
     * 更新广告统计数据
     */
    updateAdStats(stats: IAdStats): void {
        if (!this._playerData) return;
        this._playerData.progress.adStats = stats;
        this.saveToLocalStorage();
    }

    /**
     * 获取背包列表
     */
    getBagList(): IBagItemConfig[] {
        return this._playerData?.bagList || [];
    }

    /**
     * 更新背包列表
     */
    updateBagList(bagList: IBagItemConfig[]): void {
        if (!this._playerData) return;
        this._playerData.bagList = bagList;
        this.saveToLocalStorage();
    }

    /**
     * 刷新玩家运行时数据（环境切换时调用）
     */
    refreshPlayerData(): void {
        if (!this._playerData) return;
        this._playerData.progress.lastLoginTime = new Date().toISOString();
        this._playerData.progress.today = new Date().toISOString();
        this.saveToLocalStorage();
    }

    /**
     * 获取福利列表
     */
    getWelfareList(): any[] {
        return null;
    }

    /**
     * 获取天赋列表
     */
    getTalentList(): any[] {
        return null;
    }
}

export const PDM = PlayerDataManager.instance();

// 监听环境切换，自动刷新玩家运行时数据
gameBus.on('environment-changed', () => {
    PDM.refreshPlayerData();
});
