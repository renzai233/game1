import { _decorator, Node, tween, Vec3, UIOpacity, Tween } from 'cc';
import { Singleton } from './Singleton';

const { ccclass } = _decorator;

export enum AnimationDirection {
    TOP_TO_BOTTOM = 'top-to-bottom',
    BOTTOM_TO_TOP = 'bottom-to-top',
    LEFT_TO_RIGHT = 'left-to-right',
    RIGHT_TO_LEFT = 'right-to-left',
    FADE_IN = 'fade-in',
    FADE_OUT = 'fade-out',
    SCALE_IN = 'scale-in',
    SCALE_OUT = 'scale-out',
    BOUNCE_IN = 'bounce-in',
    BOUNCE_OUT = 'bounce-out'
}

export enum EasingType {
    LINEAR = 'linear',
    SINE_IN = 'sineIn',
    SINE_OUT = 'sineOut',
    SINE_IN_OUT = 'sineInOut',
    QUAD_IN = 'quadIn',
    QUAD_OUT = 'quadOut',
    QUAD_IN_OUT = 'quadInOut',
    CUBIC_IN = 'cubicIn',
    CUBIC_OUT = 'cubicOut',
    CUBIC_IN_OUT = 'cubicInOut',
    QUART_IN = 'quartIn',
    QUART_OUT = 'quartOut',
    QUART_IN_OUT = 'quartInOut',
    QUINT_IN = 'quintIn',
    QUINT_OUT = 'quintOut',
    QUINT_IN_OUT = 'quintInOut',
    EXPO_IN = 'expoIn',
    EXPO_OUT = 'expoOut',
    EXPO_IN_OUT = 'expoInOut',
    CIRC_IN = 'circIn',
    CIRC_OUT = 'circOut',
    CIRC_IN_OUT = 'circInOut',
    BACK_IN = 'backIn',
    BACK_OUT = 'backOut',
    BACK_IN_OUT = 'backInOut',
    ELASTIC_IN = 'elasticIn',
    ELASTIC_OUT = 'elasticOut',
    ELASTIC_IN_OUT = 'elasticInOut',
    BOUNCE_IN = 'bounceIn',
    BOUNCE_OUT = 'bounceOut',
    BOUNCE_IN_OUT = 'bounceInOut'
}

export interface AnimationConfig {
    duration?: number;
    delay?: number;
    easing?: EasingType;
    overshoot?: number;
    repeatForever?: boolean;
    delayFirstTime?: boolean;
    onComplete?: () => void;
}

@ccclass('JuicyAnimationManager')
export class JuicyAnimationManager extends Singleton {

    playSlideDownAnimation(
        node: Node,
        config: AnimationConfig = {}
    ): void {
        const {
            duration = 0.3,
            delay = 0,
            easing = EasingType.BACK_OUT,
            onComplete
        } = config;

        const originalPos = node.getPosition().clone();
        node.setPosition(originalPos.x, originalPos.y + 200, originalPos.z);

        tween(node)
            .delay(delay)
            .to(duration, { position: originalPos }, { easing })
            .call(() => {
                onComplete?.();
            })
            .start();
    }

    public playSlideUpAnimation(
        node: Node,
        config: AnimationConfig = {}
    ): void {
        const {
            duration = 0.3,
            delay = 0,
            easing = EasingType.BACK_OUT,
            onComplete
        } = config;

        const originalPos = node.getPosition().clone();
        node.setPosition(originalPos.x, originalPos.y - 200, originalPos.z);

        tween(node)
            .delay(delay)
            .to(duration, { position: originalPos }, { easing })
            .call(() => {
                onComplete?.();
            })
            .start();
    }

    public playSlideUpWithBounceAnimation(
        node: Node,
        config: AnimationConfig = {}
    ): void {
        const {
            duration = 0.4,
            delay = 0,
            overshoot = 50,
            onComplete
        } = config;

        const originalPos = node.getPosition().clone();
        const overshootY = originalPos.y - overshoot;

        node.setPosition(originalPos.x, originalPos.y - 300, originalPos.z);

        tween(node)
            .delay(delay)
            .to(duration * 0.6, { position: new Vec3(originalPos.x, overshootY, originalPos.z) }, { easing: EasingType.QUAD_OUT })
            .to(duration * 0.4, { position: originalPos }, { easing: EasingType.BACK_OUT })
            .call(() => {
                onComplete?.();
            })
            .start();
    }

    public playSlideDownWithBounceAnimation(
        node: Node,
        config: AnimationConfig = {}
    ): void {
        const {
            duration = 0.4,
            delay = 0,
            overshoot = 50,
            onComplete
        } = config;

        const originalPos = node.getPosition().clone();
        const overshootY = originalPos.y + overshoot;

        node.setPosition(originalPos.x, originalPos.y + 300, originalPos.z);

        tween(node)
            .delay(delay)
            .to(duration * 0.6, { position: new Vec3(originalPos.x, overshootY, originalPos.z) }, { easing: EasingType.QUAD_OUT })
            .to(duration * 0.4, { position: originalPos }, { easing: EasingType.BACK_OUT })
            .call(() => {
                onComplete?.();
            })
            .start();
    }

    public playSlideLeftAnimation(
        node: Node,
        config: AnimationConfig = {}
    ): void {
        const {
            duration = 0.3,
            delay = 0,
            easing = EasingType.BACK_OUT,
            onComplete
        } = config;

        const originalPos = node.getPosition().clone();
        node.setPosition(originalPos.x + 200, originalPos.y, originalPos.z);

        tween(node)
            .delay(delay)
            .to(duration, { position: originalPos }, { easing })
            .call(() => {
                onComplete?.();
            })
            .start();
    }

    public playSlideRightAnimation(
        node: Node,
        config: AnimationConfig = {}
    ): void {
        const {
            duration = 0.3,
            delay = 0,
            easing = EasingType.BACK_OUT,
            onComplete
        } = config;

        const originalPos = node.getPosition().clone();
        node.setPosition(originalPos.x - 200, originalPos.y, originalPos.z);

        tween(node)
            .delay(delay)
            .to(duration, { position: originalPos }, { easing })
            .call(() => {
                onComplete?.();
            })
            .start();
    }

    public playFadeInAnimation(
        node: Node,
        config: AnimationConfig = {}
    ): void {
        const {
            duration = 0.3,
            delay = 0,
            easing = EasingType.SINE_OUT,
            onComplete
        } = config;

        const uiOpacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
        uiOpacity.opacity = 0;

        tween(uiOpacity)
            .delay(delay)
            .to(duration, { opacity: 255 }, { easing })
            .call(() => {
                onComplete?.();
            })
            .start();
    }

    public playFadeOutAnimation(
        node: Node,
        config: AnimationConfig = {}
    ): void {
        const {
            duration = 0.3,
            delay = 0,
            easing = EasingType.SINE_IN,
            onComplete
        } = config;

        const uiOpacity = node.getComponent(UIOpacity);
        if (!uiOpacity) {
            onComplete?.();
            return;
        }

        tween(uiOpacity)
            .delay(delay)
            .to(duration, { opacity: 0 }, { easing })
            .call(() => {
                onComplete?.();
            })
            .start();
    }

    public playScaleInAnimation(
        node: Node,
        config: AnimationConfig = {}
    ): void {
        const {
            duration = 0.3,
            delay = 0,
            easing = EasingType.BACK_OUT,
            onComplete
        } = config;

        const originalScale = node.getScale().clone();
        node.setScale(0, 0, 1);

        tween(node)
            .delay(delay)
            .to(duration, { scale: originalScale }, { easing })
            .call(() => {
                onComplete?.();
            })
            .start();
    }

    public playScaleOutAnimation(
        node: Node,
        config: AnimationConfig = {}
    ): void {
        const {
            duration = 0.3,
            delay = 0,
            easing = EasingType.BACK_IN,
            onComplete
        } = config;

        tween(node)
            .delay(delay)
            .to(duration, { scale: new Vec3(0, 0, 1) }, { easing })
            .call(() => {
                onComplete?.();
            })
            .start();
    }

    public playBounceInAnimation(
        node: Node,
        config: AnimationConfig = {}
    ): void {
        const {
            duration = 0.5,
            delay = 0,
            onComplete
        } = config;

        const originalScale = node.getScale().clone();
        node.setScale(0, 0, 1);

        tween(node)
            .delay(delay)
            .to(duration * 0.6, { scale: originalScale.clone().multiplyScalar(1.2) }, { easing: EasingType.BACK_OUT })
            .to(duration * 0.4, { scale: originalScale }, { easing: EasingType.BACK_OUT })
            .call(() => {
                onComplete?.();
            })
            .start();
    }

    public playBounceOutAnimation(
        node: Node,
        config: AnimationConfig = {}
    ): void {
        const {
            duration = 0.5,
            delay = 0,
            onComplete
        } = config;

        const originalScale = node.getScale().clone();

        tween(node)
            .delay(delay)
            .to(duration * 0.4, { scale: originalScale.clone().multiplyScalar(1.2) }, { easing: EasingType.BACK_IN })
            .to(duration * 0.6, { scale: new Vec3(0, 0, 1) }, { easing: EasingType.BACK_IN })
            .call(() => {
                onComplete?.();
            })
            .start();
    }

    public playPulseAnimation(
        node: Node,
        config: AnimationConfig = {}
    ): void {
        const {
            duration = 1.0,
            delay = 0
        } = config;

        const originalScale = node.getScale().clone();
        const pulseScale = originalScale.clone().multiplyScalar(1.1);

        tween(node)
            .delay(delay)
            .to(duration / 2, { scale: pulseScale }, { easing: EasingType.SINE_IN_OUT })
            .to(duration / 2, { scale: originalScale }, { easing: EasingType.SINE_IN_OUT })
            .union()
            .repeatForever()
            .start();
    }

    public playShakeAnimation(
        node: Node,
        config: AnimationConfig = {}
    ): void {
        const {
            duration = 0.5,
            delay = 0,
            repeatForever = false,
            delayFirstTime = true,
            onComplete
        } = config;

        const originalPos = node.getPosition().clone();
        const shakeAmount = 10;

        const buildShakeTween = (initialDelay: number) => {
            return tween(node)
                .delay(initialDelay)
                .to(duration * 0.125, { position: new Vec3(originalPos.x + shakeAmount, originalPos.y, originalPos.z) })
                .to(duration * 0.125, { position: new Vec3(originalPos.x - shakeAmount, originalPos.y, originalPos.z) })
                .to(duration * 0.125, { position: new Vec3(originalPos.x + shakeAmount, originalPos.y, originalPos.z) })
                .to(duration * 0.125, { position: new Vec3(originalPos.x - shakeAmount, originalPos.y, originalPos.z) })
                .to(duration * 0.125, { position: new Vec3(originalPos.x + shakeAmount, originalPos.y, originalPos.z) })
                .to(duration * 0.125, { position: new Vec3(originalPos.x - shakeAmount, originalPos.y, originalPos.z) })
                .to(duration * 0.125, { position: new Vec3(originalPos.x + shakeAmount, originalPos.y, originalPos.z) })
                .to(duration * 0.125, { position: originalPos });
        };

        if (repeatForever) {
            if (!delayFirstTime) {
                buildShakeTween(0)
                    .call(() => {
                        buildShakeTween(delay).union().repeatForever().start();
                    })
                    .start();
            } else {
                buildShakeTween(delay).union().repeatForever().start();
            }
        } else {
            buildShakeTween(delay)
                .call(() => {
                    onComplete?.();
                })
                .start();
        }
    }

    public playPopAnimation(
        node: Node,
        config: AnimationConfig = {}
    ): void {
        const {
            duration = 0.3,
            delay = 0,
            onComplete
        } = config;

        const originalScale = node.getScale().clone();
        node.setScale(originalScale.clone().multiplyScalar(0.8));

        tween(node)
            .delay(delay)
            .to(duration * 0.6, { scale: originalScale.clone().multiplyScalar(1.1) }, { easing: EasingType.BACK_OUT })
            .to(duration * 0.4, { scale: originalScale }, { easing: EasingType.BACK_OUT })
            .call(() => {
                onComplete?.();
            })
            .start();
    }

    public stopAllAnimations(node: Node): void {
        Tween.stopAllByTarget(node);
    }

    public playDirectionAnimation(
        node: Node,
        direction: AnimationDirection,
        config: AnimationConfig = {}
    ): void {
        node.setScale(1, 1, 1);
        switch (direction) {
            case AnimationDirection.TOP_TO_BOTTOM:
                this.playSlideDownAnimation(node, config);
                break;
            case AnimationDirection.BOTTOM_TO_TOP:
                this.playSlideUpAnimation(node, config);
                break;
            case AnimationDirection.LEFT_TO_RIGHT:
                this.playSlideLeftAnimation(node, config);
                break;
            case AnimationDirection.RIGHT_TO_LEFT:
                this.playSlideRightAnimation(node, config);
                break;
            case AnimationDirection.FADE_IN:
                this.playFadeInAnimation(node, config);
                break;
            case AnimationDirection.FADE_OUT:
                this.playFadeOutAnimation(node, config);
                break;
            case AnimationDirection.SCALE_IN:
                this.playScaleInAnimation(node, config);
                break;
            case AnimationDirection.SCALE_OUT:
                this.playScaleOutAnimation(node, config);
                break;
            case AnimationDirection.BOUNCE_IN:
                this.playBounceInAnimation(node, config);
                break;
            case AnimationDirection.BOUNCE_OUT:
                this.playBounceOutAnimation(node, config);
                break;
            default:
                console.warn(`[JAM] 未知的动画方向: ${direction}`);
        }
    }
}


export const JAM = JuicyAnimationManager.instance();
