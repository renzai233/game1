// 英雄项控制器脚本
// 负责单个英雄项的显示和交互
import { _decorator, Component, Node, Button, Label, Sprite, Color, Prefab, instantiate, UITransform, Widget, Animation, tween, Vec3, ProgressBar } from 'cc';
import { IHero as IHeroData } from './IHero';
import { HeroUpgradeNotificationManager, UpgradeNotificationType } from './HeroUpgradeNotificationManager';
import { ResourceManager, ResourceType } from 'db://assets/utils/data/config/manager/ResourceManager';
import { CDM } from 'db://assets/utils/common/CurrencyManager';
import { HDM } from '../data/config/hero/HeroDataManager';
import { HeroBackgroundConfig } from '../data/config/hero/HeroUIConfig';
import { EDM } from '../data/env/ConfigManager';
import { UNIT_ATTR } from '../data/dict/base/UnitAttrList';
import { HeroUtils } from './HeroUtils';
import { gameBus } from 'db://assets/utils/signal/GameBus';
import { SIGNAL_TYPES } from 'db://assets/utils/signal/ISignal';
import { Dialog2Controller } from 'db://assets/utils/ui/popup/Dialog2Controller';
import { MessageController } from 'db://assets/script/prefab/MessageController';
import { ToastPanel } from 'db://assets/utils/common/ToastPanel';
import { HeroUpgradeService } from './HeroUpgradeService';

const { ccclass, property } = _decorator;
const HERO_ICON_MAX_WIDTH = 206;
const HERO_ICON_MAX_HEIGHT = 246;
const HERO_ICON_MAX_SCALE = 1.55;

@ccclass('HeroItemController')
export class HeroItemController extends Component {
    @property({ type: Node, tooltip: '英雄图标' })
    heroIcon: Node = null!;
    @property({ type: Node, tooltip: '英雄名称' })
    heroName: Node = null!;
    @property({ type: Node, tooltip: '英雄等级' })
    heroLevel: Node = null!;
    @property({ type: Node, tooltip: '英雄属性' })
    heroAttr: Node = null!;
    @property({ type: Node, tooltip: '英雄星级' })
    heroStar: Node = null!;
    @property({ type: Node, tooltip: '背景节点' })
    background: Node = null!;
    @property({ type: Node, tooltip: '边框节点' })
    border: Node = null!;
    @property({ type: Node, tooltip: '锁定图标' })
    lockIcon: Node = null!;
    @property({ type: Node, tooltip: '上阵标记' })
    deployMark: Node = null!;
    @property({ type: Node, tooltip: '按钮容器' })
    buttonContainer: Node = null!;
    @property({ type: Node, tooltip: '升级提示图标' })
    upgradeNotification: Node = null!;
    @property({ type: Node, tooltip: '升级进度条' })
    upgradeProgress: Node = null!;
    @property({ type: Label, tooltip: '升级进度条' })
    upgradeLabel: Label = null!;
    @property({ type: Button, tooltip: '升级按钮' })
    upgradeButton: Button = null!;
    @property({ type: Node, tooltip: '升星提示图标' })
    starUpNotification: Node = null!;
    @property({ type: Prefab, tooltip: '确认对话框预制体' })
    dialogPrefab: Prefab = null!;
    @property({ type: Prefab, tooltip: '消息提示预制体' })
    messagePrefab: Prefab = null!;

    // 全局共享的图片加载队列（static），所有 HeroItem 共用，用于把多卡片的加载任务分帧处理
    private static _imageLoadQueue: Array<() => void> = [];
    private static _imageLoadScheduled: boolean = false;
    private static _imageLoadsPerTick: number = 4;
    private static _imageLoadTickMs: number = 16;

    private _heroId: number = 0;
    private _heroData: IHeroData | null = null;
    private _isUpgrading: boolean = false; // 升级状态控制
    private _currentAttrIconPath: string | null = null; // 当前正在加载的属性图标路径
    private _currentHeroIconPath: string | null = null; // 当前正在加载的英雄图标路径
    private _onHeroDataUpdatedHandler: ((data: any) => void) | null = null;
    private _onHeroFragmentAddedHandler: ((data: any) => void) | null = null;
    private _onCurrencyChangedHandler: (() => void) | null = null;

    // 全局分帧加载入口：不是单个实例私有队列，而是全局队列，避免列表首次打开时集中加载导致卡顿
    private static enqueueImageLoad(task: () => void): void {
        HeroItemController._imageLoadQueue.push(task);
        if (HeroItemController._imageLoadScheduled) return;
        HeroItemController._imageLoadScheduled = true;
        HeroItemController.flushImageLoadQueue();
    }

    private static flushImageLoadQueue(): void {
        let count = 0;
        while (count < HeroItemController._imageLoadsPerTick && HeroItemController._imageLoadQueue.length > 0) {
            const task = HeroItemController._imageLoadQueue.shift();
            if (task) {
                task();
            }
            count++;
        }

        if (HeroItemController._imageLoadQueue.length > 0) {
            const tickMs = HeroItemController._imageLoadTickMs;
            setTimeout(() => {
                HeroItemController.flushImageLoadQueue();
            }, tickMs);
        } else {
            HeroItemController._imageLoadScheduled = false;
        }
    }

    private loadSpriteFrame(path: string, onLoaded: (frame: any) => void): void {
        ResourceManager.getInstance()
            .load(path, ResourceType.SPRITE_FRAME, 'res')
            .then(onLoaded)
            .catch(() => onLoaded(null));
    }

    onLoad() {
        this.bindEvents();
    }

    onDestroy() {
        this.unbindEvents();
    }

    private bindEvents(): void {
        if (!this._onHeroDataUpdatedHandler) {
            this._onHeroDataUpdatedHandler = this.onHeroDataUpdated.bind(this);
        }
        if (!this._onHeroFragmentAddedHandler) {
            this._onHeroFragmentAddedHandler = this.onHeroFragmentAdded.bind(this);
        }
        if (!this._onCurrencyChangedHandler) {
            this._onCurrencyChangedHandler = this.onCurrencyChanged.bind(this);
        }

        gameBus.on(SIGNAL_TYPES.HERO_DATA_UPDATED, this._onHeroDataUpdatedHandler);
        gameBus.on(SIGNAL_TYPES.HERO_FRAGMENT_ADDED, this._onHeroFragmentAddedHandler);
        gameBus.on(SIGNAL_TYPES.CURRENCY_CHANGED, this._onCurrencyChangedHandler);

        if (this.upgradeButton) {
            this.upgradeButton.node.on(Button.EventType.CLICK, this.onUpgradeButtonClick, this);
        }
    }

    private unbindEvents(): void {
        if (this._onHeroDataUpdatedHandler) {
            gameBus.off(SIGNAL_TYPES.HERO_DATA_UPDATED, this._onHeroDataUpdatedHandler);
        }
        if (this._onHeroFragmentAddedHandler) {
            gameBus.off(SIGNAL_TYPES.HERO_FRAGMENT_ADDED, this._onHeroFragmentAddedHandler);
        }
        if (this._onCurrencyChangedHandler) {
            gameBus.off(SIGNAL_TYPES.CURRENCY_CHANGED, this._onCurrencyChangedHandler);
        }

        const upgradeNode = this.upgradeButton?.node;
        if (upgradeNode && upgradeNode.isValid) {
            upgradeNode.off(Button.EventType.CLICK, this.onUpgradeButtonClick, this);
        }
    }

    private onHeroDataUpdated(data: any): void {
        if (!this._heroData || !this.node || !this.node.isValid || !this.node.activeInHierarchy) return;
        if (data && data.heroId === this._heroId) {
            this.refreshHeroData();
        }
    }

    private onHeroFragmentAdded(data: any): void {
        if (!this._heroData || !this.node || !this.node.isValid || !this.node.activeInHierarchy) return;
        if (data && data.heroId === this._heroId) {
            this.refreshHeroData();
        }
    }

    private onCurrencyChanged(): void {
        if (!this._heroData || !this.node || !this.node.isValid || !this.node.activeInHierarchy) return;
        this.refreshHeroData();
    }

    /**
     * 初始化英雄项
     * @param heroData 英雄数据
     */
    public init(heroData: IHeroData): void {
        if (EDM.isDev()) console.log(`[HeroItemController] init: ${heroData?.name || 'Unknown'} (ID: ${heroData?.id || 'Unknown'})`);

        // 清理之前的状态，防止数据残留
        this.cleanup();

        this._heroData = heroData;
        this._heroId = Number(heroData.id) || 0;

        if (EDM.isDev()) console.log(`[HeroItemController] 英雄数据已设置: ${this._heroData?.name}, 等级: ${this._heroData?.level}, 星级: ${this._heroData?.star}`);

        // 检查关键属性是否正确设置
        this.updateDisplay(true);
        this.adjustInternalLayout();

        if (EDM.isDev()) console.log(`[HeroItemController] init 完成`);
    }

    /**
     * 清理状态，防止对象池复用时的数据残留
     */
    private cleanup(): void {
        // 停止所有动画
        if (this.heroIcon) {
            tween(this.heroIcon).stop();
        }
        if (this.heroLevel) {
            tween(this.heroLevel).stop();
        }
        if (this.upgradeNotification) {
            tween(this.upgradeNotification).stop();
        }
        if (this.upgradeButton) {
            tween(this.upgradeButton.node).stop();
        }

        // 重置当前图标路径
        this._currentAttrIconPath = null;
        this._currentHeroIconPath = null;
        this._heroId = 0;
        this.resetHeroIconTransform();

    }

    /**
     * 升级按钮点击事件
     */
    private onUpgradeButtonClick(): void {
        this.handleUpgrade();
    }

    /**
     * 处理升级逻辑（含确认）
     */
    private handleUpgrade(): void {
        if (!this._heroData) {
            if (EDM.isDev()) console.error(`[HeroItemController] 英雄数据为空，无法升级`);
            return;
        }

        if (this._isUpgrading) {
            return;
        }

        const canUpgrade = HDM.canUpgradeHero(Number(this._heroData.id));
        if (!canUpgrade) {
            this.showUpgradeFailedMessage();
            return;
        }

        this.showUpgradeConfirmDialog();
    }

    private showUpgradeConfirmDialog(): void {
        if (!this._heroData) return;

        const runtimeData = HDM.getHeroRuntimeData(Number(this._heroData.id));
        const currentLevel = runtimeData?.level || 1;
        const requiredFragments = HDM.calculateUpgradeFragments(currentLevel);

        const dialogData = {
            title: '升级确认',
            contentType: 'Label',
            content: `确定要升级 ${this._heroData.name} 吗？\n当前等级: Lv.${currentLevel}\n消耗碎片: ${requiredFragments}`
        };

        this.showDialog(dialogData, () => {
            this.executeUpgrade();
        });
    }

    private showUpgradeFailedMessage(): void {
        this.showMessage('碎片不足，无法升级');
    }

    private showDialog(data: any, onConfirm: () => void): void {
        if (!this.dialogPrefab) {
            onConfirm?.();
            return;
        }

        const dialogNode = instantiate(this.dialogPrefab);
        this.node.addChild(dialogNode);

        const dialogController = dialogNode.getComponent(Dialog2Controller);
        if (dialogController) {
            dialogController.init(data);
            dialogNode.once('sure', () => {
                onConfirm?.();
                dialogNode.destroy();
            });
            dialogNode.once('cancel', () => {
                dialogNode.destroy();
            });
        }
    }

    private showMessage(message: string): void {
        if (!this.messagePrefab) {
            ToastPanel.show(message);
            return;
        }

        const messageNode = instantiate(this.messagePrefab);
        this.node.addChild(messageNode);

        const messageController = messageNode.getComponent(MessageController);
        if (messageController) {
            messageController.init(message);
        }
    }

    private async executeUpgrade(): Promise<boolean> {
        if (!this._heroData) return false;
        if (this._isUpgrading) return false;

        const canUpgrade = HDM.canUpgradeHero(Number(this._heroData.id));
        if (!canUpgrade) {
            this.onUpgradeFailed('碎片不足，无法升级');
            return false;
        }

        this._isUpgrading = true;
        const result = await HeroUpgradeService.upgradeHero(Number(this._heroData.id));
        this._isUpgrading = false;

        if (result.success) {
            this.refreshHeroData();
            this.onUpgradeSuccess();
            return true;
        }

        this.onUpgradeFailed('升级失败');
        return false;
    }

    private onUpgradeSuccess(): void {
        this.playUpgradeSuccessAnimation();
    }

    private onUpgradeFailed(reason: string): void {
        this.showMessage(reason);
    }

    private playUpgradeSuccessAnimation(): void {
        if (!this.heroIcon || !this.heroLevel) return;

        const originalIconScale = this.heroIcon.scale.clone();
        const originalLevelScale = this.heroLevel.scale.clone();

        tween(this.heroIcon)
            .to(0.2, { scale: originalIconScale.clone().multiplyScalar(1.2) })
            .to(0.1, { scale: originalIconScale })
            .call(() => {
                if (this.heroLevel) {
                    const levelLabel = this.heroLevel.getComponent(Label);
                    if (levelLabel) {
                        const runtimeData = HDM.getHeroRuntimeData(Number(this._heroId));
                        const newLevel = runtimeData?.level || 1;
                        levelLabel.string = `Lv.${newLevel}`;

                        tween(this.heroLevel)
                            .to(0.1, { scale: originalLevelScale.clone().multiplyScalar(1.5) })
                            .to(0.2, { scale: originalLevelScale })
                            .start();
                    }
                }
            })
            .start();
    }

    /**
     * 获取英雄碎片数量
     * 使用新的CurrencyManager获取英雄专属碎片
     */
    private getHeroFragmentCount(): number {
        if (!this._heroData) return 0;

        try {
            return CDM.getHeroFragmentCount(Number(this._heroData.id));
        } catch (error) {
            const runtimeData = HDM.getHeroRuntimeData(Number(this._heroData.id));
            return runtimeData?.fragment || 0;
        }
    }

    /**
     * 更新升级进度条
     */
    private updateUpgradeProgress(): void {
        if (!this.upgradeProgress || !this._heroData) return;

        const progressBar = this.upgradeProgress.getComponent(ProgressBar);
        if (!progressBar) return;

        const runtimeData = HDM.getHeroRuntimeData(Number(this._heroData.id));
        const level = runtimeData?.level || 1;
        const currentFragments = this.getHeroFragmentCount();
        const requiredFragments = HDM.calculateUpgradeFragments(level);
        const progress = Math.min(currentFragments / requiredFragments, 1);

        progressBar.progress = progress;
        this.updateProgressText(currentFragments, requiredFragments);
    }

    /**
     * 格式化数字为千分位显示
     * @param num 数字
     * @returns 格式化后的字符串
     */
    private formatNumber(num: number): string {
        if (isNaN(num) || !isFinite(num)) return '0';

        if (num < 1000) {
            return num.toString();
        } else if (num < 1000000) {
            return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        } else if (num < 1000000000) {
            return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        } else {
            return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
        }
    }

    /**
     * 更新进度条文本
     */
    private updateProgressText(currentFragments: number, requiredFragments: number): void {
        const text = `${this.formatNumber(currentFragments)} / ${this.formatNumber(requiredFragments)}`;

        if (this.upgradeLabel) {
            this.upgradeLabel.string = text;
        }

        if (this.upgradeProgress) {
            const label = this.upgradeProgress.getComponentInChildren(Label);
            if (label) {
                label.string = text;
            }
        }
    }

    /**
     * 更新升级按钮状态
     */
    private updateUpgradeButtonState(): void {
        if (!this.upgradeButton || !this._heroData) return;

        const canUpgrade = HDM.canUpgradeHero(Number(this._heroData.id));
        this.upgradeButton.interactable = canUpgrade;
        // 可以升级时给按钮添加发光效果
        if (canUpgrade) {
            this.addButtonGlowEffect();
        } else {
            this.removeButtonGlowEffect();
        }
    }

    /**
     * 添加按钮发光效果
     */
    private addButtonGlowEffect(): void {
        if (!this.upgradeButton) return;
        // 创建发光效果
        const buttonNode = this.upgradeButton.node;
        const originalScale = buttonNode.scale.clone();
        // 轻微的脉冲发光效果
        tween(buttonNode)
            .to(1.0, { scale: originalScale.clone().multiplyScalar(1.05) })
            .to(1.0, { scale: originalScale })
            .union()
            .repeatForever()
            .start();
    }

    /**
     * 移除按钮发光效果
     */
    private removeButtonGlowEffect(): void {
        if (!this.upgradeButton) return;

        // 停止所有动画
        tween(this.upgradeButton.node).stop();
        // 恢复原始大小
        this.upgradeButton.node.setScale(1, 1, 1);
    }

    /**
     * 更新显示
     */
    private updateDisplay(refreshImages: boolean = true): void {
        if (!this._heroData) {
            if (EDM.isDev()) console.warn(`[HeroItemController] updateDisplay: 英雄数据为空`);
            return;
        }

        if (EDM.isDev()) console.log(`[HeroItemController] updateDisplay: 更新英雄 ${this._heroData.name} 的显示`);

        if (refreshImages) {
            this.updateHeroIcon();
        }
        this.updateHeroName();
        this.updateHeroLevel();
        this.updateHeroStar();
        if (refreshImages) {
            this.updateBackground();
            this.updateAttr();
            this.updateBorder();
        }
        this.updateLockIcon();
        // this.updateDeployMark(); // 注释掉部署标志显示
        this.updateUpgradeProgress();
        this.updateUpgradeButtonState();
        this.updateUpgradeNotifications();
    }

    /**
     * 轻量刷新（不重载图片资源）
     */
    public refreshHeroData(): void {
        if (!this._heroData) return;

        const runtimeData = HDM.getHeroRuntimeData(Number(this._heroData.id));
        if (runtimeData) {
            this._heroData.level = runtimeData.level;
            this._heroData.star = runtimeData.star;
            this._heroData.exp = runtimeData.exp;
            this._heroData.fragmentCount = runtimeData.fragment;
            this._heroData.isDeployed = runtimeData.deployed;
            this._heroData.status = runtimeData.deployed ? 'deployed' : 'unlocked';
        } else {
            this._heroData.status = 'locked';
            this._heroData.isDeployed = false;
        }

        this.updateDisplay(false);
    }

    /**
     * 更新升级提示
     */
    private updateUpgradeNotifications(): void {
        if (!this._heroData) return;

        // 更新升级提示
        if (this.upgradeNotification) {
            const canUpgrade = HDM.canUpgradeHero(Number(this._heroData.id));
            this.upgradeNotification.active = canUpgrade;
            if (canUpgrade) {
                // 注册到升级提示管理器
                const notificationManager = HeroUpgradeNotificationManager.instance;
                if (notificationManager) {
                    const sprite = this.upgradeNotification.getComponent(Sprite);
                    const animation = this.upgradeNotification.getComponent(Animation);
                    notificationManager.registerNotification(
                        UpgradeNotificationType.HeroItem,
                        this.upgradeNotification,
                        sprite,
                        animation
                    );
                }

                // 添加放大缩小动画
                this.addUpgradeNotificationAnimation();
            } else {
                // 停止动画
                this.stopUpgradeNotificationAnimation();
            }
        }

        // 更新升星提示
        if (this.starUpNotification) {
            const canStarUp = HDM.canStarUpHero(Number(this._heroData.id));
            this.starUpNotification.active = canStarUp;
            if (canStarUp) {
                // 注册到升级提示管理器
                const notificationManager = HeroUpgradeNotificationManager.instance;
                if (notificationManager) {
                    const sprite = this.starUpNotification.getComponent(Sprite);
                    const animation = this.starUpNotification.getComponent(Animation);
                    notificationManager.registerNotification(
                        UpgradeNotificationType.HeroItem,
                        this.starUpNotification,
                        sprite,
                        animation
                    );
                }
            }
        }
    }

    /**
     * 添加升级通知动画
     */
    private addUpgradeNotificationAnimation(): void {
        if (!this.upgradeNotification) return;
        // 停止之前的动画
        this.stopUpgradeNotificationAnimation();

        const originalScale = this.upgradeNotification.scale.clone();
        const pulseScale = originalScale.clone().multiplyScalar(1.3);

        // 创建放大缩小动画
        tween(this.upgradeNotification)
            .to(0.5, { scale: pulseScale })
            .to(0.5, { scale: originalScale })
            .union()
            .repeatForever()
            .start();
    }

    /**
     * 停止升级通知动画
     */
    private stopUpgradeNotificationAnimation(): void {
        if (!this.upgradeNotification) return;
        // 停止所有动画
        tween(this.upgradeNotification).stop();
        // 恢复原始大小
        this.upgradeNotification.setScale(1, 1, 1);
    }

    /**
     * 调整背景和边框大小
     */
    private adjustBackgroundAndBorder(parentWidth: number, parentHeight: number): void {
        // 调整背景
        if (this.background) {
            const bgTransform = this.background.getComponent(UITransform);
            if (bgTransform) {
                bgTransform.setContentSize(parentWidth, parentHeight);
            }
        }

        // 调整边框
        if (this.border) {
            const borderTransform = this.border.getComponent(UITransform);
            if (borderTransform) {
                borderTransform.setContentSize(parentWidth, parentHeight);
            }
        }
    }

    /**
     * 调整按钮容器位置
     */
    private adjustButtonContainerPosition(parentWidth: number, parentHeight: number): void {
        if (!this.buttonContainer) return;
        // 设置按钮容器在底部
        const buttonWidget = this.buttonContainer.getComponent(Widget);
        if (buttonWidget) {
            buttonWidget.isAlignBottom = true;
            buttonWidget.isAlignLeft = true;
            buttonWidget.isAlignRight = true;
            buttonWidget.bottom = 10;
            buttonWidget.left = 0;
            buttonWidget.right = 0;
            buttonWidget.updateAlignment();
        } else {
            // 如果没有Widget组件，直接设置位置和大小
            this.buttonContainer.setPosition(0, -parentHeight / 2 + 30, 0);
            const buttonTransform = this.buttonContainer.getComponent(UITransform);
            if (buttonTransform) {
                buttonTransform.setContentSize(parentWidth - 20, 40);
            }
        }
    }

    /**
     * 更新英雄图标
     */
    private updateHeroIcon(): void {
        if (!this.heroIcon || !this._heroData) return;

        const sprite = this.heroIcon.getComponent(Sprite);
        if (!sprite) return;

        const iconType = this._heroData.icon || 'illustration';
        const iconPath = HDM.getHeroPathById(Number(this._heroData.id), iconType);
        if (!iconPath) {
            if (EDM.isDev()) console.warn(`[HeroItemController] 英雄 ${this._heroData.name} 没有设置icon字段`);
            return;
        }

        // 检查是否已经加载过相同的图标，避免重复加载
        if (this._currentHeroIconPath === iconPath && sprite.spriteFrame) {
            if (EDM.isDev()) console.log(`[HeroItemController] 英雄 ${this._heroData.name} 图标已加载，跳过重复加载`);
            return;
        }

        this._currentHeroIconPath = iconPath;
        const expectedHeroId = this._heroData.id;
        const expectedPath = iconPath;
        if (EDM.isDev()) console.log(`[HeroItemController] 开始加载英雄 ${this._heroData.name} 的图标: ${iconPath}`);

        HeroItemController.enqueueImageLoad(() => {
            this.loadSpriteFrame(iconPath, (data) => {
                if (this.applyHeroIconFrame(sprite, data, expectedPath, expectedHeroId)) {
                    return;
                }

                if (!this.isHeroIconRequestActive(sprite, expectedPath, expectedHeroId)) {
                    return;
                }

                const fallbackPath = iconType === 'illustration'
                    ? ''
                    : HDM.getHeroPathById(Number(expectedHeroId), 'illustration');
                if (!fallbackPath || fallbackPath === expectedPath) {
                    if (EDM.isDev()) console.warn(`[HeroItemController] 加载英雄头像失败: ${this._heroData?.name || expectedHeroId}, 路径: ${iconPath}`);
                    return;
                }

                this._currentHeroIconPath = fallbackPath;
                this.loadSpriteFrame(fallbackPath, (fallbackData) => {
                    this.applyHeroIconFrame(sprite, fallbackData, fallbackPath, expectedHeroId);
                });
            });
        });
    }

    private applyHeroIconFrame(sprite: Sprite, data: any, expectedPath: string, expectedHeroId: string): boolean {
        if (!this.isHeroIconRequestActive(sprite, expectedPath, expectedHeroId) || !data) {
            return false;
        }

        sprite.spriteFrame = data;
        sprite.sizeMode = Sprite.SizeMode.TRIMMED;
        this.fitHeroIconToCard(sprite);
        if (EDM.isDev()) console.log(`[HeroItemController] 英雄 ${this._heroData.name} 图标加载成功`);
        return true;
    }

    private isHeroIconRequestActive(sprite: Sprite, expectedPath: string, expectedHeroId: string): boolean {
        if (!this.node || !this.node.isValid || !this._heroData) {
            return false;
        }

        if (this._currentHeroIconPath !== expectedPath || this._heroData.id !== expectedHeroId) {
            return false;
        }

        return !!sprite && sprite.isValid;
    }

    private resetHeroIconTransform(): void {
        if (!this.heroIcon || !this.heroIcon.isValid) return;
        this.heroIcon.setScale(1, 1, 1);
    }

    private fitHeroIconToCard(sprite: Sprite): void {
        if (!this.heroIcon || !this.heroIcon.isValid) return;
        const transform = this.heroIcon.getComponent(UITransform);
        if (!transform) return;

        const contentSize = transform.contentSize;
        const width = Math.max(contentSize.width, 1);
        const height = Math.max(contentSize.height, 1);
        const fitScale = Math.min(HERO_ICON_MAX_WIDTH / width, HERO_ICON_MAX_HEIGHT / height);
        const nextScale = Math.min(fitScale, HERO_ICON_MAX_SCALE);
        this.heroIcon.setScale(nextScale, nextScale, 1);
    }

    /**
     * 更新英雄名称
     */
    private updateHeroName(): void {
        if (this.heroName) {
            this.heroName.active = true;
        }
        HeroUtils.updateHeroName({
            heroNameNode: this.heroName,
            heroData: this._heroData
        });
    }

    /**
     * 更新英雄等级
     */
    private updateHeroLevel(): void {
        HeroUtils.updateHeroLevel({
            heroLevelNode: this.heroLevel,
            heroData: this._heroData
        });
    }

    /**
     * 更新英雄星级
     */
    private updateHeroStar(): void {
        HeroUtils.updateHeroStar({
            heroStarNode: this.heroStar,
            heroData: this._heroData
        });
    }

    /**
     * 更新英雄属性
     */
    private updateAttr(): void {
        if (!this.heroAttr || !this._heroData) return;

        const sprite = this.heroAttr.getComponent(Sprite);
        if (!sprite) return;

        if (!this._heroData.attr) {
            if (EDM.isDev()) console.warn(`[HeroItemController] 英雄 ${this._heroData.name} 没有设置属性`);
            return;
        }

        // 处理属性值为字符串的情况
        let attrIconPath = '';
        if (typeof this._heroData.attr === 'string') {
            // 从 UNIT_ATTR 中获取对应的属性对象
            const attrKey = (this._heroData.attr as string).replace('UNIT_ATTR_', '');
            const attrObj = UNIT_ATTR[attrKey];
            if (attrObj && attrObj.icon) {
                attrIconPath = attrObj.icon;
            } else {
                if (EDM.isDev()) console.warn(`[HeroItemController] 英雄 ${this._heroData.name} 的属性 ${this._heroData.attr} 没有对应的配置`);
                return;
            }
        } else if (this._heroData.attr.icon) {
            // 处理属性值为对象的情况
            attrIconPath = this._heroData.attr.icon;
        } else {
            if (EDM.isDev()) console.warn(`[HeroItemController] 英雄 ${this._heroData.name} 没有设置属性图标`);
            return;
        }

        // 记录当前要加载的属性图标路径
        this._currentAttrIconPath = attrIconPath;
        const expectedAttrPath = attrIconPath;
        const expectedHeroId = this._heroData.id;

        HeroItemController.enqueueImageLoad(() => {
            this.loadSpriteFrame(attrIconPath, (data) => {
                // 验证节点和数据是否仍然有效
                if (!this.node || !this.node.isValid || !this._heroData) {
                    return;
                }

                // 验证数据是否匹配（防止异步加载竞态条件）
                if (this._currentAttrIconPath !== expectedAttrPath || this._heroData.id !== expectedHeroId) {
                    return; // 数据已变更，忽略此回调
                }

                // 验证 sprite 是否仍然有效
                if (!sprite || !sprite.isValid) {
                    return;
                }

                if (data) {
                    sprite.spriteFrame = data;
                } else {
                    if (EDM.isDev()) console.warn(`[HeroItemController] 加载属性图标失败: ${attrIconPath}`);
                }
            });
        });
    }

    /**
     * 更新背景
     */
    private updateBackground(): void {
        if (!this.background || !this._heroData) return;

        const sprite = this.background.getComponent(Sprite);
        if (!sprite) return;

        const rarity = this._heroData.rarity || 'common';
        const bgConfig = HeroBackgroundConfig.getHeroBackgroundConfig(rarity);

        if (!bgConfig) {
            if (EDM.isDev()) console.warn(`[HeroItemController] 未找到稀有度 ${rarity} 的背景配置`);
            return;
        }

        // 优先使用背景图片路径
        if (bgConfig.backgroundPath) {
            const expectedPath = bgConfig.backgroundPath;
            const expectedHeroId = this._heroData.id;

            HeroItemController.enqueueImageLoad(() => {
                this.loadSpriteFrame(bgConfig.backgroundPath, (data) => {
                    // 验证节点和数据是否仍然有效
                    if (!this.node || !this.node.isValid || !this._heroData) {
                        return;
                    }

                    // 验证数据是否匹配（防止异步加载竞态条件）
                    if (this._heroData.id !== expectedHeroId || this._heroData.rarity !== rarity) {
                        return; // 数据已变更，忽略此回调
                    }

                    // 验证 sprite 是否仍然有效
                    if (!sprite || !sprite.isValid) {
                        return;
                    }

                    if (data) {
                        sprite.spriteFrame = data;
                    } else {
                        if (EDM.isDev()) console.warn(`[HeroItemController] 加载背景图片失败: ${rarity}, 路径: ${bgConfig.backgroundPath}`);
                        // 如果图片加载失败，使用颜色作为后备
                        if (bgConfig.backgroundColor) {
                            sprite.color = this.hexToColor(bgConfig.backgroundColor);
                        }
                    }
                });
            });
        } else if (bgConfig.backgroundColor) {
            // 如果没有背景图片路径，使用颜色
            sprite.color = this.hexToColor(bgConfig.backgroundColor);
        } else {
            if (EDM.isDev()) console.warn(`[HeroItemController] 英雄 ${this._heroData.name} 没有背景配置: ${rarity}`);
        }
    }

    /**
     * 更新边框
     */
    private updateBorder(): void {
        if (!this.border || !this._heroData) return;

        const sprite = this.border.getComponent(Sprite);
        if (sprite) {
            const rarity = this._heroData.rarity || 'common';
            const bgConfig = HeroBackgroundConfig.getHeroBackgroundConfig(rarity);

            if (bgConfig && bgConfig.borderColor) {
                sprite.color = this.hexToColor(bgConfig.borderColor);
            }
        }
    }

    /**
     * 更新锁定图标
     */
    private updateLockIcon(): void {
        if (!this.lockIcon || !this._heroData) return;

        const status = this._heroData.status || 'unlocked';
        this.lockIcon.active = status === 'locked';
    }

    /**
     * 更新部署标记
     */
    private updateDeployMark(): void {
        if (!this.deployMark || !this._heroData) return;

        const isDeployed = this._heroData.isDeployed || false;
        this.deployMark.active = isDeployed;
    }

    /**
     * 调整内部布局
     */
    private adjustInternalLayout(): void {
        if (!this._heroData) return;

        const name = this._heroData.name || 'Unknown Hero';
        // 获取父节点尺寸
        const parentTransform = this.node.getComponent(UITransform);
        if (!parentTransform) {
            if (EDM.isDev()) console.warn(`[HeroItemController] 无法获取父节点Transform组件: ${name}`);
            return;
        }

        const parentWidth = parentTransform.contentSize.width;
        const parentHeight = parentTransform.contentSize.height;
        // 调整背景和边框
        this.adjustBackgroundAndBorder(parentWidth, parentHeight);

        // 调整按钮容器位置
        this.adjustButtonContainerPosition(parentWidth, parentHeight);
    }

    /**
     * 将十六进制颜色转换为Color对象
     */
    private hexToColor(hex: string): Color {
        // 移除#号
        hex = hex.replace('#', '');

        // 解析RGB值
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);

        return new Color(r, g, b, 255);
    }

    /**
     * 获取英雄数据
     */
    public getHeroData(): IHeroData | null {
        return this._heroData;
    }

    /**
     * 添加发光效果
     */
    public addGlowEffect(): void {
        if (!this._heroData) return;
        // 这里可以添加发光效果的实现
        // 例如：添加Outline组件或者使用Shader
    }

    /**
     * 移除发光效果
     */
    public removeGlowEffect(): void {
        if (!this._heroData) return;
        // 这里可以移除发光效果的实现
    }
}
