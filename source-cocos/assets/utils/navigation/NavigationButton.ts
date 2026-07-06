import { _decorator, Component, Node, Label, Button, Sprite, tween, Vec3, Color, UIOpacity, UITransform, Widget } from 'cc';
import { INavigationButton } from './NavigationConfig';
import { EDM } from '../data/env/ConfigManager';
import { loadResSingleAsset } from '../utils';
import { APM } from '../common/AudioPlayManager';

const { ccclass, property } = _decorator;

const ICON_BG_PATH = 'textures/ui/nav/nav-';
const SELECTED_OFFSET = 8;
const ICON_SCALE_SELECTED = 1;
const ICON_SCALE_UNSELECTED = 0.92;
const NAV_LABEL_FALLBACK: Record<string, string> = {
    shop: '补给',
    bag: '仓库',
    home: '主页',
    hero: '阵容',
};

@ccclass('NavigationButton')
export class NavigationButton extends Component {
    @property({ type: Sprite, tooltip: '按钮图标' })
    icon: Sprite = null!;
    @property({ type: Label, tooltip: '按钮文字' })
    label: Label = null!;
    @property({ type: Button, tooltip: '按钮组件' })
    button: Button = null!;
    @property({ type: Sprite, tooltip: '按钮背景' })
    background: Sprite = null!;
    @property({ type: Sprite, tooltip: '按钮边框' })
    bgBorder: Sprite = null!;
    @property({ type: Sprite, tooltip: '提示图标' })
    notificationIcon: Sprite = null!;

    private _config: INavigationButton | null = null;
    private _isSelected: boolean = false;
    private _originalIconPosition: Vec3 = new Vec3();
    private _originalLabelPosition: Vec3 = new Vec3();

    public init(config: INavigationButton): void {
        this._config = config;
        this._isSelected = false;
        this.saveOriginalPositions();
        this.applyCompactFrame();
        this.updateDisplay();
        this.bindEvents();
        this.updateIconSize();
    }

    private applyCompactFrame(): void {
        const rootTransform = this.node.getComponent(UITransform);
        if (rootTransform) rootTransform.setContentSize(142, 112);

        const buttonTransform = this.button?.node.getComponent(UITransform);
        if (buttonTransform) buttonTransform.setContentSize(132, 110);

        const iconTransform = this.icon?.node.getComponent(UITransform);
        if (iconTransform) {
            iconTransform.setContentSize(94, 94);
            iconTransform.setAnchorPoint(0.5, 0.5);
        }

        const backgroundTransform = this.background?.node.getComponent(UITransform);
        if (backgroundTransform) backgroundTransform.setContentSize(72, 48);

        const labelTransform = this.label?.node.getComponent(UITransform);
        if (labelTransform) {
            labelTransform.setContentSize(108, 28);
            labelTransform.setAnchorPoint(0.5, 0.5);
        }
        const labelWidget = this.label?.node.getComponent(Widget);
        if (labelWidget) labelWidget.enabled = false;

        if (this.bgBorder?.node) this.bgBorder.node.active = false;

        const dotTransform = this.notificationIcon?.node.getComponent(UITransform);
        if (dotTransform) dotTransform.setContentSize(14, 14);
    }

    private saveOriginalPositions(): void {
        if (this.icon) {
            this._originalIconPosition = this.icon.node.position.clone();
        }
        if (this.label) {
            this._originalLabelPosition = this.label.node.position.clone();
        }
    }

    private updateDisplay(): void {
        if (!this._config) return;
        this.updateIcon();
        this.updateLabel();
    }

    private updateIcon(): void {
        try {
            if (!this.icon || !this._config) return;
            const iconPath = `${ICON_BG_PATH}${this._config.id}/spriteFrame`;
            if (EDM.isDev()) console.log('导航图标路径 ============= iconPath', iconPath);
            loadResSingleAsset(iconPath, (data) => {
                this.icon.spriteFrame = data
            });
            this.updateIconSize();
        } catch (error) {
            console.error('[NavigationButton] 加载图标失败:', error);
        }
    }

    private updateIconSize(): void {
        if (!this.icon) return;
        try {
            const uiTransform = this.icon.getComponent(UITransform);
            if (!uiTransform) return;

            if (this._isSelected) {
                this.icon.node.setScale(ICON_SCALE_SELECTED, ICON_SCALE_SELECTED, ICON_SCALE_SELECTED);
                this.background.node.setScale(0.92, 0.92, 1);
                this.icon.node.setPosition(0, 20, 0);
                loadResSingleAsset(`${ICON_BG_PATH}btn-sbg/spriteFrame`, (data) => {
                    this.background.spriteFrame = data;
                });
                this.background.node.setPosition(0, 11, 0);
                const opacity = this.background.node.getComponent(UIOpacity) || this.background.node.addComponent(UIOpacity);
                opacity.opacity = 118;
            } else {
                this.icon.node.setScale(ICON_SCALE_UNSELECTED, ICON_SCALE_UNSELECTED, ICON_SCALE_UNSELECTED);
                this.background.node.setScale(0.82, 0.82, 1);
                this.icon.node.setPosition(0, 18, 0);
                loadResSingleAsset(`${ICON_BG_PATH}btn-nbg/spriteFrame`, (data) => {
                    this.background.spriteFrame = data;
                });
                this.background.node.setPosition(0, 9, 0);
                const opacity = this.background.node.getComponent(UIOpacity) || this.background.node.addComponent(UIOpacity);
                opacity.opacity = 48;
            }
        } catch (error) {
            if (EDM.isDev()) console.error('[updateIconSize] 调整图标大小:', error);
        }
    }

    private updateLabel(): void {
        if (!this.label || !this._config) return;

        const localizedText = EDM.getText(this._config.name);
        this.label.string = localizedText && localizedText !== this._config.name
            ? localizedText
            : (NAV_LABEL_FALLBACK[this._config.id] || this._config.name);
        this.label.node.active = this._config.showName;
        this.label.fontSize = 22;
        this.label.lineHeight = 26;
        this.label.isBold = true;
        this.label.overflow = Label.Overflow.SHRINK;
        this.label.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.label.verticalAlign = Label.VerticalAlign.CENTER;
        this.label.color = this._isSelected
            ? new Color(238, 250, 255, 255)
            : new Color(170, 207, 230, 225);
        this.label.enableOutline = true;
        this.label.outlineColor = new Color(0, 0, 0, 200);
        this.label.outlineWidth = 2;

        if (this._isSelected) {
            this.label.node.setPosition(0, -42, 0);
        } else {
            this.label.node.setPosition(0, -44, 0);
        }
    }

    private updateNodePosition(node: Node, originalPosition: Vec3, offset: number): void {
        const newPosition = new Vec3(
            originalPosition.x,
            originalPosition.y + offset,
            originalPosition.z
        );
        node.setPosition(newPosition);
    }

    private bindEvents(): void {
        if (this.button) {
            this.button.node.on(Button.EventType.CLICK, this.onButtonClick, this);
        }
    }

    private onButtonClick(): void {
        if (!this._config) return;
        APM.playEffect('audio/effect/click');
        this.playClickAnimation();
        this.node.emit('navigation-button-click', this._config);
    }

    private playClickAnimation(): void {
        const originalScale = this.node.scale.clone();
        const targetScale = new Vec3(
            originalScale.x * 1.12,
            originalScale.y * 1.12,
            originalScale.z
        );
        tween(this.node)
            .to(0.08, { scale: targetScale })
            .to(0.12, { scale: originalScale }, { easing: 'backOut' })
            .start();
    }

    public setSelected(selected: boolean): void {
        this._isSelected = selected;
        this.updateIconSize();
        this.updateLabel();
    }

    public setEnabled(enabled: boolean): void {
        if (this.button) {
            this.button.interactable = enabled;
        }
    }

    public refreshLocalization(): void {
        console.log(`🔄 NavigationButton 刷新本地化: ${this._config?.name}`);
        this.updateLabel();
    }

    public get config(): INavigationButton | null {
        return this._config;
    }

    public get buttonId(): string {
        return this._config?.id || '';
    }

    public get isSelected(): boolean {
        return this._isSelected;
    }
}
