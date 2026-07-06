import { _decorator, Color, Component, Label, Node, ParticleSystem2D, tween, Tween, UIOpacity, UITransform, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

const TOUCH_START = new Vec3(-105, -125, 0);
const TOUCH_END = new Vec3(-75, -85, 0);

export interface HelpLayerShowOptions {
    showTouchHint?: boolean;
}

@ccclass('HelpLayerController')
export class HelpLayerController extends Component {
    @property(Node)
    touchNode: Node | null = null;

    @property(Node)
    rippleNode: Node | null = null;

    private _isPlaying = false;

    onLoad() {
        this.ensureNodes();
        this.ensureReadableDialog();
        this.resetVisualState();
    }

    show(options?: HelpLayerShowOptions): void {
        this.ensureNodes();
        this.ensureReadableDialog();
        const showTouchHint = options?.showTouchHint ?? true;
        if (showTouchHint && (!this.touchNode || !this.rippleNode)) {
            return;
        }

        this.stopTouchHintAnimation();
        this.node.active = true;
        if (this.node.parent) {
            this.node.setSiblingIndex(this.node.parent.children.length - 1);
        }

        this.resetVisualState();
        this.setTouchHintVisible(showTouchHint);
        this._isPlaying = showTouchHint;
        if (showTouchHint) {
            this.playLoop();
        } else {
            this.stopRipple();
        }
    }

    hide(): void {
        this.stopTouchHintAnimation();
        this.resetVisualState();
        this.setTouchHintVisible(true);
        this.node.active = false;
    }

    private ensureNodes(): void {
        this.touchNode = this.touchNode ?? this.node.getChildByName('Touch');
        this.rippleNode = this.rippleNode ?? this.node.getChildByName('Ripple');
    }

    private ensureReadableDialog(): void {
        const dialog = this.node.getChildByName('Dialog');
        if (!dialog) return;

        dialog.setPosition(70, 398, 0);
        const dialogTransform = dialog.getComponent(UITransform);
        if (dialogTransform) {
            dialogTransform.setContentSize(560, 188);
        }

        const labelNode = dialog.getChildByName('Label');
        const label = labelNode?.getComponent(Label);
        const labelTransform = labelNode?.getComponent(UITransform);
        if (!labelNode || !label || !labelTransform) return;

        labelNode.setPosition(0, 2, 0);
        labelTransform.setContentSize(500, 128);
        label.fontSize = 30;
        label.lineHeight = 38;
        label.overflow = Label.Overflow.SHRINK;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.enableOutline = true;
        label.outlineColor = new Color(12, 16, 32, 230);
        label.outlineWidth = 3;
    }

    private playLoop(): void {
        if (!this._isPlaying || !this.touchNode) {
            return;
        }

        tween(this.touchNode)
            .to(0.75, { position: TOUCH_END }, { easing: 'sineInOut' })
            .call(() => {
                this.playTapEffect();
            })
            .delay(0.15)
            .to(0.6, { position: TOUCH_START }, { easing: 'sineInOut' })
            .call(() => {
                this.playLoop();
            })
            .start();
    }

    private playTapEffect(): void {
        if (!this._isPlaying || !this.rippleNode) {
            return;
        }

        this.restartRipple();
        tween(this.rippleNode)
            .delay(0.18)
            .call(() => {
                this.restartRipple();
            })
            .start();
    }

    private restartRipple(): void {
        if (!this.rippleNode) {
            return;
        }

        const particle = this.rippleNode.getComponent(ParticleSystem2D);
        if (!particle) {
            return;
        }

        particle.stopSystem();
        particle.resetSystem();
    }

    private stopRipple(): void {
        const particle = this.rippleNode?.getComponent(ParticleSystem2D);
        particle?.stopSystem();
    }

    private stopTouchHintAnimation(): void {
        this._isPlaying = false;
        if (this.touchNode) {
            Tween.stopAllByTarget(this.touchNode);
        }
        if (this.rippleNode) {
            Tween.stopAllByTarget(this.rippleNode);
        }
        this.stopRipple();
    }

    private setTouchHintVisible(visible: boolean): void {
        if (this.touchNode) {
            this.touchNode.active = visible;
        }
        if (this.rippleNode) {
            this.rippleNode.active = visible;
        }
    }

    private resetVisualState(): void {
        if (this.touchNode) {
            this.touchNode.setPosition(TOUCH_START);
        }

        if (this.rippleNode) {
            const opacity = this.rippleNode.getComponent(UIOpacity);
            if (opacity) {
                opacity.opacity = 255;
            }
        }
    }
}
