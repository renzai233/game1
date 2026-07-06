import { _decorator, Component, Label } from 'cc';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';

const { ccclass, property } = _decorator;

@ccclass('SettingsItemController')
export class SettingsItemController extends Component {
    _data: object = {}; // 数据

    /**
     * 更新名称标签（本地化）
     */
    private updateNameLabel(data: any): void {
        let nameKey = '';
        switch (data['item_id']) {
            case 0: // 金币
                nameKey = 'settings.coin';
                break;
            case 1: // 钻石
                nameKey = 'settings.gem';
                break;
            case 2: // 体力
                nameKey = 'settings.stamina';
                break;
        }

        if (nameKey && this.node) {
            const nameLabel = this.node.getChildByName('Main')?.getChildByName('Name')?.getComponent(Label);
            if (nameLabel) {
                nameLabel.string = EDM.getText(nameKey);
            }
        }
    }

    /**
     * 更新描述标签（本地化）
     */
    private updateDescLabel(data: any): void {
        let descKey = '';
        let value = data['value'];
        
        switch (data['item_id']) {
            case 0: // 金币
                descKey = 'settings.get_gold';
                break;
            case 1: // 钻石
                descKey = 'settings.get_gem';
                break;
            case 2: // 体力
                descKey = 'settings.get_stamina';
                break;
        }

        if (descKey && this.node) {
            const descLabel = this.node.getChildByName('Main')?.getChildByName('Desc')?.getComponent(Label);
            if (descLabel) {
                const localizedText = EDM.getText(descKey);
                descLabel.string = localizedText.replace('{0}', value.toString());
            }
        }
    }

    /**
     * 更新按钮文本（本地化）
     */
    private updateButtonText(): void {
        if (!this.node) return;

        // 更新领取按钮文本
        const claimButton = this.node.getChildByName('Button');
        if (claimButton) {
            const buttonLabel = claimButton.getComponentInChildren(Label);
            if (buttonLabel) {
                buttonLabel.string = EDM.getText('settings.claim');
            }
        }

        // 更新已领取按钮文本
        const claimedButton = this.node.getChildByName('ButtonReceive');
        if (claimedButton) {
            const buttonLabel = claimedButton.getComponentInChildren(Label);
            if (buttonLabel) {
                buttonLabel.string = EDM.getText('settings.claimed');
            }
        }
    }

    // 更新次数提示
    updateTip() {
        if (!this.node) return;

        const tipLabel = this.node.getChildByName('Main')?.getChildByName('Tip')?.getComponent(Label);
        if (tipLabel) {
            const tipText = EDM.getText('settings.remaining_today');
            const localizedTip = tipText.replace('{0}', this._data['number'].toString());
            tipLabel.string = localizedTip;
        }
    }

    /**
     * 刷新本地化文本（供外部调用）
     */
    public refreshLocalization(): void {
        this.updateNameLabel(this._data);
        this.updateDescLabel(this._data);
        this.updateButtonText();
        this.updateTip();
    }
}