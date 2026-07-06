import { _decorator, Node, Button, Label, Sprite, ProgressBar, UITransform, UIOpacity, SpriteFrame, Texture2D, Color, Prefab, instantiate, Widget, view, tween, Tween, Vec3, Animation, SpriteAtlas, Graphics } from 'cc';
import { FullScreenPanel } from '../ui/FullScreenPanel';
import { HeroPanelController } from './HeroPanelController';
import { UIAnimationManager } from '../ui/UIAnimationManager';
import { IHero } from './IHero';
import { HeroBackgroundConfig, IProgressBarStyle, ProgressBarStyleManager } from '../data/config/hero/HeroUIConfig';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';
import { CDM, CurrencyType } from 'db://assets/utils/common/CurrencyManager';
import { HeroUpgradeNotificationManager, UpgradeNotificationType } from './HeroUpgradeNotificationManager';
import { ResourceManager, ResourceType } from 'db://assets/utils/data/config/manager/ResourceManager';
import { HeroInfo, InfoPanelType } from './HeroInfo';
import { HDM } from '../data/config/hero/HeroDataManager';
import { GameData } from '../data/config/manager/GameDataManager';
import { gameBus } from '../signal/GameBus';
import { SIGNAL_TYPES } from '../signal/ISignal';
import { HeroUpgradeService } from './HeroUpgradeService';
import { createStripFrames } from '../common';

const { ccclass, property } = _decorator;
const HERO_PREVIEW_ANIMATION_FRAME_INTERVAL = 1 / 3;
const HERO_PREVIEW_ANIMATION_PADDING_COMPENSATION = 1.2;
const HERO_DETAIL_BACKDROP_NODE = 'Skin1HeroDetailOpaqueBg';
const HERO_DETAIL_LAYOUT_NODE = 'Skin1HeroDetailLayout';
const HERO_DETAIL_IMAGE_MAX_WIDTH = 235;
const HERO_DETAIL_IMAGE_MAX_HEIGHT = 390;
const HERO_DETAIL_BACK_BUTTON_PATH = 'textures/ui/skin1/detail_buttons/detail_back_return/texture';
const HERO_DETAIL_UPGRADE_BUTTON_PATH = 'textures/ui/skin1/detail_buttons/detail_upgrade_button/texture';
const HERO_DETAIL_STAR_BUTTON_PATH = 'textures/ui/skin1/detail_buttons/detail_star_button/texture';

@ccclass('HeroDetailPanel')
export class HeroDetailPanel extends FullScreenPanel {
    @property({ type: Node, tooltip: '返回按钮' })
    backButton: Node = null!;

    @property({ type: Node, tooltip: '英雄大图' })
    heroImage: Node = null!;

    @property({ type: Node, tooltip: '左箭头按钮' })
    leftArrow: Node = null!;

    @property({ type: Node, tooltip: '右箭头按钮' })
    rightArrow: Node = null!;

    @property({ type: Node, tooltip: '英雄名称' })
    heroName: Node = null!;

    @property({ type: Node, tooltip: '英雄描述' })
    heroDescription: Node = null!;

    @property({ type: Node, tooltip: '英雄等级' })
    heroLevel: Node = null!;

    @property({ type: Node, tooltip: '英雄星级' })
    heroStar: Node = null!;

    @property({ type: Node, tooltip: '升级进度条' })
    upgradeProgress: Node = null!;

    @property({ type: Node, tooltip: '升级按钮' })
    upgradeButton: Node = null!;

    @property({ type: Node, tooltip: '升星按钮' })
    starUpButton: Node = null!;

    @property({ type: Node, tooltip: '升级按钮提示图标' })
    upgradeButtonNotification: Node = null!;

    @property({ type: Node, tooltip: '升星按钮提示图标' })
    starUpButtonNotification: Node = null!;

    @property({ type: Node, tooltip: '属性按钮' })
    attributesButton: Node = null!;

    @property({ type: Node, tooltip: '技能按钮' })
    skillsButton: Node = null!;

    @property({ type: Node, tooltip: '故事按钮' })
    storyButton: Node = null!;

    @property({ type: Node, tooltip: '动画按钮' })
    animationButton: Node = null!;

    @property({ type: Node, tooltip: '背景节点' })
    backgroundNode: Node = null!;

    @property({ type: Prefab, tooltip: '英雄信息面板预制体' })
    heroInfoPrefab: Prefab = null!;

    private _heroId: number = 0;
    private _heroPanelController: HeroPanelController | null = null;
    private _currentHero: IHero | null = null;
    private _allHeroes: IHero[] = [];
    private _currentIndex: number = 0;
    private _isUpgrading: boolean = false;
    private _starUpBreathingTween: { upgradeButton?: Tween<Node>, upgradeNotification?: Tween<Node>, starUpButton?: Tween<Node> } = {};
    private _currentHeroImagePath: string | null = null;
    private _detailButtonSpriteFrameCache: Map<string, SpriteFrame> = new Map();

    private _animationSpriteFrames: SpriteFrame[] = [];
    private _currentSpriteIndex: number = 0;
    private _animationInterTime: number = 0;
    private _animationActionInterTime: number = 0;
    private _isPlayingAnimation: boolean = false;
    private _currentAnimationState: string = 'idle';
    private _isFallingBackToIdle: boolean = false;

    onLoad() {
        this.closeOnMask = false;

        if (this.maskNode) {
            this.maskNode.active = false;
        }

        this.animationButton.active = EDM.isDev();

        this.initHeroDetailPanel();

        // 监听英雄数据更新事件
        this._onHeroDataUpdatedHandler = this.onHeroDataUpdated.bind(this);
        this._onHeroDataBatchUpdatedHandler = this.onHeroDataBatchUpdated.bind(this);
        gameBus.on(SIGNAL_TYPES.HERO_DATA_UPDATED, this._onHeroDataUpdatedHandler);
        gameBus.on(SIGNAL_TYPES.HERO_DATA_BATCH_UPDATED, this._onHeroDataBatchUpdatedHandler);
    }

    private initHeroDetailPanel(): void {
        this.bindButtonEvent(this.backButton, () => this.onBackClick());
        this.bindButtonEvent(this.leftArrow, () => this.onLeftArrowClick());
        this.bindButtonEvent(this.rightArrow, () => this.onRightArrowClick());
        this.bindButtonEvent(this.upgradeButton, () => this.onUpgradeClick());
        this.bindButtonEvent(this.starUpButton, () => this.onStarUpClick());
        this.bindButtonEvent(this.attributesButton, () => this.onAttributesButtonClick());
        this.bindButtonEvent(this.skillsButton, () => this.onSkillsButtonClick());
        this.bindButtonEvent(this.storyButton, () => this.onStoryButtonClick());
        this.bindButtonEvent(this.animationButton, () => this.onAnimationButtonClick());
    }

    private bindButtonEvent(node: Node, callback: () => void): void {
        if (!node) return;
        const button = node.getComponent(Button);
        if (button) {
            button.node.on(Button.EventType.CLICK, callback, this);
        }
    }

    public setHeroPanelController(heroPanelController: HeroPanelController): void {
        this._heroPanelController = heroPanelController;
    }

    public setHeroId(heroId: number): void {
        this._heroId = heroId;
    }

    public showHeroDetail(): void {
        if (!this._heroId) {
            if (EDM.isDev()) console.warn(`[HeroDetailPanel] showHeroDetail: 英雄ID=${this._heroId} 为空`);
            return;
        }

        this._allHeroes = this._heroPanelController ? this._heroPanelController.getAllHeroes() : [];
        if (EDM.isDev()) console.log(`[HeroDetailPanel] showHeroDetail: 获取到 ${this._allHeroes.length} 个英雄`);

        this._currentIndex = this._allHeroes.findIndex(hero => Number(hero.id) === this._heroId);

        if (this._currentIndex === -1) {
            if (EDM.isDev()) console.error(`[HeroDetailPanel] 英雄不存在: ${this._heroId}`);
            return;
        }

        this._currentHero = this._allHeroes[this._currentIndex];
        if (EDM.isDev()) console.log(`[HeroDetailPanel] showHeroDetail: 当前英雄 ${this._currentHero?.name} (ID: ${this._currentHero?.id})`);

        this.updateDisplay();
        this.updateArrowButtons();
    }

    private updateDisplay(): void {
        if (!this._currentHero) return;

        if (this.node) {
            this.node.active = true;
            this.forceSetLayerAndPosition();
        }

        this.applyRedesignedLayout();
        this.updateBackground();
        this.updateHeroImage();
        this.updateHeroName();
        this.updateHeroDescription();
        this.updateHeroLevel();
        this.updateHeroStar();
        this.updateUpgradeProgress();
        this.updateButtonStates();
        this.updateArrowButtons();
        this.updateRedesignedStats();

        this.scheduleOnce(() => {
            if (!this.node || !this.node.active || !this._currentHero) return;
            this.forceSetLayerAndPosition();
            this.applyRedesignedLayout();
            this.updateRedesignedStats();
        }, 0);
    }

    private updateBackground(): void {
        if (!this.backgroundNode) {
            this.backgroundNode = this.findBackgroundNode();
        }

        if (!this.backgroundNode || !this._currentHero) return;

        const sprite = this.backgroundNode.getComponent(Sprite);
        if (!sprite) return;

        const backgroundColor = HeroBackgroundConfig.getHeroBackgroundColor(this._currentHero.rarity as any);
        if (backgroundColor) {
            this.setBackgroundColor(sprite, backgroundColor);
        } else {
            this.setBackgroundColor(sprite, '#808080');
        }

        if (HeroBackgroundConfig.isHeroGlowEnabled(this._currentHero.rarity as any)) {
            this.addGlowEffect();
        } else {
            this.removeGlowEffect(this.backgroundNode);
        }
    }

    private findBackgroundNode(): Node | null {
        const backgroundNames = ['Background', 'background', 'Bg', 'bg', 'BackgroundNode', 'backgroundNode'];
        for (const name of backgroundNames) {
            const node = this.node.getChildByName(name);
            if (node) return node;
        }

        for (const child of this.node.children) {
            if (child.getComponent(Sprite)) return child;
        }

        return null;
    }

    private setBackgroundColor(sprite: Sprite, colorHex: string): void {
        const hex = colorHex.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        sprite.color = new Color(r, g, b, 255);
    }

    private addGlowEffect(): void {
    }

    private updateHeroImage(): void {
        if (!this.heroImage || !this._currentHero) return;

        const sprite = this.heroImage.getComponent(Sprite);
        if (!sprite) return;

        this._heroId = Number(this._currentHero.id);
        const hero = HDM.getHeroById(this._heroId);
        const hasHeroConfig = hero && hero.url;

        let imagePath: string;
        if (hasHeroConfig) {
            imagePath = HDM.getHeroPathById(this._heroId, 'illustration');
        } else {
            imagePath = 'textures/hero/default/portrait/spriteFrame';
            if (EDM.isDev()) console.log(`[HeroDetailPanel] 使用默认插图: ${imagePath}`);
        }

        if (!imagePath) return;

        if (this._currentHeroImagePath === imagePath && sprite.spriteFrame) return;

        this._currentHeroImagePath = imagePath;
        const expectedPath = imagePath;
        ResourceManager.getInstance()
            .load<SpriteFrame>(imagePath, ResourceType.SPRITE_FRAME, 'res')
            .then((data) => {
                if (!data || !sprite || !sprite.isValid) return;
                if (!this.node || !this.node.isValid) return;
                if (this._currentHeroImagePath !== expectedPath) return;
                sprite.spriteFrame = data;
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;

                const imageTransform = this.heroImage.getComponent(UITransform);
                if (imageTransform && data.rect.width > 0 && data.rect.height > 0) {
                    this.fitHeroImageToPreview(data, imageTransform);
                }
                this.heroImage.setScale(1, 1, 1);
                this.applyRedesignedLayout();
                this.updateRedesignedStats();
            })
            .catch(() => {
                // ignore load failure (keep previous sprite if any)
            });
    }

    private updateHeroName(): void {
        if (!this.heroName || !this._currentHero) {
            if (EDM.isDev()) console.warn(`[HeroDetailPanel] updateHeroName: heroName=${!!this.heroName}, currentHero=${!!this._currentHero}`);
            return;
        }
        const label = this.heroName.getComponent(Label);
        if (label) {
            const name = EDM.getText(this._currentHero.name) || this._currentHero.name;
            label.string = name;
            if (EDM.isDev()) console.log(`[HeroDetailPanel] updateHeroName: 设置名称为 "${name}"`);
        } else {
            if (EDM.isDev()) console.warn(`[HeroDetailPanel] updateHeroName: Label组件未找到`);
        }
    }

    private updateHeroDescription(): void {
        if (!this.heroDescription || !this._currentHero) return;
        const label = this.heroDescription.getComponent(Label);
        if (label) {
            label.string = EDM.getText(this._currentHero.desc) || this._currentHero.desc;
        }
    }

    private updateHeroLevel(): void {
        if (!this.heroLevel || !this._currentHero) {
            if (EDM.isDev()) console.warn(`[HeroDetailPanel] updateHeroLevel: heroLevel=${!!this.heroLevel}, currentHero=${!!this._currentHero}`);
            return;
        }
        const label = this.heroLevel.getComponent(Label);
        if (label) {
            let level = this._currentHero.level;
            try {
                const runtimeData = HDM.getHeroRuntimeData(Number(this._currentHero.id));
                level = runtimeData?.level || 1;
            } catch (error) {
                if (EDM.isDev()) console.error("更新英雄等级", error);
            }
            label.string = EDM.getText('hero.level') + level;
            if (EDM.isDev()) console.log(`[HeroDetailPanel] updateHeroLevel: 设置等级为 ${level}`);
        } else {
            if (EDM.isDev()) console.warn(`[HeroDetailPanel] updateHeroLevel: Label组件未找到`);
        }
    }

    private updateHeroStar(): void {
        if (!this.heroStar || !this._currentHero) {
            if (EDM.isDev()) console.warn(`[HeroDetailPanel] updateHeroStar: heroStar=${!!this.heroStar}, currentHero=${!!this._currentHero}`);
            return;
        }
        const label = this.heroStar.getComponent(Label);
        if (label) {
            const runtimeData = HDM.getHeroRuntimeData(Number(this._currentHero.id));
            const star = runtimeData?.star || 1;
            label.string = EDM.getText('hero.star') + `: ${'★'.repeat(star)}`;
            if (EDM.isDev()) console.log(`[HeroDetailPanel] updateHeroStar: 设置星级为 ${star}`);
        } else {
            if (EDM.isDev()) console.warn(`[HeroDetailPanel] updateHeroStar: Label组件未找到`);
        }
    }

    private updateUpgradeProgress(): void {
        if (!this.upgradeProgress || !this._currentHero) return;

        const progressBar = this.upgradeProgress.getComponent(ProgressBar);
        if (!progressBar) return;

        const heroId = Number(this._currentHero.id);
        const currentFragments = CDM.getHeroFragmentCount(heroId);
        const runtimeData = HDM.getHeroRuntimeData(heroId);
        const currentLevel = runtimeData?.level || 1;
        const requiredFragments = HDM.calculateUpgradeFragments(currentLevel);
        const progress = Math.min(currentFragments / requiredFragments, 1);

        progressBar.progress = progress;

        const progressNode = progressBar.node.getChildByName('Progress');
        if (progressNode) {
            const progressSprite = progressNode.getComponent(Sprite);
            if (progressSprite) {
                progressSprite.enabled = true;
                progressNode.active = true;
            }
        }

        this.applyProgressBarStyle(progressBar);
        this.updateProgressText(currentFragments, requiredFragments);
    }

    private applyProgressBarStyle(progressBar: ProgressBar): void {
        if (!this._currentHero) return;

        const style = ProgressBarStyleManager.getStyleByRarity(this._currentHero.rarity as any);

        const background = progressBar.node.getChildByName('Background');
        if (background) {
            const backgroundSprite = background.getComponent(Sprite);
            if (backgroundSprite) {
                backgroundSprite.color = style.backgroundColor;
                backgroundSprite.enabled = true;
                background.active = true;
            }
        }

        const progress = progressBar.node.getChildByName('Progress');
        if (progress) {
            const progressSprite = progress.getComponent(Sprite);
            if (progressSprite) {
                progressSprite.color = style.progressColor;
                progressSprite.enabled = true;
                progress.active = true;
            }
        }

        const border = progressBar.node.getChildByName('Border');
        if (border) {
            const borderSprite = border.getComponent(Sprite);
            if (borderSprite) {
                borderSprite.color = style.borderColor;
                borderSprite.enabled = true;
                border.active = true;
            }
        }

        if (style.showGlow) {
            this.applyGlowEffect(progressBar.node, style);
        } else {
            this.removeGlowEffect(progressBar.node);
        }
    }

    private applyGlowEffect(node: Node, style: IProgressBarStyle): void {
        let glowNode = node.getChildByName('Glow');
        if (!glowNode) {
            glowNode = new Node('Glow');
            glowNode.parent = node;
            glowNode.setPosition(0, 0, -1);
        }

        let glowSprite = glowNode.getComponent(Sprite);
        if (!glowSprite) {
            glowSprite = glowNode.addComponent(Sprite);
        }

        const glowColor = new Color(
            style.glowColor.r,
            style.glowColor.g,
            style.glowColor.b,
            Math.floor(255 * style.glowIntensity)
        );
        glowSprite.color = glowColor;

        const glowTransform = glowNode.getComponent(UITransform);
        const originalTransform = node.getComponent(UITransform);
        if (glowTransform && originalTransform) {
            const originalSize = originalTransform.contentSize;
            glowTransform.setContentSize(originalSize.width + 4, originalSize.height + 4);
        }

        glowNode.active = true;
    }

    private removeGlowEffect(node: Node): void {
        const glowNode = node.getChildByName('Glow');
        if (glowNode) {
            glowNode.active = false;
        }
    }

    private updateProgressText(currentFragments: number, requiredFragments: number): void {
        let progressText = this.upgradeProgress.getChildByName('ProgressText');
        if (!progressText) {
            progressText = new Node('ProgressText');
            progressText.parent = this.upgradeProgress;
        }
        const progressTransform = this.upgradeProgress.getComponent(UITransform);
        this.ensureTransform(progressText, progressTransform?.contentSize.width || 300, progressTransform?.contentSize.height || 34);
        progressText.setPosition(0, 0, 0);
        progressText.setSiblingIndex(20);

        let label = progressText.getComponent(Label);
        if (!label) {
            label = progressText.addComponent(Label);
        }

        const progressPercent = Math.min((currentFragments / requiredFragments) * 100, 100);
        label.string = `${currentFragments} / ${requiredFragments}   (${progressPercent.toFixed(1)}%)`;

        label.fontSize = 18;
        label.lineHeight = 22;
        label.color = new Color(255, 255, 255, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableOutline = true;
        label.outlineColor = new Color(0, 0, 0, 255);
        label.outlineWidth = 2;

        progressText.active = true;
        label.enabled = true;
    }

    private updateButtonStates(): void {
        if (!this._currentHero) return;

        if (this.upgradeButton) {
            const button = this.upgradeButton.getComponent(Button);
            if (button) {
                const canUpgrade = HDM.canUpgradeHero(Number(this._currentHero.id));
                button.interactable = canUpgrade;
                if (canUpgrade) {
                    this.addUpgradeAnimation();
                    this.updateUpgradeButtonNotification(true);
                } else {
                    this.removeUpgradeAnimation();
                    this.updateUpgradeButtonNotification(false);
                }
            }
        }

        if (this.starUpButton) {
            const button = this.starUpButton.getComponent(Button);
            if (button) {
                const canStarUp = HDM.canStarUpHero(Number(this._currentHero.id));
                button.interactable = canStarUp;
                if (canStarUp) {
                    this.addStarUpAnimation();
                    this.updateStarUpButtonNotification(true);
                } else {
                    this.removeStarUpAnimation();
                    this.updateStarUpButtonNotification(false);
                }
            }
        }
    }

    private updateUpgradeButtonNotification(canUpgrade: boolean): void {
        if (!this.upgradeButtonNotification) return;

        this.upgradeButtonNotification.active = canUpgrade;

        if (canUpgrade) {
            const notificationManager = HeroUpgradeNotificationManager.instance;
            if (notificationManager) {
                const sprite = this.upgradeButtonNotification.getComponent(Sprite);
                notificationManager.registerNotification(
                    UpgradeNotificationType.DetailPanel,
                    this.upgradeButtonNotification,
                    sprite
                );
            }
        }
    }

    private updateStarUpButtonNotification(canStarUp: boolean): void {
        if (!this.starUpButtonNotification) return;

        this.starUpButtonNotification.active = canStarUp;

        if (canStarUp) {
            const notificationManager = HeroUpgradeNotificationManager.instance;
            if (notificationManager) {
                const sprite = this.starUpButtonNotification.getComponent(Sprite);
                notificationManager.registerNotification(
                    UpgradeNotificationType.DetailPanel,
                    this.starUpButtonNotification,
                    sprite
                );
            }
        }
    }

    private updateArrowButtons(): void {
        if (!this.leftArrow || !this.rightArrow) return;

        const leftButton = this.leftArrow.getComponent(Button);
        if (leftButton) {
            leftButton.interactable = this._allHeroes.length > 1;
        }

        const rightButton = this.rightArrow.getComponent(Button);
        if (rightButton) {
            rightButton.interactable = this._allHeroes.length > 1;
        }
    }

    private addUpgradeAnimation(): void {
        if (!this.upgradeButton) return;

        this.removeUpgradeAnimation();

        const button = this.upgradeButton.getComponent(Button);
        if (button) {
            this.startBreathingEffect(button.node, 'upgradeButton');
        }

        if (this.upgradeButtonNotification) {
            this.startBreathingEffect(this.upgradeButtonNotification, 'upgradeNotification');
        }
    }

    private startBreathingEffect(node: Node, effectName: string): void {
        if (!node) return;

        node.setScale(1, 1, 1);

        const breathingTween = tween(node)
            .to(1.0, { scale: new Vec3(1.1, 1.1, 1.1) })
            .to(1.0, { scale: new Vec3(1, 1, 1) })
            .union()
            .repeatForever()
            .start();

        this._starUpBreathingTween[effectName] = breathingTween;
    }

    private removeUpgradeAnimation(): void {
        this.stopBreathingEffect('upgradeButton');
        this.stopBreathingEffect('upgradeNotification');

        if (this.upgradeButton) {
            const button = this.upgradeButton.getComponent(Button);
            if (button) {
                button.node.setScale(1, 1, 1);
            }
        }

        if (this.upgradeButtonNotification) {
            this.upgradeButtonNotification.setScale(1, 1, 1);
        }
    }

    private stopBreathingEffect(effectName: string): void {
        const tweenRef = this._starUpBreathingTween[effectName];
        if (tweenRef) {
            tweenRef.stop();
            this._starUpBreathingTween[effectName] = undefined;
        }
    }

    private addStarUpAnimation(): void {
        if (!this.starUpButton) return;

        this.removeStarUpAnimation();

        const button = this.starUpButton.getComponent(Button);
        if (button) {
            this.startBreathingEffect(button.node, 'starUpButton');
        }
    }

    private removeStarUpAnimation(): void {
        this.stopBreathingEffect('starUpButton');

        if (this.starUpButton) {
            const button = this.starUpButton.getComponent(Button);
            if (button) {
                button.node.setScale(1, 1, 1);
            }
        }
    }

    private onBackClick(): void {
        if (UIAnimationManager.instance) {
            UIAnimationManager.instance.playButtonClickAnimation(this.backButton);
        }
        this.hide();
    }

    private onLeftArrowClick(): void {
        if (this._allHeroes.length <= 1) return;

        this._currentIndex = (this._currentIndex - 1 + this._allHeroes.length) % this._allHeroes.length;
        this._currentHero = this._allHeroes[this._currentIndex];
        this.updateDisplay();
    }

    private onRightArrowClick(): void {
        if (this._allHeroes.length <= 1) return;

        this._currentIndex = (this._currentIndex + 1) % this._allHeroes.length;
        this._currentHero = this._allHeroes[this._currentIndex];
        this.updateDisplay();
    }

    private onUpgradeClick(): void {
        if (!this._currentHero || this._isUpgrading) return;

        this._isUpgrading = true;
        this.playUpgradeButtonAnimation(async () => {
            try {
                const result = await HeroUpgradeService.upgradeHero(Number(this._currentHero?.id));
                if (result.success) {
                    this.refreshCurrentHeroData();
                    this.updateDisplay();
                }
            } catch (error) {
                if (EDM.isDev()) console.error(`[HeroDetailPanel] 升级调用失败:`, error);
            } finally {
                this._isUpgrading = false;
            }
        });
    }

    private playUpgradeButtonAnimation(onComplete?: () => void): void {
        if (!this.heroImage || !this.heroLevel) return;

        const originalScale = this.heroImage.scale.clone();
        const originalLevelScale = this.heroLevel.scale.clone();

        tween(this.heroImage)
            .to(0.2, { scale: originalScale.clone().multiplyScalar(1.2) })
            .to(0.1, { scale: originalScale })
            .call(() => {
                if (this.heroLevel) {
                    const level = this.heroLevel.getComponent(Label);
                    if (level) {
                        tween(this.heroLevel)
                            .to(0.1, { scale: originalLevelScale.clone().multiplyScalar(1.5) })
                            .call(() => {
                                const runtimeData = HDM.getHeroRuntimeData(Number(this._currentHero.id));
                                const newLevel = (runtimeData?.level || 1) + 1;
                                level.string = `Lv.${newLevel}`;

                                tween(this.heroLevel)
                                    .to(0.2, { scale: originalLevelScale })
                                    .call(() => {
                                        onComplete?.();
                                    })
                                    .start();
                            })
                            .start();
                    }
                } else {
                    onComplete?.();
                }
            })
            .start();
    }

    private async onStarUpClick(): Promise<void> {
        if (!this._currentHero || !this._heroPanelController) return;

        if (UIAnimationManager.instance) {
            UIAnimationManager.instance.playButtonClickAnimation(this.starUpButton);
        }

        try {
            const success = await this._heroPanelController.starUpHero(this._currentHero.id);
            if (success) {
                this.refreshCurrentHeroData();
            }
        } catch (error) {
            if (EDM.isDev()) console.error(`[HeroDetailPanel] 升星调用失败:`, error);
        }

        this.updateDisplay();
    }

    private onAttributesButtonClick(): void {
        this.openHeroInfoPanel('attributes');
    }

    private onSkillsButtonClick(): void {
        this.openHeroInfoPanel('skills');
    }

    private onStoryButtonClick(): void {
        this.openHeroInfoPanel('story');
    }

    private onAnimationButtonClick(): void {
        if (!EDM.isDev()) return;

        if (this._isPlayingAnimation) {
            this.stopHeroAnimation();
        } else {
            this.startHeroAnimation();
        }
    }

    private startHeroAnimation(): void {
        if (!this._currentHero) return;

        this.stopHeroAnimation();

        const heroId = Number(this._currentHero.id);
        const animationStates = ['idle', 'walk', 'attack', 'skill'];
        let currentIndex = animationStates.indexOf(this._currentAnimationState);
        currentIndex = (currentIndex + 1) % animationStates.length;
        this._currentAnimationState = animationStates[currentIndex];

        this.loadHeroAnimation(heroId, this._currentAnimationState);
    }

    private stopHeroAnimation(): void {
        this._isPlayingAnimation = false;
        this._isFallingBackToIdle = false;
        this.unschedule(this.playHeroAnimation);
    }

    private loadHeroAnimation(heroId: number, animationState: string): void {
        const hero = HDM.getHeroById(heroId);
        const hasHeroConfig = hero && hero.url;

        if (!hasHeroConfig) {
            if (EDM.isDev()) console.warn(`[HeroDetailPanel] 无法获取英雄配置: ${heroId}, ${animationState}`, { module: 'HeroDetailPanel', method: 'loadHeroAnimation' });
            this._animationSpriteFrames = [];
            this._isPlayingAnimation = false;
            return;
        }

        const path = HDM.getHeroPathById(heroId, animationState);
        if (!path) {
            this._animationSpriteFrames = [];
            this._isPlayingAnimation = false;
            return;
        }

        if (EDM.isDev()) console.debug(`[HeroDetailPanel] 开始加载动画资源: ${path}`, { module: 'HeroDetailPanel', method: 'loadHeroAnimation' });

        ResourceManager.getInstance()
            .load<SpriteFrame>(path, ResourceType.SPRITE_FRAME, 'res')
            .then((sheetFrame) => {
                if (!sheetFrame) {
                    this.handleAnimationLoadFailure(heroId, animationState, path);
                    return;
                }

                const frames = createStripFrames(sheetFrame, `HeroDetailPanel:${heroId}:${animationState}`, path);
                if (!frames || frames.length === 0) {
                    this.handleAnimationLoadFailure(heroId, animationState, path);
                    return;
                }

                if (!this.heroImage || !this.heroImage.isValid) {
                    if (EDM.isDev()) console.warn('[HeroDetailPanel] heroImage节点无效');
                    this._animationSpriteFrames = [];
                    this._isPlayingAnimation = false;
                    this._isFallingBackToIdle = false;
                    return;
                }

                const sprite = this.heroImage.getComponent(Sprite);
                if (!sprite) {
                    if (EDM.isDev()) console.warn('[HeroDetailPanel] 无法获取Sprite组件');
                    this._animationSpriteFrames = [];
                    this._isPlayingAnimation = false;
                    this._isFallingBackToIdle = false;
                    return;
                }

                this._animationSpriteFrames = frames;
                this._currentSpriteIndex = 0;
                this._animationActionInterTime = HERO_PREVIEW_ANIMATION_FRAME_INTERVAL;
                this._isFallingBackToIdle = false;

                if (EDM.isDev()) console.log(`[HeroDetailPanel] 动画帧加载完成: ${path}, 帧数: ${this._animationSpriteFrames.length}`);

                if (this._animationSpriteFrames && this._animationSpriteFrames.length > 0) {
                    sprite.spriteFrame = this._animationSpriteFrames[0];
                    this.setAnimationSize(sprite);
                    this._isPlayingAnimation = true;
                    if (EDM.isDev()) console.log(`[HeroDetailPanel] 开始播放动画: ${animationState}, 间隔: ${this._animationActionInterTime}s`);
                    this.schedule(this.playHeroAnimation, 0.016);
                } else {
                    if (EDM.isDev()) console.warn(`[HeroDetailPanel] 动画帧数据为空: ${path}`);
                    this._isPlayingAnimation = false;
                }
            })
            .catch(() => {
                this.handleAnimationLoadFailure(heroId, animationState, path);
            });
    }

    private handleAnimationLoadFailure(heroId: number, animationState: string, path: string): void {
        if (EDM.isDev()) console.warn(`[HeroDetailPanel] 动画资源不存在: ${path}`);

        if (animationState !== 'idle' && !this._isFallingBackToIdle) {
            this._isFallingBackToIdle = true;
            if (EDM.isDev()) console.log(`[HeroDetailPanel] 回退到idle动画`);
            this.loadHeroAnimation(heroId, 'idle');
        } else if (this._isFallingBackToIdle) {
            if (EDM.isDev()) console.warn(`[HeroDetailPanel] idle动画也不存在，尝试下一个动画状态`);
            this._isFallingBackToIdle = false;
            this.tryNextAvailableAnimation(heroId);
        } else {
            if (EDM.isDev()) console.warn(`[HeroDetailPanel] idle动画加载失败，停止动画播放`);
            this._animationSpriteFrames = [];
            this._isPlayingAnimation = false;
        }
    }

    private tryNextAvailableAnimation(heroId: number): void {
        const animationStates = ['idle', 'walk', 'attack', 'skill'];
        const currentIndex = animationStates.indexOf(this._currentAnimationState);

        for (let i = 1; i < animationStates.length; i++) {
            const nextIndex = (currentIndex + i) % animationStates.length;
            const nextState = animationStates[nextIndex];

            if (nextState !== this._currentAnimationState) {
                if (EDM.isDev()) console.log(`[HeroDetailPanel] 尝试加载动画: ${nextState}`);
                this._currentAnimationState = nextState;
                this.loadHeroAnimation(heroId, nextState);
                return;
            }
        }

        if (EDM.isDev()) console.warn(`[HeroDetailPanel] 所有动画状态都不可用，停止动画播放`);
        this._isPlayingAnimation = false;
    }

    private setAnimationSize(sprite: Sprite): void {
        if (!sprite) return;

        sprite.sizeMode = Sprite.SizeMode.CUSTOM;

        const panelTransform = this.node.getComponent(UITransform);
        const uiTransform = this.heroImage.getComponent(UITransform);
        const spriteFrame = sprite.spriteFrame;
        if (panelTransform && uiTransform && spriteFrame && spriteFrame.rect.width > 0 && spriteFrame.rect.height > 0) {
            this.fitHeroImageToPreview(spriteFrame, uiTransform, HERO_PREVIEW_ANIMATION_PADDING_COMPENSATION);
            return;
        }

        if (uiTransform) {
            const screenWidth = view.getVisibleSize().width;
            uiTransform.setContentSize(screenWidth, screenWidth);
        }
    }

    private playHeroAnimation(dt: number): void {
        if (!this._isPlayingAnimation) {
            if (EDM.isDev()) console.warn('[HeroDetailPanel] playHeroAnimation: 动画未播放');
            return;
        }
        if (!this._animationSpriteFrames || this._animationSpriteFrames.length === 0) {
            if (EDM.isDev()) console.warn('[HeroDetailPanel] playHeroAnimation: 动画帧为空');
            return;
        }

        const speedScale = GameData.speedScale || 1;
        this._animationInterTime += dt * speedScale;

        if (this._animationInterTime >= this._animationActionInterTime) {
            this._currentSpriteIndex++;
            if (this._currentSpriteIndex >= this._animationSpriteFrames.length) {
                this._currentSpriteIndex = 0;
            }
            this._animationInterTime = 0;

            if (EDM.isDev()) console.log(`[HeroDetailPanel] 切换到帧 ${this._currentSpriteIndex}/${this._animationSpriteFrames.length}`);

            if (this.heroImage && this.heroImage.isValid) {
                const sprite = this.heroImage.getComponent(Sprite);
                if (sprite && this._animationSpriteFrames[this._currentSpriteIndex]) {
                    sprite.spriteFrame = this._animationSpriteFrames[this._currentSpriteIndex];
                } else {
                    if (EDM.isDev()) console.warn('[HeroDetailPanel] playHeroAnimation: Sprite或帧数据无效');
                }
            }
        }
    }

    private openHeroInfoPanel(panelType: InfoPanelType): void {
        if (!this._currentHero || !this.heroInfoPrefab) return;

        let infoNode = this.node.getChildByName('HeroInfo');
        if (!infoNode) {
            infoNode = instantiate(this.heroInfoPrefab);
            infoNode.name = 'HeroInfo';
            infoNode.parent = this.node;
        }

        const heroInfo = infoNode.getComponent(HeroInfo);
        if (heroInfo) {
            heroInfo.show({ hero: this._currentHero, panelType: panelType });
        }
    }

    public refreshLocalization(): void {
        if (this._currentHero) {
            this.updateHeroName();
            this.updateHeroDescription();
            this.updateHeroLevel();
            this.updateHeroStar();
        }
    }

    public async show(data?: any): Promise<void> {
        await super.show(data);

        if (this.node) {
            this.node.active = true;
            this.forceSetLayerAndPosition();
        }
    }

    protected setupFullScreenDisplay(): void {
        this.node.active = true;

        const uiTransform = this.node.getComponent(UITransform);
        if (uiTransform) {
            const screenSize = view.getVisibleSize();
            uiTransform.setContentSize(screenSize.width, screenSize.height);
        }

        this.node.setSiblingIndex(999999);

        let widget = this.node.getComponent(Widget);
        if (!widget) {
            widget = this.node.addComponent(Widget);
        }
        if (widget) {
            widget.isAlignTop = true;
            widget.top = 0;
            widget.isAlignBottom = true;
            widget.bottom = 0;
            widget.isAlignLeft = true;
            widget.left = 0;
            widget.isAlignRight = true;
            widget.right = 0;
            widget.updateAlignment();
            widget.enabled = false;
        }

        this.alignPanelToCanvasCenter();

        const content = this.getContentNode();
        if (content && content !== this.node) {
            content.setScale(1, 1, 1);
            content.setPosition(0, 0, 0);
        }
    }

    protected onShow(data?: any): void {
        if (!data) return;

        this._heroId = Number(data);

        if (this.node) {
            this.node.active = true;
            this.forceSetLayerAndPosition();
        }

        try {
            this.showHeroDetail();
        } catch (error) {
            if (EDM.isDev()) console.error(`[HeroDetailPanel] showHeroDetail 调用失败:`, error);
        }

        this.scheduleOnce(() => {
            this.initUpgradeNotifications();
        }, 0.1);
    }

    private initUpgradeNotifications(): void {
        if (!this._currentHero) return;

        this.updateButtonStates();
        this.updateUpgradeButtonNotification(HDM.canUpgradeHero(Number(this._currentHero.id)));
        this.updateStarUpButtonNotification(HDM.canStarUpHero(Number(this._currentHero.id)));
    }

    protected onHide(): void {
        super.onHide();

        this.stopHeroAnimation();
        this._currentHero = null;
        this._allHeroes = [];
        this._currentIndex = 0;
    }

    onDestroy(): void {
        this.stopHeroAnimation();
        
        gameBus.off(SIGNAL_TYPES.HERO_DATA_UPDATED, this._onHeroDataUpdatedHandler);
        gameBus.off(SIGNAL_TYPES.HERO_DATA_BATCH_UPDATED, this._onHeroDataBatchUpdatedHandler);
    }

    private _onHeroDataUpdatedHandler: Function | null = null;
    private _onHeroDataBatchUpdatedHandler: Function | null = null;

    private onHeroDataUpdated(data: any): void {
        if (!data || !data.heroId) return;
        if (this._currentHero && this._currentHero.id === data.heroId) {
            this.updateDisplay();
            this.updateButtonStates();
        }
    }

    private onHeroDataBatchUpdated(data: any): void {
        if (!data || !data.updates) return;
        const updatedHeroIds = data.updates.map((update: any) => update.id);
        if (this._currentHero && updatedHeroIds.includes(this._currentHero.id)) {
            this.updateDisplay();
            this.updateButtonStates();
        }
    }

    protected getContentNode(): Node {
        return this.node;
    }

    protected _playOpenAnim(): void {
        this.scheduleOnce(() => {
            if (this.node) {
                this.forceSetLayerAndPosition();
            }
        }, 0.1);
    }

    private applyRedesignedLayout(): void {
        if (!this.node) return;

        this.ensureFullOpaqueBackdrop();
        this.hideLegacyDetailDecorations();

        const screenSize = view.getVisibleSize();
        const layer = this.ensureNode(this.node, HERO_DETAIL_LAYOUT_NODE, screenSize.width, screenSize.height, new Vec3(0, 0, 0));
        layer.setSiblingIndex(10);

        this.drawPanel(
            this.ensureNode(layer, 'HeroPreviewPanel', 300, 470, new Vec3(-210, 105, 0)),
            300,
            470,
            new Color(10, 16, 38, 248),
            new Color(41, 218, 255, 220),
            18,
            3
        );
        this.drawPanel(
            this.ensureNode(layer, 'StatsPanel', 382, 500, new Vec3(155, 115, 0)),
            382,
            500,
            new Color(13, 20, 46, 252),
            new Color(255, 195, 93, 225),
            18,
            3
        );
        this.drawPanel(
            this.ensureNode(layer, 'ProgressPanel', 650, 96, new Vec3(0, -205, 0)),
            650,
            96,
            new Color(9, 13, 34, 250),
            new Color(75, 232, 178, 210),
            16,
            2
        );

        this.ensureLabel(layer, 'StatsTitle', '升级收益', 230, 44, 155, 328, 27, new Color(255, 234, 156, 255), true);
        this.ensureLabel(layer, 'StatsSubtitle', '属性变化', 210, 28, 155, 287, 17, new Color(174, 225, 246, 245));
        this.ensureLabel(layer, 'ProgressTitle', '资源消耗', 180, 30, -235, -170, 20, new Color(255, 234, 156, 255), true);

        this.layoutExistingNode(this.heroImage, HERO_DETAIL_IMAGE_MAX_WIDTH, HERO_DETAIL_IMAGE_MAX_HEIGHT, -210, 100, 40);
        this.styleTextNode(this.heroName, 38, new Color(255, 245, 205, 255), true);
        this.styleTextNode(this.heroLevel, 22, new Color(190, 239, 255, 255), true);
        this.styleTextNode(this.heroStar, 22, new Color(255, 222, 111, 255), true);
        this.styleTextNode(this.heroDescription, 18, new Color(203, 228, 242, 245));

        this.styleBackButtonNode();
        this.layoutExistingNode(this.leftArrow, 72, 124, -338, 96, 45);
        this.layoutExistingNode(this.rightArrow, 72, 124, 338, 96, 45);

        this.layoutExistingNode(this.upgradeProgress, 515, 34, 58, -205, 52);
        this.styleGeneratedButtonNode(this.upgradeButton, '升级', 310, 86, -175, -295, HERO_DETAIL_UPGRADE_BUTTON_PATH, 55);
        this.styleGeneratedButtonNode(this.starUpButton, '升星', 310, 86, 175, -295, HERO_DETAIL_STAR_BUTTON_PATH, 55);

        if (this.upgradeButtonNotification) {
            this.layoutExistingNode(this.upgradeButtonNotification, 30, 30, 118, 34, 60);
        }
        if (this.starUpButtonNotification) {
            this.layoutExistingNode(this.starUpButtonNotification, 30, 30, 118, 34, 60);
        }
    }

    private updateRedesignedStats(): void {
        if (!this.node || !this._currentHero) return;

        const screenSize = view.getVisibleSize();
        const layer = this.ensureNode(this.node, HERO_DETAIL_LAYOUT_NODE, screenSize.width, screenSize.height, new Vec3(0, 0, 0));
        const heroId = Number(this._currentHero.id);
        const runtimeData = HDM.getHeroRuntimeData(heroId);
        const currentLevel = runtimeData?.level || Number(this._currentHero.level) || 1;
        const maxLevel = Number(this._currentHero.max_level) || 99;
        const isMaxLevel = currentLevel >= maxLevel;
        const nextLevel = isMaxLevel ? currentLevel : currentLevel + 1;
        const currentStats = {
            hp: Number(this._currentHero.hp) || 0,
            atk: Number(this._currentHero.atk) || 0,
            defense: Number(this._currentHero.defense) || 0,
            move_speed: Number(this._currentHero.move_speed) || 0,
        };
        const nextStats = isMaxLevel ? currentStats : HeroUpgradeService.previewLevelGrowth(this._currentHero, nextLevel);

        this.ensureLabel(
            layer,
            'LevelPathValue',
            isMaxLevel ? `Lv.${currentLevel} 已满级` : `Lv.${currentLevel} -> Lv.${nextLevel}`,
            260,
            34,
            155,
            253,
            20,
            new Color(255, 248, 214, 255),
            true
        );

        const rows = [
            { name: '生命', current: currentStats.hp, next: nextStats.hp },
            { name: '攻击', current: currentStats.atk, next: nextStats.atk },
            { name: '防御', current: currentStats.defense, next: nextStats.defense },
            { name: '移速', current: currentStats.move_speed, next: nextStats.move_speed },
        ];

        rows.forEach((row, index) => {
            const y = 205 - index * 54;
            this.drawPanel(
                this.ensureNode(layer, `StatRow${index}`, 322, 40, new Vec3(155, y, 0)),
                322,
                40,
                new Color(20, 32, 60, 210),
                new Color(80, 141, 172, 105),
                10,
                1
            );
            this.ensureLabel(layer, `StatName${index}`, row.name, 72, 30, 35, y, 18, new Color(175, 221, 244, 250), true, Label.HorizontalAlign.LEFT);
            this.ensureLabel(layer, `StatValue${index}`, `${this.formatStat(row.current)} -> ${this.formatStat(row.next)}`, 160, 30, 165, y, 18, new Color(245, 250, 255, 255));
            this.ensureLabel(layer, `StatDelta${index}`, this.formatDelta(row.next - row.current), 72, 30, 292, y, 17, new Color(99, 255, 174, 255), true);
        });

        const currentFragments = CDM.getHeroFragmentCount(heroId);
        const requiredFragments = HDM.calculateUpgradeFragments(currentLevel);
        const requiredGold = 100 * currentLevel;
        const currentGold = CDM.getCurrency(CurrencyType.Gold) || 0;
        const currentStar = runtimeData?.star || Number(this._currentHero.star) || 1;
        const maxStar = Number(this._currentHero.max_star) || 99;
        const isMaxStar = currentStar >= maxStar;
        const nextStar = isMaxStar ? currentStar : currentStar + 1;
        const requiredStarFragments = HDM.calculateStarUpFragments(currentStar);

        this.ensureLabel(
            layer,
            'UpgradeCostValue',
            `碎片 ${currentFragments}/${requiredFragments}   金币 ${this.formatStat(currentGold)}/${requiredGold}`,
            405,
            30,
            105,
            -170,
            18,
            new Color(229, 247, 255, 255),
            true
        );
        this.ensureLabel(
            layer,
            'StarCostValue',
            isMaxStar ? `${currentStar}星 已满星` : `${currentStar}星 -> ${nextStar}星   升星碎片 ${currentFragments}/${requiredStarFragments}`,
            520,
            30,
            45,
            -245,
            18,
            new Color(255, 226, 160, 255),
            true
        );
    }

    private hideLegacyDetailDecorations(): void {
        if (!this.node) return;

        const legacyNames = ['Background', 'RightBar', 'StarUpProgress'];
        legacyNames.forEach((name) => {
            const legacyNode = this.node.getChildByName(name);
            if (legacyNode) {
                legacyNode.active = false;
            }
        });

        const skinPolish = this.node.getChildByName('Skin1UIPolish');
        if (skinPolish) {
            skinPolish.active = false;
        }
    }

    private refreshCurrentHeroData(): void {
        if (!this._currentHero) return;
        const latestHero = HDM.getHeroById(Number(this._currentHero.id));
        if (latestHero) {
            Object.assign(this._currentHero as any, latestHero);
        }

        const runtimeData = HDM.getHeroRuntimeData(Number(this._currentHero.id));
        if (runtimeData) {
            this._currentHero.level = runtimeData.level;
            this._currentHero.star = runtimeData.star;
        }
    }

    private ensureFullOpaqueBackdrop(): void {
        if (!this.node) return;
        const screenSize = view.getVisibleSize();
        const backdrop = this.ensureNode(this.node, HERO_DETAIL_BACKDROP_NODE, screenSize.width, screenSize.height, new Vec3(0, 0, 0));
        const graphics = backdrop.getComponent(Graphics) || backdrop.addComponent(Graphics);
        graphics.clear();
        graphics.fillColor = new Color(5, 8, 24, 255);
        graphics.rect(-screenSize.width / 2, -screenSize.height / 2, screenSize.width, screenSize.height);
        graphics.fill();
        backdrop.setSiblingIndex(0);
    }

    private ensureNode(parent: Node, name: string, width: number, height: number, position: Vec3): Node {
        let node = parent.getChildByName(name);
        if (!node) {
            node = new Node(name);
            node.parent = parent;
        }
        node.active = true;
        this.ensureTransform(node, width, height);
        node.setPosition(position);
        return node;
    }

    private ensureTransform(node: Node, width: number, height: number): UITransform {
        let transform = node.getComponent(UITransform);
        if (!transform) {
            transform = node.addComponent(UITransform);
        }
        transform.setContentSize(width, height);
        return transform;
    }

    private drawPanel(node: Node, width: number, height: number, fill: Color, stroke: Color, radius: number, lineWidth: number): void {
        this.ensureTransform(node, width, height);
        const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
        graphics.clear();
        graphics.fillColor = fill;
        graphics.strokeColor = stroke;
        graphics.lineWidth = lineWidth;
        graphics.roundRect(-width / 2, -height / 2, width, height, radius);
        graphics.fill();
        graphics.stroke();
    }

    private ensureLabel(
        parent: Node,
        name: string,
        text: string,
        width: number,
        height: number,
        x: number,
        y: number,
        fontSize: number,
        color: Color,
        bold: boolean = false,
        align: Label.HorizontalAlign = Label.HorizontalAlign.CENTER
    ): Label {
        const node = this.ensureNode(parent, name, width, height, new Vec3(x, y, 0));
        let label = node.getComponent(Label);
        if (!label) {
            label = node.addComponent(Label);
        }
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = Math.round(fontSize * 1.2);
        label.color = color;
        label.isBold = bold;
        label.horizontalAlign = align;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableOutline = true;
        label.outlineColor = new Color(0, 0, 0, 220);
        label.outlineWidth = bold ? 3 : 2;
        return label;
    }

    private layoutExistingNode(node: Node | null, width: number, height: number, x: number, y: number, siblingIndex?: number): void {
        if (!node) return;
        node.active = true;
        this.ensureTransform(node, width, height);
        node.setPosition(x, y, 0);
        node.setScale(1, 1, 1);
        const opacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
        opacity.opacity = 255;
        if (siblingIndex !== undefined) {
            node.setSiblingIndex(siblingIndex);
        }
    }

    private styleTextNode(node: Node | null, fontSize: number, color: Color, bold: boolean = false): void {
        if (!node) return;
        const label = node.getComponent(Label);
        if (!label) return;
        label.fontSize = fontSize;
        label.lineHeight = Math.round(fontSize * 1.15);
        label.color = color;
        label.isBold = bold;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableOutline = true;
        label.outlineColor = new Color(0, 0, 0, 230);
        label.outlineWidth = bold ? 3 : 2;
    }

    private styleBackButtonNode(): void {
        if (!this.backButton) return;

        this.layoutExistingNode(this.backButton, 138, 96, -300, 548, 70);
        this.hideLegacyButtonParts(this.backButton);
        this.applyGeneratedSpriteFrame(this.backButton, HERO_DETAIL_BACK_BUTTON_PATH);

        const button = this.backButton.getComponent(Button);
        if (button) {
            button.target = this.backButton;
            button.transition = Button.Transition.SCALE;
            button.zoomScale = 1.05;
        }
    }

    private styleGeneratedButtonNode(node: Node | null, text: string, width: number, height: number, x: number, y: number, spritePath: string, siblingIndex: number): void {
        if (!node) return;
        this.layoutExistingNode(node, width, height, x, y, siblingIndex);
        this.hideLegacyButtonParts(node);
        this.applyGeneratedSpriteFrame(node, spritePath);

        const button = node.getComponent(Button);
        if (button) {
            button.target = node;
            button.transition = Button.Transition.SCALE;
            button.zoomScale = 1.04;
        }

        const label = node.getComponent(Label) || node.getComponentInChildren(Label);
        if (label) {
            label.node.active = true;
            if (label.node !== node) {
                this.ensureTransform(label.node, width - 78, Math.floor(height * 0.68));
                label.node.setPosition(0, -1, 0);
                label.node.setSiblingIndex(20);
            }
            label.string = text;
            label.fontSize = 30;
            label.lineHeight = 36;
            label.color = new Color(255, 255, 255, 255);
            label.isBold = true;
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
            label.overflow = Label.Overflow.SHRINK;
            label.enableOutline = true;
            label.outlineColor = new Color(44, 11, 72, 245);
            label.outlineWidth = 4;
        }
    }

    private hideLegacyButtonParts(node: Node): void {
        node.children.forEach((child) => {
            if (child.name === 'Skin1ButtonBg' || child.name === 'Icon' || child.name.startsWith('Background')) {
                child.active = false;
            }
        });
    }

    private applyGeneratedSpriteFrame(node: Node, resourcePath: string): void {
        const sprite = node.getComponent(Sprite) || node.addComponent(Sprite);
        sprite.color = new Color(255, 255, 255, 255);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SIMPLE;

        const cachedFrame = this._detailButtonSpriteFrameCache.get(resourcePath);
        if (cachedFrame) {
            sprite.spriteFrame = cachedFrame;
            return;
        }

        ResourceManager.getInstance()
            .load<Texture2D>(resourcePath, ResourceType.TEXTURE, 'res')
            .then((texture) => {
                if (!texture) return;
                const frame = new SpriteFrame();
                frame.texture = texture;
                this._detailButtonSpriteFrameCache.set(resourcePath, frame);
                if (!node || !node.isValid || !this.node || !this.node.isValid) return;
                const targetSprite = node.getComponent(Sprite) || node.addComponent(Sprite);
                targetSprite.spriteFrame = frame;
                targetSprite.color = new Color(255, 255, 255, 255);
                targetSprite.sizeMode = Sprite.SizeMode.CUSTOM;
                targetSprite.type = Sprite.Type.SIMPLE;
            })
            .catch((error) => {
                if (EDM.isDev()) console.warn(`[HeroDetailPanel] 加载详情页按钮贴图失败: ${resourcePath}`, error);
            });
    }

    private styleButtonNode(node: Node | null, text: string, width: number, height: number, x: number, y: number, fill: Color, stroke: Color, siblingIndex: number): void {
        if (!node) return;
        this.layoutExistingNode(node, width, height, x, y, siblingIndex);

        const bg = this.ensureNode(node, 'Skin1ButtonBg', width, height, new Vec3(0, 0, 0));
        bg.setSiblingIndex(0);
        this.drawPanel(bg, width, height, fill, stroke, Math.min(16, height / 3), 2);

        const sprite = node.getComponent(Sprite);
        if (sprite) {
            sprite.color = new Color(255, 255, 255, 255);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        }

        const label = node.getComponent(Label) || node.getComponentInChildren(Label);
        if (label) {
            label.string = text;
            label.fontSize = height >= 70 ? 29 : 20;
            label.lineHeight = Math.round(label.fontSize * 1.15);
            label.color = new Color(255, 255, 255, 255);
            label.isBold = true;
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
            label.overflow = Label.Overflow.SHRINK;
            label.enableOutline = true;
            label.outlineColor = new Color(0, 0, 0, 220);
            label.outlineWidth = 3;
        }
    }

    private fitHeroImageToPreview(spriteFrame: SpriteFrame, transform: UITransform, paddingScale: number = 1): void {
        const width = spriteFrame.rect.width;
        const height = spriteFrame.rect.height;
        if (width <= 0 || height <= 0) return;

        const scale = Math.min(HERO_DETAIL_IMAGE_MAX_WIDTH / width, HERO_DETAIL_IMAGE_MAX_HEIGHT / height) * paddingScale;
        const safeScale = Math.min(scale, HERO_DETAIL_IMAGE_MAX_WIDTH / width, HERO_DETAIL_IMAGE_MAX_HEIGHT / height);
        transform.setContentSize(width * safeScale, height * safeScale);
    }

    private formatStat(value: number): string {
        if (!Number.isFinite(value)) return '0';
        if (Math.abs(value - Math.round(value)) < 0.01) {
            return `${Math.round(value)}`;
        }
        return value.toFixed(1);
    }

    private formatDelta(delta: number): string {
        const prefix = delta >= 0 ? '+' : '';
        return `${prefix}${this.formatStat(delta)}`;
    }


    private forceSetLayerAndPosition(): void {
        if (!this.node) return;

        const uiTransform = this.node.getComponent(UITransform);
        if (uiTransform) {
            const screenSize = view.getVisibleSize();
            uiTransform.setContentSize(screenSize.width, screenSize.height);
        }

        this.node.setSiblingIndex(999999);

        this.ensurePanelOpaque();

        let widget = this.node.getComponent(Widget);
        if (!widget) {
            widget = this.node.addComponent(Widget);
        }
        if (widget) {
            widget.isAlignTop = true;
            widget.top = 0;
            widget.isAlignBottom = true;
            widget.bottom = 0;
            widget.isAlignLeft = true;
            widget.left = 0;
            widget.isAlignRight = true;
            widget.right = 0;
            widget.updateAlignment();
            widget.enabled = false;
        }

        this.alignPanelToCanvasCenter();

        const content = this.getContentNode();
        if (content && content !== this.node) {
            content.setScale(1, 1, 1);
            content.setPosition(0, 0, 0);
        }

        this.node.updateWorldTransform();
    }

    private alignPanelToCanvasCenter(): void {
        if (!this.node) return;

        const canvas = this.node.scene?.getChildByName('Canvas');
        if (!canvas) {
            this.node.setPosition(0, 0, 0);
            return;
        }

        const canvasWorldPosition = canvas.getWorldPosition();
        const currentWorldPosition = this.node.getWorldPosition();
        this.node.setWorldPosition(new Vec3(canvasWorldPosition.x, canvasWorldPosition.y, currentWorldPosition.z));
    }

    private ensurePanelOpaque(): void {
        if (!this.node) return;

        const uiOpacity = this.node.getComponent(UIOpacity);
        if (uiOpacity) {
            uiOpacity.opacity = 255;
        }

        let sprite = this.node.getComponent(Sprite);
        if (!sprite) {
            sprite = this.node.addComponent(Sprite);
        }

        sprite.color.set(255, 255, 255, 255);

        let spriteUIOpacity = sprite.node.getComponent(UIOpacity);
        if (!spriteUIOpacity) {
            spriteUIOpacity = sprite.node.addComponent(UIOpacity);
        }
        spriteUIOpacity.opacity = 255;

        if (!sprite.spriteFrame) {
            this.createSolidBackground();
        }
    }

    private createSolidBackground(): void {
        if (!this.node) return;

        this.ensureFullOpaqueBackdrop();
    }
}
