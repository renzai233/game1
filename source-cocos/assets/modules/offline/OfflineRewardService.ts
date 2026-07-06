import { OfflineRewardConfig, OfflineRewardPending } from './core/OfflineRewardTypes';
import { calculateOfflineReward } from './core/OfflineRewardEngine';
import { offlineRewardDataProvider } from './OfflineRewardDataProvider';
import { LDM } from 'db://assets/modules/level/config/LevelDataManager';
import { PDM } from 'db://assets/utils/data/config/player/PlayerDataManager';
import { HDM } from 'db://assets/utils/data/config/hero/HeroDataManager';
import { CDM, CurrencyType } from 'db://assets/utils/common/CurrencyManager';
import { gameBus } from 'db://assets/utils/signal/GameBus';
import { SIGNAL_TYPES } from 'db://assets/utils/signal/ISignal';

// 离线奖励服务：编排配置读取、计算、发奖与状态存储
export class OfflineRewardService {
    private static _instance: OfflineRewardService; // 单例实例

    // 获取单例
    static getInstance(): OfflineRewardService {
        if (!OfflineRewardService._instance) {
            OfflineRewardService._instance = new OfflineRewardService();
        }
        return OfflineRewardService._instance;
    }

    // 生成待领取奖励快照（不发奖）
    async preparePreview(nowMs: number = Date.now()): Promise<OfflineRewardPending | null> {
        const config = await offlineRewardDataProvider.loadConfig();
        const state = offlineRewardDataProvider.loadState();

        if (!state.lastClaimTime) {
            state.lastClaimTime = nowMs;
            state.pending = undefined;
            offlineRewardDataProvider.saveState(state);
            this.emitStateChanged("preview_initialized");
            return null;
        }

        const pending = await this.calculatePending(config, state.lastClaimTime, nowMs);
        state.pending = pending || undefined;
        offlineRewardDataProvider.saveState(state);
        this.emitStateChanged("preview_updated");
        return pending;
    }

    // 领取奖励并发奖（领取后清零累计时间）
    async claim(nowMs: number = Date.now()): Promise<OfflineRewardPending | null> {
        const config = await offlineRewardDataProvider.loadConfig();
        const state = offlineRewardDataProvider.loadState();

        if (!state.lastClaimTime) {
            state.lastClaimTime = nowMs;
            state.pending = undefined;
            offlineRewardDataProvider.saveState(state);
            this.emitStateChanged("claim_initialized");
            return null;
        }

        const cooldownMs = Math.max(0, Number(config.minClaimIntervalSeconds) || 0) * 1000;
        if (cooldownMs > 0 && nowMs - state.lastClaimTime < cooldownMs) {
            return null;
        }

        const reward = await this.calculatePending(config, state.lastClaimTime, nowMs);
        state.lastClaimTime = nowMs;
        state.pending = undefined;
        offlineRewardDataProvider.saveState(state);
        this.emitStateChanged("claimed");

        if (!reward) {
            return null;
        }

        this.grantReward(reward);
        return reward;
    }

    // 获取本地已生成的待领取奖励
    getPending(): OfflineRewardPending | null {
        const state = offlineRewardDataProvider.loadState();
        return state.pending || null;
    }

    // 计算本次待领取奖励（不包含发奖）
    private async calculatePending(config: OfflineRewardConfig, lastClaimTime: number, nowMs: number): Promise<OfflineRewardPending | null> {
        const levelIndex = PDM.getLatestLevel();
        if (typeof levelIndex !== 'number' || Number.isNaN(levelIndex)) return null;
        const levelConfig = LDM.getLevelByIndex(levelIndex);
        if (!levelConfig) return null;

        const rateTable = await offlineRewardDataProvider.loadRateTable();
        const rateEntry = offlineRewardDataProvider.getRateForLevel(rateTable, levelIndex);
        if (!rateEntry) return null;

        const rarityWeights = this.buildRarityWeights(levelConfig.levelId, config);

        return calculateOfflineReward({
            config,
            lastClaimTime,
            nowMs,
            levelIndex,
            levelId: levelConfig.levelId,
            rateEntry,
            heroes: this.getUnlockedHeroes(),
            rarityWeights,
            rng: Math.random
        });
    }

    // 从关卡掉落配置中提取“稀有度权重”（用于碎片随机）
    private buildRarityWeights(levelId: number, config: OfflineRewardConfig): Map<string, number> {
        const allowedTypes = new Set(config.allowedItemTypes || []);
        if (!allowedTypes.has('hero_fragment')) return new Map();

        const dropConfigs = LDM.getDropConfigsByLevel(levelId);

        const weights = new Map<string, number>();
        dropConfigs.forEach(drop => {
            if (drop.item_type !== 'hero_fragment') return;
            const folded = this.foldRarity(drop.rarity, config);
            if (!folded) return;
            if (config.rarityWhitelist && config.rarityWhitelist.length > 0 && !config.rarityWhitelist.includes(folded)) {
                return;
            }
            const weight = Math.max(0, Number(drop.item_drop_rate) || 0);
            if (weight <= 0) return;
            weights.set(folded, (weights.get(folded) || 0) + weight);
        });
        return weights;
    }

    // 稀有度折叠（例如UC->C）
    private foldRarity(raw: string, config: OfflineRewardConfig): string | null {
        if (!raw) return null;
        const upper = String(raw).toUpperCase();
        if (config.rarityFold && (config.rarityFold[raw] || config.rarityFold[upper])) {
            return config.rarityFold[raw] || config.rarityFold[upper];
        }
        return upper;
    }

    // 获取已解锁英雄列表（若未设置则默认全英雄）
    private getUnlockedHeroes() {
        const allHeroes = HDM.getHeroList();
        const playerData = PDM.getPlayerData();
        const heroIds = playerData?.progress?.heroIds || [];
        if (!Array.isArray(heroIds) || heroIds.length === 0) return allHeroes;
        const unlocked = new Set(heroIds.map(id => Number(id)));
        return allHeroes.filter(hero => unlocked.has(Number(hero.id)));
    }

    // 发放奖励并触发事件
    private grantReward(reward: OfflineRewardPending): void {
        if (reward.gold > 0) {
            CDM.addCurrency(CurrencyType.Gold, reward.gold, 'offline_reward');
        }
        if (reward.totalFragments > 0) {
            reward.fragments.forEach(fragment => {
                if (fragment.amount > 0) {
                    CDM.rewardHeroFragment(fragment.heroId, fragment.amount, 'offline_reward');
                }
            });
        }

        gameBus.emit(SIGNAL_TYPES.OFFLINE_REWARD_CLAIMED, reward);
    }

    private emitStateChanged(reason: "preview_initialized" | "preview_updated" | "claim_initialized" | "claimed"): void {
        gameBus.emit(SIGNAL_TYPES.OFFLINE_REWARD_STATE_CHANGED, {
            reason,
            updatedAt: Date.now()
        });
    }
}

export const offlineRewardService = OfflineRewardService.getInstance();
