import { Singleton } from './Singleton';
import { saveData, loadData } from '../data/config/manager/DataManager';
import { GameData } from '../data/config/manager/GameDataManager';
import { AdConfig, IAdConfigItem } from '../data/config/AdConfig';

/**
 * 伤害加成管理器
 * 负责管理通过广告获得的双倍基础伤害状态
 */
class GameDamageBoostManager extends Singleton {
    private readonly STORAGE_KEY = 'damage_boost';
    private _boostEndTime: number = 0; // 加成结束时间戳
    private _isActive: boolean = false;
    private _currentDamageScale: number = 1; // 当前伤害倍数

    /**
     * 初始化伤害加成状态
     */
    init() {
        const savedData = loadData(this.STORAGE_KEY);
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                this._boostEndTime = data.endTime || 0;
                this._currentDamageScale = data.damageScale || 1;
                this.checkBoostStatus();
            } catch (error) {
                console.error('[DamageBoostManager] 解析伤害加成数据失败:', error);
            }
        }
    }

    /**
     * 检查伤害加成状态是否有效
     */
    private checkBoostStatus(): void {
        const now = Date.now();
        if (this._boostEndTime > now) {
            this._isActive = true;
            this.applyDamageBoost();
        } else {
            this._isActive = false;
            this._currentDamageScale = 1;
            this.removeDamageBoost();
        }
    }

    /**
     * 激活双倍伤害
     * @param duration 加成时长（秒），如果不传则使用配置中的默认值
     * @returns 返回新的伤害倍数
     */
    activateBoost(duration?: number): number {
        const boostDuration = duration || this.getConfigDuration();
        const now = Date.now();
        this._boostEndTime = now + boostDuration * 1000;
        this._isActive = true;
        
        // 双倍伤害，固定为2倍
        this._currentDamageScale = 2;
        
        // 保存到本地存储
        this.saveBoostData();
        
        // 应用伤害加成
        this.applyDamageBoost();
        
        console.log(`[DamageBoostManager] 双倍伤害已激活，倍数: ${this._currentDamageScale}x，持续 ${boostDuration} 秒`);
        
        return this._currentDamageScale;
    }

    /**
     * 移除伤害加成
     */
    removeDamageBoost(): void {
        if (GameData.damageScale !== 1) {
            GameData.damageScale = 1;
            console.log('[DamageBoostManager] 伤害加成已移除');
        }
    }

    /**
     * 应用伤害加成
     */
    private applyDamageBoost(): void {
        GameData.damageScale = this._currentDamageScale;
    }

    /**
     * 获取配置中的加成时长
     */
    private getConfigDuration(): number {
        try {
            return AdConfig.damage_boost.minInterval;
        } catch {
            return 0;
        }
    }

    /**
     * 获取当前伤害倍数
     */
    getCurrentDamageScale(): number {
        return this._currentDamageScale;
    }

    /**
     * 保存加成数据到本地存储
     */
    private saveBoostData(): void {
        const data = {
            endTime: this._boostEndTime,
            damageScale: this._currentDamageScale,
        };
        saveData(this.STORAGE_KEY, JSON.stringify(data));
    }

    /**
     * 获取剩余加成时间（秒）
     */
    getRemainingTime(): number {
        this.checkBoostStatus(); // 先检查状态
        if (!this._isActive) return 0;
        const now = Date.now();
        const remaining = Math.max(0, Math.floor((this._boostEndTime - now) / 1000));
        if (remaining === 0) {
            this._isActive = false;
            this._currentDamageScale = 1;
            this.removeDamageBoost();
        }
        return remaining;
    }

    /**
     * 检查伤害加成是否激活
     */
    isBoostActive(): boolean {
        this.checkBoostStatus();
        return this._isActive;
    }

    /**
     * 更新加成状态（应在游戏循环中定期调用）
     */
    update(): void {
        if (this._isActive) {
            this.checkBoostStatus();
        }
    }
}

export const DamageBoostManager = GameDamageBoostManager.instance();

