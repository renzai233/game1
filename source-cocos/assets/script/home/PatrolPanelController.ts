import { _decorator, Node, Label, Prefab, instantiate, Button, Layout, Sprite } from "cc";
import { UIBase } from "db://assets/utils/ui/UIBase";
import { offlineRewardService } from "db://assets/modules/offline/OfflineRewardService";
import { offlineRewardDataProvider } from "db://assets/modules/offline/OfflineRewardDataProvider";
import { calculateOfflineReward } from "db://assets/modules/offline/core/OfflineRewardEngine";
import { OfflineRewardConfig, OfflineRewardPending, OfflineRewardRateEntry } from "db://assets/modules/offline/core/OfflineRewardTypes";
import { PDM } from "db://assets/utils/data/config/player/PlayerDataManager";
import { LDM } from "db://assets/modules/level/config/LevelDataManager";
import { HDM } from "db://assets/utils/data/config/hero/HeroDataManager";
import { CDM, CurrencyType } from "db://assets/utils/common/CurrencyManager";
import { gameBus } from "db://assets/utils/signal/GameBus";
import { SIGNAL_TYPES } from "db://assets/utils/signal/ISignal";
import { RewardItemController } from "db://assets/script/ui/popup/RewardItemController";

const { ccclass, property } = _decorator;
const PATROL_FRAGMENT_ICON = "textures/ui/skin1/polish/patrol_fragment_icon/spriteFrame";

@ccclass("PatrolPanelController")
export class PatrolPanelController extends UIBase {
    @property(Node)
    contentNode: Node;

    @property(Label)
    goldPerHourLabel: Label;

    @property(Label)
    fragmentPerHourLabel: Label;

    @property(Label)
    timerLabel: Label;

    @property(Node)
    rewardContent: Node;

    @property(Prefab)
    rewardItemPrefab: Prefab;

    @property(Node)
    noticeNode: Node;

    @property(Button)
    claimButton: Button;

    @property(Button)
    quickButton: Button;

    @property(Label)
    quickLeftLabel: Label;

    private _config: OfflineRewardConfig | null = null;
    private _rateEntry: OfflineRewardRateEntry | null = null;
    private _lastClaimTime = 0;

    private readonly _quickHours = 10;
    private readonly _quickStaminaCost = 5;

    onLoad(): void {
        this.claimButton.node.on(Button.EventType.CLICK, this.onClaim, this);
        this.quickButton.node.on(Button.EventType.CLICK, this.onQuickPatrol, this);
    }

    protected onShow(): void {
        this.unschedule(this.updateTimer);
        this.schedule(this.updateTimer, 1);
        this.updateTimer();
    }

    protected onHide(): void {
        this.unschedule(this.updateTimer);
    }

    protected async onLoadData(): Promise<void> {
        await this.refreshPreview();
    }

    private async refreshPreview(): Promise<void> {
        this._config = await offlineRewardDataProvider.loadConfig();
        const levelIndex = PDM.getLatestLevel();
        const rateTable = await offlineRewardDataProvider.loadRateTable();
        this._rateEntry = offlineRewardDataProvider.getRateForLevel(rateTable, levelIndex);
        this.updateRateLabels();

        const pending = await offlineRewardService.preparePreview();
        this.renderRewards(pending);

        const state = offlineRewardDataProvider.loadState();
        this._lastClaimTime = state.lastClaimTime || Date.now();
        this.updateNoticeState();
        this.updateButtons(pending);
        this.updateTimer();
    }

    private updateRateLabels(): void {
        const gold = this._rateEntry?.goldPerHour ?? 0;
        const fragment = this._rateEntry?.fragmentPerHour ?? 0;
        this.goldPerHourLabel.string = `${this.formatRate(gold)}/小时`;
        this.fragmentPerHourLabel.string = `${this.formatRate(fragment)}/小时`;
    }

    private renderRewards(pending: OfflineRewardPending | null): void {
        this.rewardContent.removeAllChildren();

        const items: Array<{ name: string; amount: number; iconPath: string }> = [];
        if (pending && pending.gold > 0) {
            items.push({
                name: "金币",
                amount: pending.gold,
                iconPath: "textures/icon/res/coin/spriteFrame"
            });
        }
        if (pending && pending.totalFragments > 0) {
            items.push({
                name: "碎片",
                amount: pending.totalFragments,
                iconPath: PATROL_FRAGMENT_ICON
            });
        }

        items.forEach(item => {
            const node = instantiate(this.rewardItemPrefab);
            const ctrl = node.getComponent(RewardItemController);
            if (ctrl) {
                ctrl.init({ name: item.name, amount: item.amount, iconPath: item.iconPath });
            }
            this.rewardContent.addChild(node);
        });

        const layout = this.rewardContent.getComponent(Layout);
        layout?.updateLayout();
    }

    private updateTimer(): void {
        const config = this._config;
        if (!config || !this._lastClaimTime) {
            this.timerLabel.string = "已巡逻 00:00:00";
            return;
        }

        const nowMs = Date.now();
        const elapsedSeconds = Math.max(0, (nowMs - this._lastClaimTime) / 1000);
        const capSeconds = Math.max(0, (config.maxHoursPerDay || 0) * 3600);
        const cappedSeconds = capSeconds > 0 ? Math.min(elapsedSeconds, capSeconds) : elapsedSeconds;

        const isFull = this.isOfflineRewardFull(nowMs);
        this.noticeNode.active = isFull;
        if (isFull) {
            this.timerLabel.string = "已达最大巡逻时间";
            return;
        }

        this.timerLabel.string = `已巡逻 ${this.formatDuration(cappedSeconds)}`;
    }

    private updateNoticeState(): void {
        this.noticeNode.active = this.isOfflineRewardFull();
    }

    private updateButtons(pending: OfflineRewardPending | null): void {
        const hasReward = !!pending && (pending.gold > 0 || pending.totalFragments > 0);
        const inCooldown = this.isClaimCooldown();
        const claimEnabled = hasReward && !inCooldown;
        this.claimButton.interactable = claimEnabled;
        this.setButtonGrayscale(this.claimButton.node, !claimEnabled);
        const quickRemaining = this.getQuickPatrolRemaining();
        this.quickLeftLabel.string = `剩余次数：${quickRemaining}次`;
        const quickEnabled = CDM.hasEnoughCurrency(CurrencyType.Stamina, this._quickStaminaCost) && quickRemaining > 0;
        this.quickButton.interactable = quickEnabled;
        this.setButtonGrayscale(this.quickButton.node, !quickEnabled);
    }

    private isOfflineRewardFull(nowMs: number = Date.now()): boolean {
        const config = this._config;
        if (!config || !this._lastClaimTime) return false;
        const rawSeconds = Math.max(0, (nowMs - this._lastClaimTime) / 1000);
        const capSeconds = Math.max(0, (config.maxHoursPerDay || 0) * 3600);
        return capSeconds > 0 && rawSeconds >= capSeconds;
    }

    private isClaimCooldown(nowMs: number = Date.now()): boolean {
        const config = this._config;
        if (!config || !this._lastClaimTime) return false;
        const cooldown = Math.max(0, Number(config.minClaimIntervalSeconds) || 0) * 1000;
        if (cooldown <= 0) return false;
        return nowMs - this._lastClaimTime < cooldown;
    }

    private getQuickPatrolRemaining(): number {
        const maxCount = Math.max(0, Number(this._config?.maxQuickPatrolPerDay) || 0);
        if (maxCount <= 0) return 0;
        const state = this.getQuickPatrolState();
        return Math.max(0, maxCount - state.count);
    }

    private getQuickPatrolState(): { date: string; count: number } {
        const today = this.getTodayDate();
        return offlineRewardDataProvider.loadQuickPatrolState(today);
    }

    private saveQuickPatrolState(state: { date: string; count: number }): void {
        offlineRewardDataProvider.saveQuickPatrolState(state);
    }

    private setButtonGrayscale(node: Node, grayscale: boolean): void {
        const sprite = node.getComponent(Sprite);
        if (sprite) {
            sprite.grayscale = grayscale;
        }
    }

    private async onClaim(): Promise<void> {
        if (this.isClaimCooldown()) return;
        const reward = await offlineRewardService.claim();
        this.emitRewardReceived(reward, "offline_reward");
        await this.refreshPreview();
    }

    private async onQuickPatrol(): Promise<void> {
        if (!CDM.hasEnoughCurrency(CurrencyType.Stamina, this._quickStaminaCost)) return;
        if (this.getQuickPatrolRemaining() <= 0) return;

        const reward = await this.calculateQuickReward(this._quickHours);
        if (!reward) return;

        CDM.subtractCurrency(CurrencyType.Stamina, this._quickStaminaCost, "quick_patrol");
        const state = this.getQuickPatrolState();
        state.count += 1;
        this.saveQuickPatrolState(state);
        this.grantReward(reward, "quick_patrol");
        this.emitRewardReceived(reward, "quick_patrol");

        await this.refreshPreview();
    }

    private async calculateQuickReward(hours: number): Promise<OfflineRewardPending | null> {
        const config = this._config || await offlineRewardDataProvider.loadConfig();
        this._config = config;
        const levelIndex = PDM.getLatestLevel();
        if (typeof levelIndex !== "number" || Number.isNaN(levelIndex)) return null;
        const levelConfig = LDM.getLevelByIndex(levelIndex);
        if (!levelConfig) return null;

        const rateTable = await offlineRewardDataProvider.loadRateTable();
        const rateEntry = offlineRewardDataProvider.getRateForLevel(rateTable, levelIndex);
        if (!rateEntry) return null;

        const nowMs = Date.now();
        const durationSeconds = Math.max(0, hours) * 3600;
        const lastClaimTime = nowMs - durationSeconds * 1000;
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

    private grantReward(reward: OfflineRewardPending, reason: string): void {
        if (reward.gold > 0) {
            CDM.addCurrency(CurrencyType.Gold, reward.gold, reason);
        }
        if (reward.totalFragments > 0) {
            reward.fragments.forEach(fragment => {
                if (fragment.amount > 0) {
                    CDM.rewardHeroFragment(fragment.heroId, fragment.amount, reason);
                }
            });
        }
    }

    private emitRewardReceived(reward: OfflineRewardPending | null, source: string): void {
        if (!reward) return;
        const items: Array<{ type: any; amount: number; heroId?: number }> = [];

        if (reward.gold > 0) {
            items.push({ type: CurrencyType.Gold, amount: reward.gold });
        }

        if (reward.fragments && reward.fragments.length > 0) {
            reward.fragments.forEach(fragment => {
                if (fragment.amount > 0) {
                    items.push({ type: CurrencyType.HeroFragment, amount: fragment.amount, heroId: fragment.heroId });
                }
            });
        } else if (reward.totalFragments > 0) {
            items.push({ type: CurrencyType.HeroFragment, amount: reward.totalFragments });
        }

        if (items.length === 0) return;
        gameBus.emit(SIGNAL_TYPES.REWARD_RECEIVED, { items, reason: source, source });
    }

    private buildRarityWeights(levelId: number, config: OfflineRewardConfig): Map<string, number> {
        const allowedTypes = new Set(config.allowedItemTypes || []);
        if (!allowedTypes.has("hero_fragment")) return new Map();

        const dropConfigs = LDM.getDropConfigsByLevel(levelId);
        const weights = new Map<string, number>();
        dropConfigs.forEach(drop => {
            if (drop.item_type !== "hero_fragment") return;
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

    private foldRarity(raw: string, config: OfflineRewardConfig): string | null {
        if (!raw) return null;
        const upper = String(raw).toUpperCase();
        if (config.rarityFold && (config.rarityFold[raw] || config.rarityFold[upper])) {
            return config.rarityFold[raw] || config.rarityFold[upper];
        }
        return upper;
    }

    private getUnlockedHeroes() {
        const allHeroes = HDM.getHeroList();
        const playerData = PDM.getPlayerData();
        const heroIds = playerData?.progress?.heroIds || [];
        if (!Array.isArray(heroIds) || heroIds.length === 0) return allHeroes;
        const unlocked = new Set(heroIds.map((id: number) => Number(id)));
        return allHeroes.filter(hero => unlocked.has(Number(hero.id)));
    }

    private formatDuration(totalSeconds: number): string {
        const seconds = Math.max(0, Math.floor(totalSeconds));
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return [hours, minutes, secs].map(value => String(value).padStart(2, "0")).join(":");
    }

    private getTodayDate(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    private formatRate(value: number): string {
        if (!isFinite(value)) return "0";
        if (Math.abs(value - Math.round(value)) < 1e-6) return String(Math.round(value));
        return value.toFixed(2);
    }
}
