import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('StarController')
export class StarController extends Component {
    start() {}

    init(type: string = '') {
        if (type === 'highlight') {
            this.node.getChildByName('Sprite1').active = true;
            this.node.getChildByName('Sprite2').active = false;
        } else {
            this.node.getChildByName('Sprite1').active = false;
            this.node.getChildByName('Sprite2').active = true;
        }
    }

    update(deltaTime: number) {}
}
