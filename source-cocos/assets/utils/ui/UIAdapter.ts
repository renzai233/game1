import { _decorator, Component, Node, Widget, UITransform, view } from 'cc';
import { EDM } from '../data/env/ConfigManager';

const { ccclass } = _decorator;

@ccclass('UIAdapter')
export class UIAdapter extends Component {
    protected _isAdapted: boolean = false;

    protected adaptToScreen(): void {
        if (this._isAdapted) return;
        
        const uiTransform = this.node.getComponent(UITransform);
        if (uiTransform) {
            uiTransform.setContentSize(EDM.config.viewWidth, EDM.config.viewHeight);
        }

        this._isAdapted = true;
    }

    protected setupFullScreen(): void {
        this.adaptToScreen();

        const widget = this.node.getComponent(Widget);
        if (!widget) {
            const newWidget = this.node.addComponent(Widget);
            newWidget.isAlignTop = true;
            newWidget.isAlignBottom = true;
            newWidget.isAlignLeft = true;
            newWidget.isAlignRight = true;
            newWidget.top = 0;
            newWidget.bottom = 0;
            newWidget.left = 0;
            newWidget.right = 0;
        }
    }

    protected setupTopAligned(node: Node, offset: number = 0): void {
        if (!node) return;

        const widget = node.getComponent(Widget);
        if (!widget) {
            const newWidget = node.addComponent(Widget);
            newWidget.isAlignTop = true;
            newWidget.top = offset;
        }
    }

    protected setupContentNode(node: Node, width?: number, height: number = 0): void {
        if (!node) return;

        const uiTransform = node.getComponent(UITransform);
        if (uiTransform) {
            const screenSize = view.getVisibleSize();
            uiTransform.setContentSize(
                width || screenSize.width,
                height || screenSize.height
            );
        }
    }
}
