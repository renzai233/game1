import { _decorator, Button, Label, Node, Sprite, SpriteFrame } from 'cc';
import { UIBase } from 'db://assets/utils/ui/UIBase';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';
import { resManager, ResourceType } from 'db://assets/utils/data/config/manager/ResourceManager';
import { addShortcut, canAddShortcut } from 'db://assets/script/shared/sdk';
import { ShortcutRewardManager, type ShortcutRewardItem } from './ShortcutRewardManager';

const { ccclass, property } = _decorator;

@ccclass('ShortcutPanelController')
export class ShortcutPanelController extends UIBase {
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

    private readonly rewardManager = ShortcutRewardManager.instance;
    private _busy = false;
    private _rewardNodes: Node[] = [];

    onLoad(): void {
        this.resolveNodes();
        this.refreshRewards();
        this.refreshClaimState();
    }

    public async show(data?: any): Promise<void> {
        await super.show(data);
        this.refreshRewards();
        this.refreshClaimState();
    }

    public onClaimButtonClick(): void {
        void this.handleClaimButtonClick();
    }

    private resolveNodes(): void {
        this.contentNode = this.contentNode ?? this.node.getChildByName('Content');
        this.titleNode = this.titleNode ?? this.contentNode?.getChildByName('Title') ?? null;
        this.giftContainerNode = this.giftContainerNode ?? this.contentNode?.getChildByName('GiftContainer') ?? null;

        const claimNode = this.contentNode?.getChildByName('ClaimBtn') ?? null;
        this.claimButton = this.claimButton ?? claimNode?.getComponent(Button) ?? null;
        this.claimButtonLabel = this.claimButtonLabel ?? claimNode?.getChildByName('Label')?.getComponent(Label) ?? null;

        this._rewardNodes = [];
        for (let index = 1; index <= 3; index++) {
            const rewardNode = this.giftContainerNode?.getChildByName(`GiftItem${String(index).padStart(2, '0')}`) ?? null;
            if (rewardNode) {
                this._rewardNodes.push(rewardNode);
            }
        }
    }

    private async handleClaimButtonClick(): Promise<void> {
        if (this._busy) {
            return;
        }

        if (this.rewardManager.hasClaimedReward()) {
            this.refreshClaimState();
            return;
        }

        if (!canAddShortcut()) {
            this.refreshClaimState();
            return;
        }

        this._busy = true;
        this.refreshClaimState();

        try {
            const addResult = await addShortcut();
            if (!addResult.ok) {
                if (EDM.isDev()) {
                    console.warn('[ShortcutPanelController] 添加桌面未完成', addResult);
                }
                return;
            }

            const rewards = this.rewardManager.claimReward();
            if (!rewards) {
                return;
            }

            this.hide();
        } catch (error) {
            console.error('[ShortcutPanelController] 添加桌面领奖失败', error);
        } finally {
            this._busy = false;
            this.refreshClaimState();
        }
    }

    private refreshRewards(): void {
        const rewards = this.rewardManager.getRewards();
        this._rewardNodes.forEach((rewardNode, index) => {
            const reward = rewards[index];
            rewardNode.active = !!reward;
            if (!reward) {
                return;
            }
            this.renderRewardNode(rewardNode, reward);
        });
    }

    private renderRewardNode(rewardNode: Node, reward: ShortcutRewardItem): void {
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
        if (!iconPath) {
            return;
        }
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

    private refreshClaimState(): void {
        if (this.rewardManager.hasClaimedReward()) {
            this.setClaimButtonState(false, '已领取');
            return;
        }

        if (this._busy) {
            this.setClaimButtonState(false, '添加中...');
            return;
        }

        if (!canAddShortcut()) {
            this.setClaimButtonState(false, '暂不可用');
            return;
        }

        this.setClaimButtonState(true, '添加桌面');
    }

    private setClaimButtonState(interactable: boolean, labelText: string): void {
        if (this.claimButton) {
            this.claimButton.interactable = interactable;
        }
        if (this.claimButtonLabel) {
            this.claimButtonLabel.string = labelText;
        }
    }
}
