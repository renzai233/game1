import { _decorator, Component, Node, UITransform, Color, EventTouch, director, view, tween, Vec3, Graphics, Label, Enum } from 'cc';
import { EventBus } from './UIEventBus';
import { Skin1UIPolish } from './skin1/Skin1UIPolish';

const { ccclass, property } = _decorator;

export enum UIGroup {
    Main = 'Main',
    Popup = 'Popup',
    Toast = 'Toast',
    Guide = 'Guide'
}

Enum(UIGroup);

export enum UIMaskStyle {
    None = 'none',
    SemiTransparent = 'semiTransparent',
    Transparent = 'transparent'
}

Enum(UIMaskStyle);

@ccclass('UIBase')
export class UIBase extends Component {
    @property
    protected closeOnMask: boolean = true;
    
    protected _inited: boolean = false;
    
    @property({ type: UIGroup })
    group: UIGroup = UIGroup.Popup;
    
    @property
    uiKey: string = '';
    
    protected eventBus = EventBus.instance;
    
    protected maskNode: Node | null = null;
    protected contentNode: Node | null = null;
    protected _maskStyle: UIMaskStyle = UIMaskStyle.SemiTransparent;

    public async show(data?: any): Promise<void> {
        if (!this.node || !this.node.isValid) return;
        
        if (!this._inited) {
            this._initMask();
            this._initContentNode();
            this._inited = true;
        }
        
        this.node.active = true;
        this._resize();
        Skin1UIPolish.applyPanel(this.node);
        this.onShow(data);
        await this.onLoadData(data);
        this._playOpenAnim();
        this.node.setSiblingIndex(1001);
    }

    public hide(): void {
        if (!this.node || !this.node.isValid) return;
        
        this._playCloseAnim(() => {
            if (this.node && this.node.isValid) {
                this.node.active = false;
                this.onHide();
            }
        });
    }

    protected onShow(data?: any): void {}
    
    protected onHide(): void {}
    
    protected async onLoadData(data?: any): Promise<void> {}
    
    protected onResize(): void {}

    protected getContentNode(): Node {
        return this.contentNode;
    }

    private _initContentNode(): void {
        if (this.contentNode) {
            this._ensureContentNodeEvents(this.contentNode);
            return;
        }

        const fallback = this.node.children.find(child => child !== this.maskNode) || this.node;
        this.contentNode = fallback;
        this._ensureContentNodeEvents(this.contentNode);
    }

    private _ensureContentNodeEvents(contentNode: Node): void {
        const events = [
            Node.EventType.TOUCH_START,
            Node.EventType.TOUCH_MOVE,
            Node.EventType.TOUCH_END,
            Node.EventType.TOUCH_CANCEL
        ];
        
        events.forEach(event => {
            if (!contentNode.hasEventListener(event)) {
                contentNode.on(event, (e: EventTouch) => {
                    e.propagationStopped = true;
                });
            }
        });
    }

    protected setMaskStyle(style: UIMaskStyle): void {
        this._maskStyle = style;
        if (this.maskNode) {
            this._updateMaskStyle();
        }
    }

    private _initMask(): void {
        if (this.maskNode) return;
        
        this.maskNode = new Node('UIMask');
        const uiTrans = this.maskNode.getComponent(UITransform) || this.maskNode.addComponent(UITransform);
        uiTrans.setContentSize(view.getVisibleSize());
        this.maskNode.layer = this.node.layer;
        this.maskNode.parent = this.node;
        this.maskNode.setSiblingIndex(0);
        
        this._updateMaskStyle();
        this._addMaskTip();
        
        this.maskNode.on(Node.EventType.TOUCH_END, this._onMaskClick, this);
        view.on('design-resolution-changed', this._resize, this);
    }

    private _updateMaskStyle(): void {
        if (!this.maskNode) return;

        const graphics = this.maskNode.getComponent(Graphics) || this.maskNode.addComponent(Graphics);

        graphics.clear();
        
        switch (this._maskStyle) {
            case UIMaskStyle.SemiTransparent:
                graphics.fillColor = new Color(0, 0, 0, 150);
                break;
            case UIMaskStyle.Transparent:
                graphics.fillColor = new Color(0, 0, 0, 50);
                break;
            case UIMaskStyle.None:
                graphics.fillColor = new Color(0, 0, 0, 0);
                break;
        }
        
        const visibleSize = view.getVisibleSize();
        graphics.rect(-visibleSize.width / 2, -visibleSize.height / 2, visibleSize.width, visibleSize.height);
        graphics.fill();
    }

    private _addMaskTip(): void {
        if (!this.maskNode) return;

        const tipLabel = new Node('MaskTip');
        const tipLabelComp = tipLabel.addComponent(Label);
        tipLabelComp.string = '轻触暗区返回';
        tipLabelComp.color = new Color(166, 226, 255, 210);
        tipLabelComp.fontSize = 20;
        tipLabelComp.lineHeight = 24;
        tipLabelComp.overflow = Label.Overflow.NONE;
        tipLabelComp.horizontalAlign = 1;
        tipLabelComp.verticalAlign = 1;

        const winSize = view.getVisibleSize();
        const tipLabelTrans = tipLabel.getComponent(UITransform) || tipLabel.addComponent(UITransform);
        tipLabelTrans.width = winSize.width - 40;
        tipLabel.setPosition(0, -winSize.height / 2 + winSize.height * 0.15);
        tipLabel.parent = this.maskNode;
    }

    protected _onMaskClick(event: EventTouch): void {
        if (this.closeOnMask) {
            this.hide();
        }
    }

    protected _resize(): void {
        if (this.maskNode) {
            this.maskNode.getComponent(UITransform).setContentSize(view.getVisibleSize());
            this._updateMaskStyle();
        }
        this.onResize();
    }

    protected _playOpenAnim(): void {
        const content = this.getContentNode();
        if (!content) return;
        
        content.setScale(new Vec3(0.8, 0.8, 1));
        tween(content)
            .to(0.5, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();
    }

    protected _playCloseAnim(callback?: () => void): void {
        const content = this.getContentNode();
        if (!content) {
            if (callback) callback();
            return;
        }
        
        tween(content)
            .to(0.15, { scale: new Vec3(0.8, 0.8, 1) }, { easing: 'backIn' })
            .call(() => {
                if (callback) callback();
            })
            .start();
    }

    public onStyleChanged(style: string): void {}

    public onLanguageChanged(lang: string): void {}

    public destroyUI(): void {
        this.node.destroy();
    }

    protected onDestroy(): void {
        // maskNode.off 不调用说明：maskNode 是子节点，在 onDestroy 执行前通常已随父节点销毁，事件会自动清理，无需手动 off

        view.off('design-resolution-changed', this._resize, this);
    }
}
