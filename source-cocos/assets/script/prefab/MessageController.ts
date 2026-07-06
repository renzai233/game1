import { _decorator, Component, Label, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('MessageController')
export class MessageController extends Component {
    start() {}

    init(message: string) {
        this.node.getChildByName('Label').getComponent(Label).string = message;

        this.scheduleOnce(() => {
            this.node.destroy();
        }, 1);
    }

    update(deltaTime: number) {}
}
