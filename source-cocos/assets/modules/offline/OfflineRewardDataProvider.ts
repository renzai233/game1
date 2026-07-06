import { resManager } from 'db://assets/utils/data/config/manager/ResourceManager';
import { loadData, saveData } from 'db://assets/utils/data/config/manager/DataManager';
import { STORAGE_KEYS } from 'db://assets/utils/signal/ISignal';
import { DEFAULT_OFFLINE_CONFIG, OfflineRewardConfig, OfflineRewardRateEntry, OfflineRewardState } from './core/OfflineRewardTypes';

interface QuickPatrolState {
    date: string;
    count: number;
}

// 离线奖励数据提供者：负责读取配置/收益表，并管理本地存储状态
export class OfflineRewardDataProvider {
    private _config: OfflineRewardConfig | null = null; // 缓存的离线配置
    private _configLoading: Promise<OfflineRewardConfig> | null = null; // 配置加载中的Promise
    private _rateTable: OfflineRewardRateEntry[] | null = null; // 缓存的每小时收益表
    private _rateLoading: Promise<OfflineRewardRateEntry[]> | null = null; // 收益表加载中的Promise

    // 读取离线配置（加载一次后缓存）
    async loadConfig(): Promise<OfflineRewardConfig> {
        if (this._config) return this._config;
        if (this._configLoading) return this._configLoading;

        this._configLoading = resManager()
            .loadConfig<OfflineRewardConfig[]>('game/offline_rewards', 'configs')
            .then(list => {
                const config = Array.isArray(list) && list.length > 0 ? list[0] : null;
                this._config = config ? { ...DEFAULT_OFFLINE_CONFIG, ...config } : { ...DEFAULT_OFFLINE_CONFIG };
                this._configLoading = null;
                return this._config;
            })
            .catch(error => {
                console.error('[OfflineRewardDataProvider] 加载离线配置失败，使用默认配置:', error);
                this._config = { ...DEFAULT_OFFLINE_CONFIG };
                this._configLoading = null;
                return this._config;
            });

        return this._configLoading;
    }

    // 读取每小时收益表（加载一次后缓存）
    async loadRateTable(): Promise<OfflineRewardRateEntry[]> {
        if (this._rateTable) return this._rateTable;
        if (this._rateLoading) return this._rateLoading;

        this._rateLoading = resManager()
            .loadConfig<OfflineRewardRateEntry[]>('game/offline_rewards_table', 'configs')
            .then(list => {
                this._rateTable = Array.isArray(list) ? list : [];
                this._rateLoading = null;
                return this._rateTable;
            })
            .catch(error => {
                console.error('[OfflineRewardDataProvider] 加载离线收益表失败:', error);
                this._rateTable = [];
                this._rateLoading = null;
                return this._rateTable;
            });

        return this._rateLoading;
    }

    // 根据最大关卡索引获取收益表行（精确匹配，否则向下回退）
    getRateForLevel(table: OfflineRewardRateEntry[], levelIndex: number): OfflineRewardRateEntry | null {
        if (!Array.isArray(table) || table.length === 0) return null;
        const exact = table.find(entry => Number(entry.levelIndex) === Number(levelIndex));
        if (exact) return exact;

        const sorted = table
            .filter(entry => typeof entry.levelIndex === 'number')
            .sort((a, b) => a.levelIndex - b.levelIndex);
        const fallback = sorted.filter(entry => entry.levelIndex <= levelIndex).pop();
        return fallback || sorted[0] || null;
    }

    // 读取本地离线状态
    loadState(): OfflineRewardState {
        const data = loadData(STORAGE_KEYS.OFFLINE_REWARD);
        if (data && typeof data === 'object') {
            const state = data as OfflineRewardState;
            state.lastClaimTime = Number(state.lastClaimTime) || 0;
            return state;
        }
        return { lastClaimTime: 0 };
    }

    // 保存本地离线状态
    saveState(state: OfflineRewardState): void {
        saveData(STORAGE_KEYS.OFFLINE_REWARD, JSON.stringify(state));
    }

    // 读取快速巡逻次数（按天重置）
    loadQuickPatrolState(today: string): QuickPatrolState {
        const data = loadData(STORAGE_KEYS.OFFLINE_QUICK_PATROL);
        let state: QuickPatrolState = { date: today, count: 0 };
        if (data && typeof data === 'object') {
            const date = typeof data.date === 'string' ? data.date : today;
            const count = Number(data.count) || 0;
            state = { date, count };
        }
        if (state.date !== today) {
            state = { date: today, count: 0 };
            this.saveQuickPatrolState(state);
        }
        return state;
    }

    // 保存快速巡逻次数
    saveQuickPatrolState(state: QuickPatrolState): void {
        saveData(STORAGE_KEYS.OFFLINE_QUICK_PATROL, JSON.stringify(state));
    }
}

// 单例导出
export const offlineRewardDataProvider = new OfflineRewardDataProvider();
