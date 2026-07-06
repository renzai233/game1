import { _decorator, Component, Node, Sprite, UIOpacity, Label, Vec3, tween, easing } from 'cc';
import { UIAnimationManager } from '../../../utils/ui/UIAnimationManager';
const { ccclass, property } = _decorator;

/**
 * 关卡切换动画组件
 * 提供关卡切换的过渡效果
 */
@ccclass('LevelTransition')
export class LevelTransition extends Component {
    @property({ type: Node, tooltip: '过渡遮罩' })
    maskNode: Node = null!;

    @property({ type: Label, tooltip: '关卡标题' })
    levelTitleLabel: Label = null!;

    @property({ type: Label, tooltip: '关卡描述' })
    levelDescLabel: Label = null!;

    @property({ type: Node, tooltip: '加载进度条' })
    progressBar: Node = null!;

    @property({ type: Label, tooltip: '加载进度文本' })
    progressLabel: Label = null!;

    private _isTransitioning: boolean = false;
    private _onComplete: (() => void) | null = null;

    onLoad() {
        this.initTransition();
    }

    /**
     * 初始化过渡动画
     */
    private initTransition(): void {
        // 初始隐藏
        if (this.maskNode) {
            this.maskNode.active = false;
        }
    }

    /**
     * 开始关卡切换
     * @param levelData 关卡数据
     * @param onComplete 完成回调
     */
    public startTransition(levelData: any, onComplete?: () => void): void {
        if (this._isTransitioning) return;

        this._isTransitioning = true;
        this._onComplete = onComplete;

        // 显示遮罩
        if (this.maskNode) {
            this.maskNode.active = true;
        }

        // 更新关卡信息
        this.updateLevelInfo(levelData);

        // 播放进入动画
        this.playEnterAnimation();
    }

    /**
     * 更新关卡信息
     * @param levelData 关卡数据
     */
    private updateLevelInfo(levelData: any): void {
        if (this.levelTitleLabel) {
            this.levelTitleLabel.string = levelData.title || '关卡';
        }

        if (this.levelDescLabel) {
            this.levelDescLabel.string = levelData.description || '准备开始';
        }
    }

    /**
     * 播放进入动画
     */
    private playEnterAnimation(): void {
        if (this.maskNode) {
            const uiOpacity = this.maskNode.getComponent(UIOpacity) || this.maskNode.addComponent(UIOpacity);
            uiOpacity.opacity = 0;

            tween(uiOpacity)
                .to(0.5, { opacity: 255 })
                .call(() => {
                    this.startLoadingProgress();
                })
                .start();
        }
    }

    /**
     * 开始加载进度
     */
    private startLoadingProgress(): void {
        let progress = 0;
        const totalTime = 2000; // 2秒
        const startTime = Date.now();

        const updateProgress = () => {
            const elapsed = Date.now() - startTime;
            progress = Math.min((elapsed / totalTime) * 100, 100);

            this.updateProgressDisplay(progress);

            if (progress < 100) {
                setTimeout(updateProgress, 50);
            } else {
                setTimeout(() => {
                    this.playExitAnimation();
                }, 500);
            }
        };

        updateProgress();
    }

    /**
     * 更新进度显示
     * @param progress 进度值
     */
    private updateProgressDisplay(progress: number): void {
        if (this.progressLabel) {
            this.progressLabel.string = `${Math.floor(progress)}%`;
        }

        if (this.progressBar) {
            const currentScale = this.progressBar.getScale();
            this.progressBar.setScale(progress / 100, currentScale.y, currentScale.z);
        }
    }

    /**
     * 播放退出动画
     */
    private playExitAnimation(): void {
        if (this.maskNode) {
            const uiOpacity = this.maskNode.getComponent(UIOpacity);
            if (uiOpacity) {
                tween(uiOpacity)
                    .to(0.3, { opacity: 0 })
                    .call(() => {
                        this.onTransitionComplete();
                    })
                    .start();
            } else {
                this.onTransitionComplete();
            }
        } else {
            this.onTransitionComplete();
        }
    }

    /**
     * 过渡完成
     */
    private onTransitionComplete(): void {
        this._isTransitioning = false;

        // 隐藏遮罩
        if (this.maskNode) {
            this.maskNode.active = false;
        }

        // 调用完成回调
        if (this._onComplete) {
            this._onComplete();
            this._onComplete = null;
        }
    }

    /**
     * 快速切换（无动画）
     * @param levelData 关卡数据
     * @param onComplete 完成回调
     */
    public quickTransition(levelData: any, onComplete?: () => void): void {
        this.updateLevelInfo(levelData);
        
        setTimeout(() => {
            if (onComplete) {
                onComplete();
            }
        }, 100);
    }

    /**
     * 播放关卡完成动画
     * @param levelData 关卡数据
     * @param onComplete 完成回调
     */
    public playLevelCompleteAnimation(levelData: any, onComplete?: () => void): void {
        if (this.levelTitleLabel) {
            this.levelTitleLabel.string = '关卡完成！';
        }

        if (this.levelDescLabel) {
            this.levelDescLabel.string = '恭喜通关！';
        }

        // 播放完成特效
        if (UIAnimationManager.instance && this.maskNode) {
            UIAnimationManager.instance.playBlinkAnimation(this.maskNode, 1.0, () => {
                if (onComplete) {
                    onComplete();
                }
            });
        } else {
            setTimeout(() => {
                if (onComplete) {
                    onComplete();
                }
            }, 1000);
        }
    }

    /**
     * 播放关卡失败动画
     * @param levelData 关卡数据
     * @param onComplete 完成回调
     */
    public playLevelFailAnimation(levelData: any, onComplete?: () => void): void {
        if (this.levelTitleLabel) {
            this.levelTitleLabel.string = '挑战失败';
        }

        if (this.levelDescLabel) {
            this.levelDescLabel.string = '再接再厉！';
        }

        // 播放失败特效
        if (UIAnimationManager.instance && this.maskNode) {
            UIAnimationManager.instance.playBlinkAnimation(this.maskNode, 0.8, () => {
                if (onComplete) {
                    onComplete();
                }
            });
        } else {
            setTimeout(() => {
                if (onComplete) {
                    onComplete();
                }
            }, 800);
        }
    }

    /**
     * 获取是否正在过渡中
     */
    public get isTransitioning(): boolean {
        return this._isTransitioning;
    }
} 