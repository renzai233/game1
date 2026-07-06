import { _decorator, Component, Node, Label, Sprite, Color } from 'cc';
import { UIBase } from '../../utils/ui/UIBase';

const { ccclass, property } = _decorator;

/**
 * 主页面板
 */
@ccclass('HomePanel')
export class HomePanel extends UIBase {
    @property(Label)
    titleLabel: Label = null;

    @property(Node)
    contentNode: Node = null;

    @property(Sprite)
    background: Sprite = null;

    onLoad() {
        super.onLoad();
        this.initPanel();
    }

    /**
     * 初始化面板
     */
    private initPanel(): void {
        if (this.titleLabel) {
            this.titleLabel.string = '主页';
        }

        if (this.background) {
            this.background.color = new Color(255, 255, 255, 255);
        }

        console.log('[HomePanel] 主页面板已初始化');
    }

    /**
     * 显示面板
     */
    public async show(data?: any): Promise<void> {
        super.show(data);
        
        if (this.contentNode) {
            this.contentNode.active = true;
        }

        console.log('[HomePanel] 主页面板已显示');
    }

    /**
     * 隐藏面板
     */
    public hide(): void {
        super.hide();
        
        if (this.contentNode) {
            this.contentNode.active = false;
        }

        console.log('[HomePanel] 主页面板已隐藏');
    }

    /**
     * 面板显示完成回调
     */
    protected onShowComplete(): void {
        console.log('[HomePanel] 主页面板显示完成');
    }

    /**
     * 面板隐藏完成回调
     */
    protected onHideComplete(): void {
        console.log('[HomePanel] 主页面板隐藏完成');
    }
} 