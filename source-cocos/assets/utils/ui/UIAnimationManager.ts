import { _decorator, Component, Node, Tween, Vec3, UIOpacity, tween, easing, Label, Sprite, Color, UITransform } from 'cc';
import { loadResSingleAsset } from 'db://assets/utils/utils';
const { ccclass, property } = _decorator;

/**
 * UI动画管理器
 * 提供面板动画、按钮反馈、货币变化等动画效果
 */
@ccclass('UIAnimationManager')
export class UIAnimationManager extends Component {
    private static _instance: UIAnimationManager = null!;
    
    public static get instance(): UIAnimationManager {
        return UIAnimationManager._instance;
    }

    onLoad() {
        if (UIAnimationManager._instance === null) {
            UIAnimationManager._instance = this;
        }
    }

    /**
     * 面板打开动画
     * @param panel 面板节点
     * @param duration 动画时长
     * @param onComplete 完成回调
     */
    public playPanelOpenAnimation(panel: Node, duration: number = 0.3, onComplete?: () => void): void {
        // 设置初始状态
        panel.setScale(0.8, 0.8, 1);
        const uiOpacity = panel.getComponent(UIOpacity) || panel.addComponent(UIOpacity);
        uiOpacity.opacity = 0;

        // 创建动画
        const scaleTween = tween(panel)
            .to(duration, { scale: new Vec3(1, 1, 1) }, { easing: easing.backOut })
            .start();

        const opacityTween = tween(uiOpacity)
            .to(duration, { opacity: 255 })
            .call(() => {
                onComplete?.();
            })
            .start();
    }

    /**
     * 面板关闭动画
     * @param panel 面板节点
     * @param duration 动画时长
     * @param onComplete 完成回调
     */
    public playPanelCloseAnimation(panel: Node, duration: number = 0.2, onComplete?: () => void): void {
        const scaleTween = tween(panel)
            .to(duration, { scale: new Vec3(0.8, 0.8, 1) }, { easing: easing.backIn })
            .start();

        const uiOpacity = panel.getComponent(UIOpacity);
        if (uiOpacity) {
            tween(uiOpacity)
                .to(duration, { opacity: 0 })
                .call(() => {
                    onComplete?.();
                })
                .start();
        } else {
            setTimeout(() => {
                onComplete?.();
            }, duration * 1000);
        }
    }

    /**
     * 按钮点击反馈动画
     * @param button 按钮节点
     * @param duration 动画时长
     */
    public playButtonClickAnimation(button: Node, duration: number = 0.1): void {
        const originalScale = button.getScale();
        
        tween(button)
            .to(duration / 2, { scale: new Vec3(originalScale.x * 0.9, originalScale.y * 0.9, 1) })
            .to(duration / 2, { scale: originalScale })
            .start();
    }

    /**
     * 货币变化动画
     * @param label 货币标签
     * @param fromValue 起始值
     * @param toValue 目标值
     * @param duration 动画时长
     * @param onComplete 完成回调
     */
    public playCurrencyChangeAnimation(
        label: Label, 
        fromValue: number, 
        toValue: number, 
        duration: number = 1.0,
        onComplete?: () => void
    ): void {
        const diff = toValue - fromValue;
        const startTime = Date.now();
        
        const updateValue = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const progress = Math.min(elapsed / duration, 1);
            
            // 使用缓动函数
            const easeProgress = this.easeOutQuart(progress);
            const currentValue = fromValue + diff * easeProgress;
            
            label.string = Math.floor(currentValue).toString();
            
            if (progress < 1) {
                setTimeout(updateValue, 16); // 约60fps
            } else {
                label.string = toValue.toString();
                onComplete?.();
            }
        };
        
        updateValue();
    }

    /**
     * 关卡切换动画
     * @param container 容器节点
     * @param direction 切换方向 (1: 向右, -1: 向左)
     * @param duration 动画时长
     * @param onComplete 完成回调
     */
    public playLevelTransitionAnimation(
        container: Node, 
        direction: number = 1, 
        duration: number = 0.5,
        onComplete?: () => void
    ): void {
        const startX = direction * 1000;
        const endX = 0;
        
        container.setPosition(startX, 0, 0);
        
        tween(container)
            .to(duration, { position: new Vec3(endX, 0, 0) }, { easing: easing.quadOut })
            .call(() => {
                onComplete?.();
            })
            .start();
    }

    /**
     * 物品获得动画
     * @param itemNode 物品节点
     * @param targetPosition 目标位置
     * @param duration 动画时长
     * @param onComplete 完成回调
     */
    public playItemObtainAnimation(
        itemNode: Node, 
        targetPosition: Vec3, 
        duration: number = 0.8,
        onComplete?: () => void
    ): void {
        const startScale = new Vec3(0.5, 0.5, 1);
        const endScale = new Vec3(1, 1, 1);
        
        itemNode.setScale(startScale);
        
        // 缩放动画
        tween(itemNode)
            .to(duration * 0.6, { scale: endScale }, { easing: easing.backOut })
            .start();
            
        // 移动动画
        tween(itemNode)
            .to(duration, { position: targetPosition }, { easing: easing.quadOut })
            .call(() => {
                onComplete?.();
            })
            .start();
    }

    /**
     * 闪烁动画
     * @param node 目标节点
     * @param duration 动画时长
     * @param onComplete 完成回调
     */
    public playBlinkAnimation(node: Node, duration: number = 0.5, onComplete?: () => void): void {
        const sprite = node.getComponent(Sprite);
        if (!sprite) return;
        
        const originalColor = sprite.color.clone();
        const blinkColor = new Color(255, 255, 255, 255);
        
        tween(sprite)
            .to(duration / 4, { color: blinkColor })
            .to(duration / 4, { color: originalColor })
            .to(duration / 4, { color: blinkColor })
            .to(duration / 4, { color: originalColor })
            .call(() => {
                onComplete?.();
            })
            .start();
    }

    /**
     * 缓动函数 - 四次方缓出
     */
    private easeOutQuart(t: number): number {
        return 1 - Math.pow(1 - t, 4);
    }

    /**
     * 金币飞散并飞向目标节点动画
     * @param fromNode 起始参考节点（通常为按钮）
     * @param targetNode 目标节点（例如 HUD 的 GoldLabel）
     * @param coinCount 金币数量（粒子个数）
     */
    public playCoinBurstAndFly(fromNode: Node, targetNode: Node, coinCount: number = 10): void {
        if (!fromNode) return;
        const root = fromNode.scene?.getChildByName('Canvas') || fromNode.parent;
        if (!root) return;

        const rootTransform = root.getComponent(UITransform);
        const fromTransform = fromNode.getComponent(UITransform);
        const targetTransform = targetNode.getComponent(UITransform);
        if (!rootTransform || !fromTransform || !targetTransform) return;

        const fromPos = fromNode.getWorldPosition();
        const targetPos = targetNode ? targetNode.getWorldPosition() : null;

        // 预加载金币图标
        const iconPath = 'textures/icon/res/coin/spriteFrame';
        loadResSingleAsset(iconPath, (sf) => {
            if (!sf) { console.warn('[UIAnimationManager] 金币图标加载失败', iconPath); }
            for (let i = 0; i < coinCount; i++) {
                const coin = new Node(`CoinFly_${i}`);
                const sp = coin.addComponent(Sprite);
                sp.spriteFrame = sf as any;
                const ui = coin.addComponent(UITransform);
                ui.setContentSize(24, 24);
                root.addChild(coin);

                // 起始在 from 附近，带随机偏移
                const randX = (Math.random() - 0.5) * 120;
                const randY = (Math.random() - 0.5) * 120;
                const start = rootTransform.convertToNodeSpaceAR(fromPos);
                coin.setPosition(start.x + randX, start.y + randY, 0);
                coin.setScale(1.2, 1.2, 1); // 调大金币尺寸

                // 先做一个小散开上抛
                const jumpPeak = new Vec3(coin.position.x + (Math.random() - 0.5) * 80, coin.position.y + 100 + Math.random() * 50, 0);
                const midTime = 0.25 + Math.random() * 0.1;
                const flyTime = 0.5 + Math.random() * 0.2;

                // console.log('[UIAnimationManager] 播放金币动画', { i, start: coin.position.clone() });
                tween(coin)
                    .to(midTime, { position: jumpPeak, scale: new Vec3(1.4, 1.4, 1) }, { easing: easing.quadOut })
                    .call(() => {
                        if (targetPos) {
                            const end = rootTransform.convertToNodeSpaceAR(targetPos);
                                                         // console.log('[UIAnimationManager] 金币飞向目标', { i, end });
                            tween(coin)
                                .to(flyTime, { position: new Vec3(end.x, end.y, 0), scale: new Vec3(0.4, 0.4, 1) }, { easing: easing.quadIn })
                                .call(() => {
                                                                         // console.log('[UIAnimationManager] 金币到达目标', { i });
                                    coin.destroy();
                                })
                                .start();
                        } else {
                            console.warn('[UIAnimationManager] 未找到目标节点，使用就地消散动画');
                            tween(coin)
                                .to(flyTime, { position: jumpPeak, scale: new Vec3(0.2, 0.2, 1) }, { easing: easing.quadIn })
                                .call(() => coin.destroy())
                                .start();
                        }
                    })
                    .start();
            }
        });
    }
} 