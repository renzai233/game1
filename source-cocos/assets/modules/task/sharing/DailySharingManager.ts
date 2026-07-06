import { CurrencyType, CDM } from 'db://assets/utils/common/CurrencyManager';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';
import { gameBus } from 'db://assets/utils/signal/GameBus';
import { SIGNAL_TYPES } from 'db://assets/utils/signal/ISignal';

export interface DailySharingReward {
    type: CurrencyType;
    amount: number;
    heroId?: number;
    iconPath: string;
}

interface DailySharingState {
    lastClaimDate: string;
    version: string;
}

const STORAGE_KEY = 'daily_sharing_state';
const VERSION = '1.0.0';
const REWARD_REASON = 'daily_sharing_reward';

const DEFAULT_REWARDS: DailySharingReward[] = [
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

export class DailySharingManager {
    private static _instance: DailySharingManager | null = null;

    private readyPromise: Promise<void>;
    private lastClaimDate = '';

    public static get instance(): DailySharingManager {
        if (!DailySharingManager._instance) {
            DailySharingManager._instance = new DailySharingManager();
        }
        return DailySharingManager._instance;
    }

    private constructor() {
        this.readyPromise = this.initialize();
    }

    public async ensureReady(): Promise<void> {
        return this.readyPromise;
    }

    private async initialize(): Promise<void> {
        this.loadState();
    }

    public getRewards(): DailySharingReward[] {
        return DEFAULT_REWARDS.map(reward => ({ ...reward }));
    }

    public isClaimedToday(): boolean {
        this.checkAndResetIfNeeded();
        return this.lastClaimDate === this.getTodayDate();
    }

    public checkAndResetIfNeeded(): boolean {
        const today = this.getTodayDate();
        if (this.lastClaimDate && this.lastClaimDate !== today) {
            this.lastClaimDate = '';
            this.saveState();
            return true;
        }
        return false;
    }

    public claimDailyShareReward(): DailySharingReward[] | null {
        this.checkAndResetIfNeeded();
        if (this.isClaimedToday()) {
            return null;
        }

        const rewards = this.getRewards();
        const reason = `${REWARD_REASON}:${this.getTodayDate()}`;
        rewards.forEach(reward => {
            if (reward.type === CurrencyType.HeroFragment && reward.heroId != null) {
                CDM.rewardHeroFragment(reward.heroId, reward.amount, reason);
                return;
            }
            CDM.addCurrency(reward.type, reward.amount, reason);
        });

        this.lastClaimDate = this.getTodayDate();
        this.saveState();
        this.emitRewardReceived(rewards, reason);

        if (EDM.isDev()) {
            console.log('[DailySharingManager] 分享奖励发放成功', {
                date: this.lastClaimDate,
                rewards,
            });
        }

        return rewards;
    }

    public getNextResetMs(nowMs: number = Date.now()): number {
        const nextDay = new Date(nowMs);
        nextDay.setHours(24, 0, 0, 0);
        return nextDay.getTime();
    }

    public resetForDebug(): void {
        this.lastClaimDate = '';
        this.saveState();
    }

    private loadState(): void {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) {
            this.lastClaimDate = '';
            this.saveState();
            return;
        }

        try {
            const parsed = JSON.parse(saved) as DailySharingState;
            this.lastClaimDate = parsed?.lastClaimDate || '';
            this.checkAndResetIfNeeded();
        } catch (error) {
            console.error('[DailySharingManager] 解析分享状态失败，重新初始化', error);
            this.lastClaimDate = '';
            this.saveState();
        }
    }

    private saveState(): void {
        const state: DailySharingState = {
            lastClaimDate: this.lastClaimDate,
            version: VERSION,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    private emitRewardReceived(rewards: DailySharingReward[], reason: string): void {
        gameBus.emit(SIGNAL_TYPES.REWARD_RECEIVED, {
            items: rewards.map(reward => ({
                type: reward.type,
                amount: reward.amount,
                heroId: reward.heroId,
            })),
            reason,
            source: 'daily_sharing',
        });
    }

    private getTodayDate(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}
