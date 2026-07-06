import { _decorator, Component, Label, Sprite } from 'cc';
import { loadResSingleAsset } from 'db://assets/utils/utils';

const { ccclass, property } = _decorator;

interface IRewardItemData {
    amount: number;
    name?: string;
    iconPath?: string;
}

@ccclass('RewardItemController')
export class RewardItemController extends Component {
    @property(Sprite)
    icon: Sprite | null = null;

    @property(Label)
    nameLabel: Label | null = null;

    @property(Label)
    amountLabel: Label | null = null;

    public init(data: IRewardItemData): void {
        if (this.nameLabel) {
            this.nameLabel.string = data.name || '奖励';
        }
        if (this.amountLabel) {
            this.amountLabel.string = `+${data.amount}`;
        }

        if (this.icon && data.iconPath) {
            loadResSingleAsset(data.iconPath, (sf) => {
                if (this.icon && sf) {
                    this.icon.spriteFrame = sf as any;
                    return;
                }
                console.warn(`[RewardItemController] icon load failed: ${data.iconPath}`);
            });
        }
    }
}
