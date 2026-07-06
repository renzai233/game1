import { _decorator, Button, Label, Node, Sprite, SpriteFrame } from 'cc';
import { DailySharingManager, type DailySharingReward } from './DailySharingManager';
import { UIBase } from 'db://assets/utils/ui/UIBase';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';
import { resManager, ResourceType } from 'db://assets/utils/data/config/manager/ResourceManager';
import { canShareAppMessage, shareAppMessage } from 'db://assets/script/shared/sdk';

const { ccclass, property } = _decorator;

@ccclass('SharingPanelController')
export class SharingPanelController extends UIBase {
    @property(Node)
    contentNode: Node | null = null;

    @property(Node)
    titleNode: Node | null = null;

    @property(Node)
    giftContainerNode: Node | null = null;

    @property(Button)
    claimButton: Button | null = null;

    @property(Label)
    claimButtonLabel: Label | null = null;

    private claimDisabledNode: Node | null = null;
    private claimDisabledButton: Button | null = null;
    private claimDisabledLabel: Label | null = null;
    private readonly sharingManager = DailySharingManager.instance;
    private _busy = false;
    private _countdownScheduled = false;
    private _rewardNodes: Node[] = [];

    onLoad(): void {
        this.resolveNodes();
        void this.initialize();
    }

    onDisable(): void {
        this.unschedule(this.refreshClaimState);
        this._busy = false;
    }

    onDestroy(): void {
        this.unschedule(this.refreshClaimState);
    }

    public async show(data?: any): Promise<void> {
        await super.show(data);
        await this.sharingManager.ensureReady();
        this.refreshRewards();
        this.refreshClaimState();
    }

    private async initialize(): Promise<void> {
        await this.sharingManager.ensureReady();
        this.refreshRewards();
        this.refreshClaimState();
    }

    private resolveNodes(): void {
        this.maskNode = this.maskNode ?? this.node.getChildByName('Mask');
        this.contentNode = this.contentNode ?? this.node.getChildByName('Content');
        this.titleNode = this.titleNode ?? this.contentNode?.getChildByName('Title') ?? null;
        this.giftContainerNode = this.giftContainerNode ?? this.contentNode?.getChildByName('GiftContainer') ?? null;

        const claimNode = this.contentNode?.getChildByName('ClaimBtn') ?? null;
        this.claimButton = this.claimButton ?? claimNode?.getComponent(Button) ?? null;
        this.claimButtonLabel = this.claimButtonLabel ?? claimNode?.getChildByName('Label')?.getComponent(Label) ?? null;
        this.claimDisabledNode = this.claimDisabledNode ?? this.contentNode?.getChildByName('ClaimDisabled') ?? null;
        this.claimDisabledButton = this.claimDisabledButton ?? this.claimDisabledNode?.getComponent(Button) ?? null;
        this.claimDisabledLabel = this.claimDisabledLabel ?? this.claimDisabledNode?.getChildByName('Label')?.getComponent(Label) ?? null;
        if (this.claimDisabledButton) {
            this.claimDisabledButton.interactable = false;
        }

        this._rewardNodes = [];
        for (let index = 1; index <= 3; index++) {
            const rewardNode = this.giftContainerNode?.getChildByName(`GiftItem${String(index).padStart(2, '0')}`) ?? null;
            if (rewardNode) {
                this._rewardNodes.push(rewardNode);
            }
        }
    }

    public onClaimButtonClick(): void {
        void this.handleClaimButtonClick();
    }

    private async handleClaimButtonClick(): Promise<void> {
        if (this._busy) {
            return;
        }

        if (this.sharingManager.isClaimedToday()) {
            this.refreshClaimState();
            return;
        }

        if (!canShareAppMessage()) {
            this.refreshClaimState();
            return;
        }

        const templateId = this.getShareTemplateId();
        if (!templateId) {
            console.error('[SharingPanelController] 未配置分享模板ID: platformFeatures.douyinShare.rewardTemplateId');
            this.refreshClaimState();
            return;
        }

        this._busy = true;
        this.refreshClaimState();

        try {
            const shareResult = await shareAppMessage({
                channel: EDM.config.platformFeatures?.douyinShare?.defaultChannel || 'invite',
                shareTemplate: templateId,
                query: 'from=daily_sharing_reward',
                title: EDM.config.platformFeatures?.douyinShare?.title || undefined,
                desc: EDM.config.platformFeatures?.douyinShare?.desc || undefined,
                imageUrl: EDM.config.platformFeatures?.douyinShare?.imageUrl || undefined,
            });

            if (!shareResult.ok) {
                if (EDM.isDev()) {
                    console.warn('[SharingPanelController] 分享未完成', shareResult);
                }
                return;
            }

            const rewards = this.sharingManager.claimDailyShareReward();
            if (!rewards) {
                return;
            }
        } catch (error) {
            console.error('[SharingPanelController] 分享领奖失败', error);
        } finally {
            this._busy = false;
            this.refreshClaimState();
        }
    }

    private refreshRewards(): void {
        const rewards = this.sharingManager.getRewards();
        this._rewardNodes.forEach((rewardNode, index) => {
            const reward = rewards[index];
            rewardNode.active = !!reward;
            if (!reward) {
                return;
            }
            this.renderRewardNode(rewardNode, reward);
        });
    }

    private renderRewardNode(rewardNode: Node, reward: DailySharingReward): void {
        const iconNode = rewardNode.getChildByName('Icon');
        const labelNode = rewardNode.getChildByName('Label');

        const label = labelNode?.getComponent(Label) ?? null;
        if (label) {
            label.string = `${reward.amount}`;
        }

        const sprite = iconNode?.getComponent(Sprite) ?? null;
        if (sprite) {
            void this.setRewardIcon(sprite, reward.iconPath);
        }
    }

    private async setRewardIcon(sprite: Sprite, iconPath: string): Promise<void> {
        if (!iconPath) return;
        const spriteFrame = await this.loadSpriteFrame(iconPath);
        if (spriteFrame && sprite.node?.isValid) {
            sprite.spriteFrame = spriteFrame;
        }
    }

    private async loadSpriteFrame(iconPath: string): Promise<SpriteFrame | null> {
        const asset = await resManager().load<SpriteFrame>(`textures/${iconPath}/spriteFrame`, ResourceType.SPRITE_FRAME, 'res');
        if (asset && asset instanceof SpriteFrame) {
            return asset;
        }
        return null;
    }

    private refreshClaimState = (): void => {
        const claimedToday = this.sharingManager.isClaimedToday();
        if (claimedToday) {
            if (!this._countdownScheduled) {
                this.schedule(this.refreshClaimState, 1);
                this._countdownScheduled = true;
            }
            this.setClaimDisplay(false, this.formatCountdown(this.sharingManager.getNextResetMs() - Date.now()));
            return;
        }

        this.unschedule(this.refreshClaimState);
        this._countdownScheduled = false;

        if (this._busy) {
            this.setClaimDisplay(false, '分享中...');
            return;
        }

        if (!this.canShareNow()) {
            this.setClaimDisplay(false, '暂不可用');
            return;
        }

        this.setClaimDisplay(true, '立即分享');
    };

    private canShareNow(): boolean {
        return canShareAppMessage() && this.getShareTemplateId().length > 0;
    }

    private getShareTemplateId(): string {
        return EDM.config.platformFeatures?.douyinShare?.rewardTemplateId?.trim() || '';
    }

    private setClaimDisplay(showClaimButton: boolean, labelText: string): void {
        if (this.claimButton) {
            this.claimButton.node.active = showClaimButton;
            this.claimButton.interactable = showClaimButton;
        }
        if (this.claimButtonLabel) {
            this.claimButtonLabel.string = labelText;
        }
        if (this.claimDisabledNode) {
            this.claimDisabledNode.active = !showClaimButton;
        }
        if (this.claimDisabledButton) {
            this.claimDisabledButton.interactable = false;
        }
        if (this.claimDisabledLabel) {
            this.claimDisabledLabel.string = labelText;
        }
    }

    private formatCountdown(remainingMs: number): string {
        const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}
