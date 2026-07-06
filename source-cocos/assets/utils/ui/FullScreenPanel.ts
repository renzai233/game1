import { _decorator, Node, Widget, UITransform, view } from 'cc';
import { UIBase } from './UIBase';
import { EDM } from '../data/env/ConfigManager';

const { ccclass, property } = _decorator;

/**
 * 全屏面板基类
 * 确保所有面板都全屏显示，导航栏显示在最前面
 */
@ccclass('FullScreenPanel')
export class FullScreenPanel extends UIBase {
    @property(Node)
    navigationNode: Node;

    protected onLoad() {
        this.setupFullScreen();
    }

    public refreshFullScreenLayout(): void {
        this.setupFullScreen();
    }

    protected setupFullScreen(): void {
        const visibleSize = view.getVisibleSize();
        const width = EDM.config?.viewWidth || visibleSize.width;
        const height = EDM.config?.viewHeight || visibleSize.height;

        const uiTransform = this.node.getComponent(UITransform);
        if (uiTransform) {
            uiTransform.setContentSize(width, height);
        }

        let widget = this.node.getComponent(Widget);
        if (!widget) {
            widget = this.node.addComponent(Widget);
        }
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.top = 0;
        widget.bottom = 0;
        widget.left = 0;
        widget.right = 0;
        widget.enabled = false;

        this.node.setPosition(0, 0, 0);
        this.node.setScale(1, 1, 1);

        if (this.navigationNode) {
            const navWidget = this.navigationNode.getComponent(Widget);
            if (!navWidget) {
                const newNavWidget = this.navigationNode.addComponent(Widget);
                newNavWidget.isAlignTop = true;
                newNavWidget.top = 0;
            }
        }
    }
}
