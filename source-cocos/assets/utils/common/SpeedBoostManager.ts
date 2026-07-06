import { Singleton } from './Singleton';
import { saveData, loadData } from '../data/config/manager/DataManager';
import { GameData } from '../data/config/manager/GameDataManager';
import { AdConfig, IAdConfigItem } from '../data/config/AdConfig';

/**
 * 游戏加速管理器
 * 负责管理通过广告获得的游戏加速状态
 */
class GameSpeedBoostManager extends Singleton {
    private readonly STORAGE_KEY = 'speed_boost';
    private _boostEndTime: number = 0; // 加速结束时间戳
    private _isActive: boolean = false;
    private _currentSpeedScale: number = 1; // 当前加速倍数

    /**
     * 初始化加速状态
     */
    init() {
        const savedData = loadData(this.STORAGE_KEY);
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                this._boostEndTime = data.endTime || 0;
                this._currentSpeedScale = data.speedScale || 1;
                this.checkBoostStatus();
            } catch (error) {
                console.error('[SpeedBoostManager] 解析加速数据失败:', error);
            }
        }
    }

    /**
     * 检查加速状态是否有效
     */
    private checkBoostStatus(): void {
        const now = Date.now();
        if (this._boostEndTime > now) {
            this._isActive = true;
            this.applySpeedBoost();
        } else {
            this._isActive = false;
            this._currentSpeedScale = 1;
            this.removeSpeedBoost();
        }
    }

    /**
     * 激活游戏加速
     * @param duration 加速时长（秒），如果不传则使用配置中的默认值
     * @returns 返回新的加速倍数
     */
    activateBoost(duration?: number): number {
        const boostDuration = duration || this.getConfigDuration();
        const now = Date.now();
        this._boostEndTime = now + boostDuration * 1000;
        this._isActive = true;
        
        // 获取最大加速倍数
        const maxSpeedScale = this.getMaxSpeedScale();
        
        // 每次加1，不超过最大倍数
        if (this._currentSpeedScale < maxSpeedScale) {
            this._currentSpeedScale += 1;
        } else {
            // 如果已达到最大倍数，重置时间但保持倍数
            console.log(`[SpeedBoostManager] 已达到最大加速倍数 ${maxSpeedScale}，延长加速时间`);
        }
        
        // 保存到本地存储
        this.saveBoostData();
        
        // 应用加速
        this.applySpeedBoost();
        
        console.log(`[SpeedBoostManager] 游戏加速已激活，倍数: ${this._currentSpeedScale}x，持续 ${boostDuration} 秒`);
        
        return this._currentSpeedScale;
    }

    /**
     * 移除游戏加速
     */
    removeSpeedBoost(): void {
        if (GameData.speedScale !== 1) {
            GameData.speedScale = 1;
            console.log('[SpeedBoostManager] 游戏加速已移除');
        }
    }

    /**
     * 应用游戏加速
     */
    private applySpeedBoost(): void {
        GameData.speedScale = this._currentSpeedScale;
    }

    /**
     * 获取配置中的加速时长
     */
    private getConfigDuration(): number {
        try {
            return AdConfig.speed_boost.minInterval;
        } catch {
            return 0;
        }
    }

    /**
     * 获取配置中的最大加速倍数
     */
    private getMaxSpeedScale(): number {
        try {
            return AdConfig.speed_boost.maxSpeedScale;
        } catch {
            return 1;
        }
    }

    /**
     * 获取当前加速倍数
     */
    getCurrentSpeedScale(): number {
        return this._currentSpeedScale;
    }

    /**
     * 保存加速数据到本地存储
     */
    private saveBoostData(): void {
        const data = {
            endTime: this._boostEndTime,
            speedScale: this._currentSpeedScale,
        };
        saveData(this.STORAGE_KEY, JSON.stringify(data));
    }

    /**
     * 获取剩余加速时间（秒）
     */
    getRemainingTime(): number {
        this.checkBoostStatus(); // 先检查状态
        if (!this._isActive) return 0;
        const now = Date.now();
        const remaining = Math.max(0, Math.floor((this._boostEndTime - now) / 1000));
        if (remaining === 0) {
            this._isActive = false;
            this._currentSpeedScale = 1;
            this.removeSpeedBoost();
        }
        return remaining;
    }

    /**
     * 检查加速是否激活
     */
    isBoostActive(): boolean {
        this.checkBoostStatus();
        return this._isActive;
    }

    /**
     * 更新加速状态（应在游戏循环中定期调用）
     */
    update(): void {
        if (this._isActive) {
            this.checkBoostStatus();
        }
    }
}

export const SpeedBoostManager = GameSpeedBoostManager.instance();