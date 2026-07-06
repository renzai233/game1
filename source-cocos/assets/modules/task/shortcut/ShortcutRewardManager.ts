import { CDM, CurrencyType } from 'db://assets/utils/common/CurrencyManager';
import { loadData, saveData } from 'db://assets/utils/data/config/manager/DataManager';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';
import { gameBus } from 'db://assets/utils/signal/GameBus';
import { SIGNAL_TYPES } from 'db://assets/utils/signal/ISignal';

export interface ShortcutRewardItem {
    type: CurrencyType;
    amount: number;
    heroId?: number;
    iconPath: string;
}

interface ShortcutRewardState {
    claimed: boolean;
    claimedAtMs: number | null;
    version: string;
}

const STORAGE_KEY = 'shortcut_reward_state';
const VERSION = '1.0.0';
const REWARD_REASON = 'douyin_shortcut_reward';

const DEFAULT_REWARDS: ShortcutRewardItem[] = [
    {
        type: CurrencyType.Gem,
        amount: 100,
        iconPath: 'icon/res/diamonds',
    },
    {
        type: CurrencyType.Gold,
        amount: 2000,
        iconPath: 'icon/res/coins',
    },
    {
        type: CurrencyType.Stamina,
        amount: 30,
        iconPath: 'icon/res/flash',
    },
];

export class ShortcutRewardManager {
    private static _instance: ShortcutRewardManager | null = null;

    private claimed = false;
    private claimedAtMs: number | null = null;

    public static get instance(): ShortcutRewardManager {
        if (!ShortcutRewardManager._instance) {
            ShortcutRewardManager._instance = new ShortcutRewardManager();
        }
        return ShortcutRewardManager._instance;
    }

    private constructor() {
        this.loadState();
    }

    public getRewards(): ShortcutRewardItem[] {
        return DEFAULT_REWARDS.map((reward) => ({ ...reward }));
    }

    public hasClaimedReward(): boolean {
        return this.claimed;
    }

    public claimReward(): ShortcutRewardItem[] | null {
        if (this.claimed) {
            return null;
        }

        const rewards = this.getRewards();
        rewards.forEach((reward) => {
            if (reward.type === CurrencyType.HeroFragment && reward.heroId != null) {
                CDM.rewardHeroFragment(reward.heroId, reward.amount, REWARD_REASON);
                return;
            }
            CDM.addCurrency(reward.type, reward.amount, REWARD_REASON);
        });

        this.claimed = true;
        this.claimedAtMs = Date.now();
        this.saveState();
        this.emitRewardReceived(rewards);
        this.emitStateChanged();

        if (EDM.isDev()) {
            console.log('[ShortcutRewardManager] 添加桌面奖励发放成功', {
                claimedAtMs: this.claimedAtMs,
                rewards,
            });
        }

        return rewards;
    }

    public resetForDebug(): void {
        this.claimed = false;
        this.claimedAtMs = null;
        this.saveState();
        this.emitStateChanged();
    }

    private loadState(): void {
        const saved = loadData(STORAGE_KEY) as ShortcutRewardState | null;
        if (!saved) {
            this.claimed = false;
            this.claimedAtMs = null;
            this.saveState();
            return;
        }

        try {
            this.claimed = saved.claimed === true;
            this.claimedAtMs = typeof saved.claimedAtMs === 'number' ? saved.claimedAtMs : null;
        } catch (error) {
            console.error('[ShortcutRewardManager] 解析添加桌面奖励状态失败，重新初始化', error);
            this.claimed = false;
            this.claimedAtMs = null;
            this.saveState();
        }
    }

    private saveState(): void {
        const state: ShortcutRewardState = {
            claimed: this.claimed,
            claimedAtMs: this.claimedAtMs,
            version: VERSION,
        };
        saveData(STORAGE_KEY, JSON.stringify(state));
    }

    private emitRewardReceived(rewards: ShortcutRewardItem[]): void {
        gameBus.emit(SIGNAL_TYPES.REWARD_RECEIVED, {
            items: rewards.map((reward) => ({
                type: reward.type,
                amount: reward.amount,
                heroId: reward.heroId,
            })),
            reason: REWARD_REASON,
            source: 'douyin_shortcut',
        });
    }

    private emitStateChanged(): void {
        gameBus.emit(SIGNAL_TYPES.SHORTCUT_REWARD_STATE_CHANGED, {
            claimed: this.claimed,
            claimedAtMs: this.claimedAtMs,
        });
    }
}
