import { _decorator, Component, Node, Button, Sprite, Color, Vec3, tween, Enum, CCFloat, CCBoolean } from 'cc';
const { ccclass, property } = _decorator;

/**
 * 按钮反馈类型
 */
export enum ButtonFeedbackType {
    Scale = 'scale',           // 缩放反馈
    Color = 'color',           // 颜色反馈
    Blink = 'blink',          // 闪烁反馈
    Shake = 'shake'           // 震动反馈
}

/**
 * 按钮反馈组件
 * 为按钮提供点击反馈效果
 */
@ccclass('ButtonFeedback')
export class ButtonFeedback extends Component {
    @property({ type: Enum(ButtonFeedbackType), tooltip: '反馈类型' })
    feedbackType: ButtonFeedbackType = ButtonFeedbackType.Scale;

    @property({ type: CCFloat, tooltip: '动画时长', min: 0.01, max: 1.0 })
    duration: number = 0.1;

    @property({ type: CCFloat, tooltip: '缩放比例', min: 0.5, max: 1.5 })
    scaleRatio: number = 0.9;

    @property({ tooltip: '颜色反馈颜色' })
    feedbackColor: Color = new Color(255, 255, 255, 255);

    @property({ tooltip: '是否启用声音反馈' })
    enableSound: boolean = true;

    @property({ tooltip: '是否启用震动反馈' })
    enableVibration: boolean = true;

    private _originalScale: any = null;
    private _originalColor: Color | null = null;
    private _button: Button | null = null;
    private _sprite: Sprite | null = null;

    onLoad() {
        this.initButtonFeedback();
    }

    /**
     * 初始化按钮反馈
     */
    private initButtonFeedback(): void {
        this._button = this.getComponent(Button);
        this._sprite = this.getComponent(Sprite);

        if (this._button) {
            this._originalScale = this.node.getScale();
            if (this._sprite) {
                this._originalColor = this._sprite.color.clone();
            }

            // 绑定点击事件
            this._button.node.on(Button.EventType.CLICK, this.onButtonClick, this);
        }
    }

    /**
     * 按钮点击事件
     */
    private onButtonClick(): void {
        this.playFeedbackAnimation();
    }

    /**
     * 播放反馈动画
     */
    public playFeedbackAnimation(): void {
        switch (this.feedbackType) {
            case ButtonFeedbackType.Scale:
                this.playScaleFeedback();
                break;
            case ButtonFeedbackType.Color:
                this.playColorFeedback();
                break;
            case ButtonFeedbackType.Blink:
                this.playBlinkFeedback();
                break;
            case ButtonFeedbackType.Shake:
                this.playShakeFeedback();
                break;
        }

        // 播放声音和震动反馈
        if (this.enableSound) {
            this.playSoundFeedback();
        }
        if (this.enableVibration) {
            this.playVibrationFeedback();
        }
    }

    /**
     * 播放缩放反馈
     */
    private playScaleFeedback(): void {
        if (!this._originalScale) return;

        const targetScale = new Vec3(
            this._originalScale.x * this.scaleRatio,
            this._originalScale.y * this.scaleRatio,
            1
        );

        tween(this.node)
            .to(this.duration / 2, { scale: targetScale })
            .to(this.duration / 2, { scale: this._originalScale })
            .start();
    }

    /**
     * 播放颜色反馈
     */
    private playColorFeedback(): void {
        if (!this._sprite || !this._originalColor) return;

        tween(this._sprite)
            .to(this.duration / 2, { color: this.feedbackColor })
            .to(this.duration / 2, { color: this._originalColor })
            .start();
    }

    /**
     * 播放闪烁反馈
     */
    private playBlinkFeedback(): void {
        if (!this._sprite || !this._originalColor) return;

        tween(this._sprite)
            .to(this.duration / 4, { color: this.feedbackColor })
            .to(this.duration / 4, { color: this._originalColor })
            .to(this.duration / 4, { color: this.feedbackColor })
            .to(this.duration / 4, { color: this._originalColor })
            .start();
    }

    /**
     * 播放震动反馈
     */
    private playShakeFeedback(): void {
        const originalPosition = this.node.getPosition();
        const shakeDistance = 5;
        const shakeCount = 3;

        const shake = () => {
            const randomX = (Math.random() - 0.5) * shakeDistance;
            const randomY = (Math.random() - 0.5) * shakeDistance;
            
            this.node.setPosition(
                originalPosition.x + randomX,
                originalPosition.y + randomY,
                originalPosition.z
            );
        };

        let shakeTimes = 0;
        const shakeInterval = setInterval(() => {
            shake();
            shakeTimes++;
            if (shakeTimes >= shakeCount) {
                clearInterval(shakeInterval);
                this.node.setPosition(originalPosition);
            }
        }, this.duration * 1000 / shakeCount);
    }

    /**
     * 播放声音反馈
     */
    private playSoundFeedback(): void {
        // 这里可以播放按钮点击音效
        console.log('播放按钮点击音效');
    }

    /**
     * 播放震动反馈
     */
    private playVibrationFeedback(): void {
        // 这里可以触发设备震动
        console.log('触发设备震动');
    }

    /**
     * 设置反馈类型
     * @param type 反馈类型
     */
    public setFeedbackType(type: ButtonFeedbackType): void {
        this.feedbackType = type;
    }

    /**
     * 设置动画时长
     * @param duration 时长
     */
    public setDuration(duration: number): void {
        this.duration = duration;
    }

    /**
     * 设置缩放比例
     * @param ratio 比例
     */
    public setScaleRatio(ratio: number): void {
        this.scaleRatio = ratio;
    }

    /**
     * 设置反馈颜色
     * @param color 颜色
     */
    public setFeedbackColor(color: Color): void {
        this.feedbackColor = color;
    }

    /**
     * 设置声音启用状态
     * @param enable 是否启用
     */
    public setSoundEnabled(enable: boolean): void {
        this.enableSound = enable;
    }

    /**
     * 设置震动启用状态
     * @param enable 是否启用
     */
    public setVibrationEnabled(enable: boolean): void {
        this.enableVibration = enable;
    }

    /**
     * 手动触发反馈
     */
    public triggerFeedback(): void {
        this.playFeedbackAnimation();
    }
} 