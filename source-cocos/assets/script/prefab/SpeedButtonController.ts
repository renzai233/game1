import { _decorator, Component, Node, Label } from 'cc';
import { GameData } from '../../utils/data/config/manager/GameDataManager';
const { ccclass, property } = _decorator;

@ccclass('SpeedButtonController')
export class SpeedButtonController extends Component {
    private speedList: number[] = [1, 2]; // 支持的倍速
    private curIndex: number = 0;

    onClickSpeed() {
        this.curIndex = (this.curIndex + 1) % this.speedList.length;
        GameData.speedScale = this.speedList[this.curIndex];
        this.updateLabel();
    }

    start() {
        this.updateLabel();
    }

    private updateLabel() {
        // 获取BtnSpeed下的Label节点并设置文本
        const labelNode = this.node.getComponentInChildren(Label);
        if (labelNode) {
            labelNode.string = `${GameData.speedScale}x`;
        }
    }
}
