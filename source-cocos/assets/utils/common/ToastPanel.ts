// ui/ToastPanel.ts - 修复版
import { _decorator, Component, Node, Label, tween, Vec3, UIOpacity, Sprite } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('ToastPanel')
export class ToastPanel extends Component {

    @property(Label)
    private messageLabel: Label = null!;

    @property(Node)
    private background: Node = null!;

    // 单例实例
    private static instance: ToastPanel | null = null;

    // 显示队列
    private messageQueue: { message: string, duration: number }[] = [];
    private isShowing: boolean = false;

    onLoad() {
        ToastPanel.instance = this;
        this.node.active = false;
    }

    onDestroy() {
        if (ToastPanel.instance === this) {
            ToastPanel.instance = null;
        }
    }

    /**
     * 显示提示消息
     */
    public static show(message: string, duration: number = 2): void {
        if (this.instance) {
            this.instance.showMessage(message, duration);
        } else {
            console.warn('[ToastPanel] 实例未初始化');
        }
    }

    /**
     * 显示消息
     */
    private showMessage(message: string, showDuration: number): void {
        this.messageQueue.push({ message, duration: showDuration });

        if (!this.isShowing) {
            this.processQueue();
        }
    }

    /**
     * 处理消息队列
     */
    private processQueue(): void {
        if (this.messageQueue.length === 0) {
            this.isShowing = false;
            return;
        }

        this.isShowing = true;
        const { message, duration } = this.messageQueue.shift()!;

        this.node.active = true;
        this.messageLabel.string = message;

        // 重置位置和透明度
        this.node.setPosition(0, 0, 0);
        this.node.setScale(1, 1, 1);

        // 使用UIOpacity组件设置透明度
        let uiOpacity = this.node.getComponent(UIOpacity);
        if (!uiOpacity) {
            uiOpacity = this.node.addComponent(UIOpacity);
        }
        uiOpacity.opacity = 255;

        if (this.background) {
            let bgOpacity = this.background.getComponent(UIOpacity);
            if (!bgOpacity) {
                bgOpacity = this.background.addComponent(UIOpacity);
            }
            bgOpacity.opacity = 200;
        }

        // 动画：向上浮动并淡出
        tween(this.node)
            .to(0.3, { position: new Vec3(0, 100, 0) })
            .delay(duration)
            .to(0.3, {
                position: new Vec3(0, 150, 0)
            })
            .call(() => {
                this.node.active = false;
                // 处理下一条消息
                this.processQueue();
            })
            .start();

        // 淡出效果
        tween(uiOpacity)
            .delay(duration)
            .to(0.3, { opacity: 0 })
            .start();
    }

    /**
     * 立即隐藏所有提示
     */
    public static hideAll(): void {
        if (this.instance) {
            this.instance.messageQueue = [];
            this.instance.isShowing = false;
            this.instance.node.active = false;
        }
    }
}