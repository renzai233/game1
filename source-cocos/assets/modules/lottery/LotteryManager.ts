import { Singleton } from '../../utils/common/Singleton';
import { IDM } from '../material/ItemDataManager';
import { ILotteryConfig, ILotteryCost, ILotteryDrawResult, ILotteryPlayerData, ILotteryPool, ILotteryReward, ILotterySingleDrawResult, ILotteryStatistics, LotteryResultType } from './LotteryTypes';

export class LotteryManager extends Singleton {
    private _lotteryConfigs: Map<string, ILotteryConfig> = new Map();
    private _playerData: Map<string, ILotteryPlayerData> = new Map();
    private _statistics: Map<string, ILotteryStatistics> = new Map();

    registerLotteryConfig(config: ILotteryConfig): boolean {
        if (!config || !config.id) {
            console.error('[LotteryManager] 无效的抽奖配置');
            return false;
        }

        if (this._lotteryConfigs.has(config.id)) {
            console.warn(`[LotteryManager] 抽奖配置已存在: ${config.id}`);
            return false;
        }

        this._lotteryConfigs.set(config.id, config);
        this._playerData.set(config.id, {
            lotteryId: config.id,
            totalDraws: 0,
            dailyDraws: 0,
            lastDrawTime: 0,
            pityCounter: 0
        });

        this._statistics.set(config.id, {
            totalDraws: 0,
            totalCost: { itemId: 0, quantity: 0 },
            rewardsByRarity: new Map(),
            rewardsByItemId: new Map()
        });

        console.log(`[LotteryManager] 注册抽奖配置: ${config.id}`);
        return true;
    }

    getLotteryConfig(lotteryId: string): ILotteryConfig | undefined {
        return this._lotteryConfigs.get(lotteryId);
    }

    getPlayerData(lotteryId: string): ILotteryPlayerData | undefined {
        return this._playerData.get(lotteryId);
    }

    getStatistics(lotteryId: string): ILotteryStatistics | undefined {
        return this._statistics.get(lotteryId);
    }

    canDraw(lotteryId: string, isMultiDraw: boolean = false): { canDraw: boolean; reason?: string } {
        const config = this._lotteryConfigs.get(lotteryId);
        if (!config) {
            return { canDraw: false, reason: '抽奖配置不存在' };
        }

        const playerData = this._playerData.get(lotteryId);
        if (!playerData) {
            return { canDraw: false, reason: '玩家数据不存在' };
        }

        if (config.maxDailyDraws) {
            const today = new Date().toDateString();
            const lastDrawDate = new Date(playerData.lastDrawTime).toDateString();

            if (today === lastDrawDate && playerData.dailyDraws >= config.maxDailyDraws) {
                return { canDraw: false, reason: '今日抽奖次数已达上限' };
            }
        }

        if (config.cooldown && playerData.lastDrawTime > 0) {
            const elapsed = Date.now() - playerData.lastDrawTime;
            if (elapsed < config.cooldown) {
                const remaining = Math.ceil((config.cooldown - elapsed) / 1000);
                return { canDraw: false, reason: `冷却中，剩余 ${remaining} 秒` };
            }
        }

        return { canDraw: true };
    }

    draw(lotteryId: string, isMultiDraw: boolean = false): ILotteryDrawResult {
        const config = this._lotteryConfigs.get(lotteryId);
        if (!config) {
            return {
                success: false,
                resultType: LotteryResultType.LOTTERY_NOT_FOUND,
                message: '抽奖配置不存在',
                draws: [],
                totalCost: { itemId: 0, quantity: 0 }
            };
        }

        const canDrawCheck = this.canDraw(lotteryId, isMultiDraw);
        if (!canDrawCheck.canDraw) {
            return {
                success: false,
                resultType: LotteryResultType.UNKNOWN_ERROR,
                message: canDrawCheck.reason,
                draws: [],
                totalCost: { itemId: 0, quantity: 0 }
            };
        }

        const drawCount = isMultiDraw ? config.multiDrawCount : 1;
        const cost = isMultiDraw ? config.multiDrawCost : config.singleDrawCost;

        const playerData = this._playerData.get(lotteryId)!;
        const statistics = this._statistics.get(lotteryId)!;

        const results: ILotterySingleDrawResult[] = [];

        for (let i = 0; i < drawCount; i++) {
            const result = this.performSingleDraw(config, playerData);
            if (result) {
                results.push(result);
            }
        }

        this.updatePlayerData(lotteryId, drawCount, cost);
        this.updateStatistics(lotteryId, drawCount, cost, results);

        return {
            success: true,
            resultType: LotteryResultType.SUCCESS,
            draws: results,
            totalCost: cost,
            pityCounter: playerData.pityCounter
        };
    }

    private performSingleDraw(config: ILotteryConfig, playerData: ILotteryPlayerData): ILotterySingleDrawResult | null {
        let isGuaranteed = false;
        let selectedReward: ILotteryReward | null = null;
        let selectedPool: ILotteryPool | null = null;

        if (config.guaranteeMechanic) {
            playerData.pityCounter++;

            if (playerData.pityCounter >= config.guaranteeMechanic.pityCount) {
                isGuaranteed = true;
                playerData.pityCounter = 0;

                for (const pool of config.pools) {
                    const guaranteedReward = pool.rewards.find(r => r.configId === config.guaranteeMechanic!.guaranteedRewardConfigId);
                    if (guaranteedReward) {
                        selectedReward = guaranteedReward;
                        selectedPool = pool;
                        break;
                    }
                }
            }
        }

        if (!selectedReward) {
            const poolResult = this.selectRewardFromPools(config.pools);
            selectedReward = poolResult.reward;
            selectedPool = poolResult.pool;
        }

        if (!selectedReward || !selectedPool) {
            console.error('[LotteryManager] 无法选择奖励');
            return null;
        }

        const item = IDM.createItem(selectedReward.configId);
        if (!item) {
            console.error(`[LotteryManager] 无法创建物品: ${selectedReward.configId}`);
            return null;
        }

        const quantity = this.randomInt(selectedReward.minQuantity, selectedReward.maxQuantity);

        return {
            item,
            quantity,
            rarity: item.rarity,
            isGuaranteed,
            poolId: selectedPool.poolId
        };
    }

    private selectRewardFromPools(pools: ILotteryPool[]): { reward: ILotteryReward; pool: ILotteryPool } {
        const totalWeight = pools.reduce((sum, pool) => sum + pool.totalWeight, 0);
        let randomWeight = Math.random() * totalWeight;

        for (const pool of pools) {
            if (randomWeight < pool.totalWeight) {
                const reward = this.selectRewardFromPool(pool);
                return { reward, pool };
            }
            randomWeight -= pool.totalWeight;
        }

        const lastPool = pools[pools.length - 1];
        const reward = this.selectRewardFromPool(lastPool);
        return { reward, pool: lastPool };
    }

    private selectRewardFromPool(pool: ILotteryPool): ILotteryReward {
        const totalWeight = pool.rewards.reduce((sum, reward) => sum + reward.weight, 0);
        let randomWeight = Math.random() * totalWeight;

        for (const reward of pool.rewards) {
            if (randomWeight < reward.weight) {
                return reward;
            }
            randomWeight -= reward.weight;
        }

        return pool.rewards[pool.rewards.length - 1];
    }

    private updatePlayerData(lotteryId: string, drawCount: number, cost: ILotteryCost): void {
        const playerData = this._playerData.get(lotteryId);
        if (!playerData) return;

        const today = new Date().toDateString();
        const lastDrawDate = new Date(playerData.lastDrawTime).toDateString();

        playerData.totalDraws += drawCount;
        playerData.lastDrawTime = Date.now();

        if (today !== lastDrawDate) {
            playerData.dailyDraws = drawCount;
        } else {
            playerData.dailyDraws += drawCount;
        }
    }

    private updateStatistics(lotteryId: string, drawCount: number, cost: ILotteryCost, results: ILotterySingleDrawResult[]): void {
        const statistics = this._statistics.get(lotteryId);
        if (!statistics) return;

        statistics.totalDraws += drawCount;
        statistics.totalCost.itemId = cost.itemId;
        statistics.totalCost.quantity += cost.quantity;

        for (const result of results) {
            const rarity = result.item.rarity;
            const currentRarity = statistics.rewardsByRarity.get(rarity) || 0;
            statistics.rewardsByRarity.set(rarity, currentRarity + result.quantity);

            const configId = result.item.id;
            const currentItem = statistics.rewardsByItemId.get(configId) || 0;
            statistics.rewardsByItemId.set(configId, currentItem + result.quantity);
        }
    }

    resetDailyDraws(lotteryId: string): void {
        const playerData = this._playerData.get(lotteryId);
        if (playerData) {
            playerData.dailyDraws = 0;
        }
    }

    resetPityCounter(lotteryId: string): void {
        const playerData = this._playerData.get(lotteryId);
        if (playerData) {
            playerData.pityCounter = 0;
        }
    }

    private randomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}

export const LTM = LotteryManager.instance();
