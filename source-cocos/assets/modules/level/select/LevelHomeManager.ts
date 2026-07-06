// assets/scripts/levels/LevelHomeManager.ts
import {
    _decorator,
    Color,
    Label,
    Node,
    Sprite,
    UITransform,
    Button,
    SpriteFrame,
    tween,
    Vec3,
    Tween,
    Vec2,
} from 'cc';
import { LevelConfiger } from './LevelConfiger';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';
import { PDM } from 'db://assets/utils/data/config/player/PlayerDataManager';
import { LDM } from '../config/LevelDataManager';

/**
 * 关卡管理器 - 负责关卡显示、切换和星球动画
 */
export class LevelHomeManager {
    // 节点引用
    private levelNode: Node | null = null;

    // 星球节点
    private planetNode: Node | null = null;
    private planetSprite: Sprite | null = null;
    private originalScale: Vec3 = new Vec3(1, 1, 1); // 保存原始缩放

    // 动画相关
    private rotationTween: Tween<Node> | null = null;
    private floatTween: Tween<Node> | null = null;
    private pulseTween: Tween<Node> | null = null;
    private currentPlanetIndex: number = -1;

    /**
     * 初始化关卡管理器
     */
    public init(levelNode: Node): void {
        if (EDM.isDev()) console.log('[LevelHomeManager] 开始初始化');
        this.levelNode = levelNode;

        if (!this.levelNode) {
            if (EDM.isDev()) console.error('[LevelHomeManager] levelNode 为空');
            return;
        }

        this.hideLevelCaptionNodes(this.levelNode);

        if (EDM.isDev()) console.log('[LevelHomeManager] 初始化完成');
    }

    /**
     * 初始化关卡信息
     */
    public async initLevel(levelIndex: number): Promise<void> {
        if (EDM.isDev()) console.log(`[LevelHomeManager] 初始化关卡 ${levelIndex}`);

        try {
            if (!this.levelNode) {
                if (EDM.isDev()) console.error('[LevelHomeManager] levelNode 未初始化');
                return;
            }

            // 获取关卡数据
            const levelData = LDM.getLevelById(levelIndex);
            if (!levelData) {
                if (EDM.isDev()) console.warn('[LevelHomeManager] 未找到关卡数据', levelIndex);
                return;
            }

            // 更新关卡文本信息
            this.updateLevelTexts(levelIndex, levelData);

            // 加载并显示星球图片
            await this.loadAndDisplayPlanet(levelIndex);

            // 初始化关卡切换箭头
            this.initLevelChangeArrow(levelIndex);

        } catch (error) {
            if (EDM.isDev()) console.error('[LevelHomeManager] 初始化关卡失败:', error);
        }
    }

    /**
     * 更新关卡文本信息
     */
    private updateLevelTexts(levelIndex: number, levelData: any): void {
        try {
            const node = this.levelNode;
            if (!node) {
                if (EDM.isDev()) console.warn('[LevelHomeManager] 未找到Node节点');
                return;
            }

            this.hideLevelCaptionNodes(node);
        } catch (error) {
            if (EDM.isDev()) console.warn('[LevelHomeManager] 更新关卡文本失败:', error);
        }
    }

    private hideLevelCaptionNodes(root: Node): void {
        const label = root.getComponent(Label);
        const isLegacyCaption =
            root.name === 'Title' ||
            root.name === 'Name' ||
            (!!label && /关卡|level/i.test(label.string));

        if (isLegacyCaption) {
            root.active = false;
            if (label) label.string = '';
            return;
        }

        root.children.forEach(child => this.hideLevelCaptionNodes(child));
    }

    /**
     * 加载并显示星球图片
     */
    private async loadAndDisplayPlanet(levelIndex: number): Promise<void> {
        if (EDM.isDev()) console.log(`[LevelHomeManager] 加载关卡 ${levelIndex} 的星球图片`);

        try {
            // 获取Content容器
            const content = this.getContentContainer();
            if (!content) {
                if (EDM.isDev()) console.error('[LevelHomeManager] 无法获取Content容器');
                return;
            }

            // 如果已经显示当前星球的图片，检查是否需要更新
            if (this.currentPlanetIndex === levelIndex && this.planetSprite?.spriteFrame) {
                if (EDM.isDev()) console.log(`[LevelHomeManager] 关卡 ${levelIndex} 已经显示`);

                // 检查动画是否在运行
                const isAnimationRunning = this.floatTween && this.pulseTween;
                if (isAnimationRunning) {
                    if (EDM.isDev()) console.log(`[LevelHomeManager] 动画正在运行，跳过重置`);
                    return; // 动画已经在运行，直接返回，不执行后续操作
                } else {
                    if (EDM.isDev()) console.log(`[LevelHomeManager] 动画未运行，重新启动动画`);
                    this.playPlanetAnimation(levelIndex);
                    return;
                }
            }

            // 停止之前的动画
            this.stopAnimations();

            // 清理旧的星球节点（包括容器节点）
            this.cleanupOldPlanetNodes(content);

            // 创建新的星球节点
            this.planetNode = new Node('Planet');

            // 从LevelConfiger获取星球图片（优先加载当前关卡）
            const spriteFrame = await LevelConfiger.loadCurrentPlanet(levelIndex);

            if (spriteFrame) {
                if (EDM.isDev()) console.log(`[LevelHomeManager] 获取到星球图片，尺寸: ${spriteFrame.width}x${spriteFrame.height}`);

                // 设置星球节点属性 - 修复变形问题
                this.setupPlanetNode(levelIndex, spriteFrame, content);

                // 播放星球动画
                this.playPlanetAnimation(levelIndex);

            } else {
                // 图片未加载，使用颜色星球
                if (EDM.isDev()) console.warn(`[LevelHomeManager] 星球图片未加载，使用颜色星球: 关卡${levelIndex + 1}`);
                this.createColoredPlanet(levelIndex, content);
            }

            // 保存当前星球索引
            this.currentPlanetIndex = levelIndex;

        } catch (error) {
            if (EDM.isDev()) console.error('[LevelHomeManager] 加载显示星球图片失败:', error);
            const content = this.getContentContainer();
            if (content) {
                this.createColoredPlanet(levelIndex, content);
            }
        }
    }

    /**
     * 清理旧的星球节点（包括容器节点）
     */
    private cleanupOldPlanetNodes(content: Node): void {
        // 清理旧的容器节点
        const oldContainer = content.getChildByName('PlanetContainer');
        if (oldContainer) {
            oldContainer.removeFromParent();
            oldContainer.destroy();
            if (EDM.isDev()) console.log('[LevelHomeManager] 清理旧的容器节点');
        }

        // 清理旧的星球节点
        if (this.planetNode) {
            this.planetNode.removeFromParent();
            this.planetNode = null;
            this.planetSprite = null;
            if (EDM.isDev()) console.log('[LevelHomeManager] 清理旧的星球节点');
        }
    }

    /**
     * 获取Content容器
     */
    private getContentContainer(): Node | null {
        if (!this.levelNode) return null;

        const main = this.levelNode.getChildByName('Main');
        return main?.getChildByName('Content') || null;
    }

    /**
     * 设置星球节点属性 - 修复图片变形问题
     */
    private setupPlanetNode(levelIndex: number, spriteFrame: SpriteFrame, parentNode: Node): void {
        if (!this.planetNode) return;

        if (EDM.isDev()) console.log(`[LevelHomeManager] 设置星球节点: 关卡${levelIndex + 1}`);

        // 确保星球节点在父节点中
        if (this.planetNode.parent !== parentNode) {
            parentNode.addChild(this.planetNode);
        }

        // 添加精灵组件（如果还没有）
        if (!this.planetSprite) {
            this.planetSprite = this.planetNode.addComponent(Sprite);
        }

        // 设置精灵属性
        this.planetSprite.spriteFrame = spriteFrame;

        // 添加UITransform组件
        const uiTransform = this.planetNode.getComponent(UITransform) || this.planetNode.addComponent(UITransform);

        // 设置图片大小为450*450
        uiTransform.setContentSize(450, 450);

        // 重置缩放为1:1
        this.planetNode.setScale(1, 1, 1);

        // 记录原始缩放（用于动画重置）
        this.originalScale = this.planetNode.scale.clone();

        if (EDM.isDev()) console.log(`[LevelHomeManager] 星球节点设置完成，尺寸: 450x450`);

        // 确保星球节点在最上层显示
        this.planetNode.setSiblingIndex(999);
    }

    /**
     * 创建颜色星球（备用方案）
     */
    private createColoredPlanet(levelIndex: number, parentNode: Node): void {
        if (EDM.isDev()) console.log(`[LevelHomeManager] 创建颜色星球: 关卡${levelIndex + 1}`);

        try {
            // 清理旧的星球节点
            if (this.planetNode) {
                this.planetNode.removeFromParent();
                this.planetNode = null;
                this.planetSprite = null;
            }

            // 创建新的星球节点
            this.planetNode = new Node('Planet');
            parentNode.addChild(this.planetNode);

            // 添加精灵组件
            this.planetSprite = this.planetNode.addComponent(Sprite);
            this.planetSprite.type = Sprite.Type.SIMPLE;
            this.planetSprite.sizeMode = Sprite.SizeMode.CUSTOM;

            // 从LevelConfiger获取颜色
            const color = LevelConfiger.getPlanetColor(levelIndex);
            this.planetSprite.color = color;

            // 添加UITransform并设置大小
            const uiTransform = this.planetNode.addComponent(UITransform);
            // 颜色星球使用圆形大小
            uiTransform.setContentSize(180, 180);

            // 设置位置和缩放
            this.planetNode.setPosition(0, 0, 0);
            const config = LevelConfiger.getPlanetConfig(levelIndex);
            this.originalScale = new Vec3(config.scale, config.scale, 1);
            this.planetNode.setScale(this.originalScale);

            // 确保星球节点在最上层显示
            this.planetNode.setSiblingIndex(999);

            // 播放星球动画
            this.playPlanetAnimation(levelIndex);

            // 保存当前星球索引
            this.currentPlanetIndex = levelIndex;

            if (EDM.isDev()) console.log(`[LevelHomeManager] 颜色星球创建完成: 关卡${levelIndex + 1}`);

        } catch (error) {
            if (EDM.isDev()) console.error('[LevelHomeManager] 创建颜色星球失败:', error);
        }
    }

    /**
     * 播放星球动画
     */
    private playPlanetAnimation(levelIndex: number): void {
        if (!this.planetNode) {
            if (EDM.isDev()) console.warn(`[LevelHomeManager] 星球节点不存在，无法播放动画`);
            return;
        }

        // 检查动画是否已经在运行
        const isAnimationRunning = this.floatTween && this.pulseTween;
        if (isAnimationRunning) {
            if (EDM.isDev()) console.log(`[LevelHomeManager] 动画已经在运行，跳过重新启动`);
            return;
        }

        if (EDM.isDev()) console.log(`[LevelHomeManager] 播放星球动画: 关卡${levelIndex + 1}`);

        // 从LevelConfiger获取星球配置
        const config = LevelConfiger.getPlanetConfig(levelIndex);
        if (EDM.isDev()) console.log(`[LevelHomeManager] 动画配置: 旋转速度=${config.rotationSpeed}, 浮动幅度=${config.floatAmplitude}, 浮动速度=${config.floatSpeed}`);

        // 播放旋转动画（逆时针）
        // this.playRotationAnimation(config.rotationSpeed);

        // 播放浮动动画
        this.playFloatAnimation(config.floatAmplitude, config.floatSpeed);
        this.playPulseAnimation();
    }

    /**
     * 播放旋转动画 - 修复：逆时针旋转，按配置速度
     */
    private playRotationAnimation(speed: number): void {
        if (!this.planetNode) return;

        // 停止之前的旋转动画
        if (this.rotationTween) {
            this.rotationTween.stop();
        }

        // 重置旋转角度
        this.planetNode.angle = 0;

        // 计算旋转周期：360度 / 每秒速度 = 多少秒转一圈
        const rotationPeriod = 360 / speed; // 单位：秒

        if (EDM.isDev()) console.log(`[LevelHomeManager] 旋转动画: 速度=${speed}度/秒, 周期=${rotationPeriod.toFixed(2)}秒/圈, 方向=逆时针`);

        // 逆时针旋转（angle增加为正）
        this.rotationTween = tween(this.planetNode)
            .by(rotationPeriod, { angle: 360 }) // 逆时针旋转360度
            .union()
            .repeatForever()
            .start();
    }

    /**
     * 播放浮动动画 - 确保浮动动画存在
     */
    private playFloatAnimation(amplitude: number, speed: number): void {
        if (!this.planetNode) return;

        // 停止之前的浮动动画
        if (this.floatTween) {
            this.floatTween.stop();
        }

        // 重置位置到浮动起点
        this.planetNode.setPosition(0, 0, 0);

        if (EDM.isDev()) console.log(`[LevelHomeManager] 浮动动画: 幅度=${amplitude}像素, 速度=${speed}秒/周期`);

        // 上下浮动动画
        this.floatTween = tween(this.planetNode)
            .to(speed, { position: new Vec3(0, amplitude, 0) }, { easing: 'sineInOut' })
            .to(speed, { position: new Vec3(0, -amplitude, 0) }, { easing: 'sineInOut' })
            .to(speed, { position: new Vec3(0, 0, 0) }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    private playPulseAnimation(): void {
        if (!this.planetNode) return;

        if (this.pulseTween) {
            this.pulseTween.stop();
        }

        const baseScale = this.originalScale.clone();
        const brightScale = new Vec3(baseScale.x * 1.035, baseScale.y * 1.035, baseScale.z);

        this.pulseTween = tween(this.planetNode)
            .to(1.2, { scale: brightScale }, { easing: 'sineInOut' })
            .to(1.2, { scale: baseScale }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    /**
     * 停止所有动画
     */
    private stopAnimations(): void {
        // 如果动画已经在运行，才停止
        const hasAnimations = this.rotationTween || this.floatTween || this.pulseTween;
        if (!hasAnimations) {
            return;
        }

        if (EDM.isDev()) console.log('[LevelHomeManager] 停止动画');

        try {
            if (this.rotationTween) {
                this.rotationTween.stop();
                this.rotationTween = null;
            }

            if (this.floatTween) {
                this.floatTween.stop();
                this.floatTween = null;
            }

            if (this.pulseTween) {
                this.pulseTween.stop();
                this.pulseTween = null;
            }

            if (this.planetNode) {
                tween(this.planetNode).stop();
                // 重置节点属性
                this.planetNode.setScale(this.originalScale);
                this.planetNode.setPosition(0, 0, 0);
                this.planetNode.angle = 0;
            }
        } catch (error) {
            if (EDM.isDev()) console.warn('[LevelHomeManager] 停止动画失败:', error);
        }
    }


    /**
     * 初始化关卡切换箭头
     * - 左箭头：关卡1时置灰（不能往前）
     * - 右箭头：超过最新解锁关卡或最后一关时置灰
     */
    public initLevelChangeArrow(levelIndex: number): void {
        try {
            if (!this.levelNode) return;

            const latestLevel = PDM.getLatestLevel();
            const totalLevels = LDM.getLevelCount();

            if (EDM.isDev()) {
                console.log(`[LevelHomeManager] 初始化关卡切换箭头: 当前关卡=${levelIndex}, 最新解锁关卡=${latestLevel}, 总关卡数=${totalLevels}`);
            }

            // 是否置灰prev按钮 - 关卡1时置灰
            const arrow1 = this.levelNode.getChildByPath('Main/Arrow1/Sprite');
            if (arrow1 && arrow1.getComponent(Sprite)) {
                const prevDisabled = levelIndex <= 1;
                arrow1.getComponent(Sprite)!.color = prevDisabled ?
                    new Color('#999999') : new Color('#FFFFFF');

                const prevButton = arrow1.getComponent(Button);
                if (prevButton) {
                    prevButton.interactable = !prevDisabled;
                    if (EDM.isDev()) console.log(`[LevelHomeManager] 左箭头按钮: interactable=${!prevDisabled}`);
                }
            }

            // 是否置灰next按钮 - 超过最新解锁关卡或最后一关时置灰
            const arrow2 = this.levelNode.getChildByPath('Main/Arrow2/Sprite');
            if (arrow2 && arrow2.getComponent(Sprite)) {
                const nextDisabled = levelIndex >= latestLevel || levelIndex >= totalLevels - 1;
                arrow2.getComponent(Sprite)!.color = nextDisabled ?
                    new Color('#999999') : new Color('#FFFFFF');

                const nextButton = arrow2.getComponent(Button);
                if (nextButton) {
                    nextButton.interactable = !nextDisabled;
                    if (EDM.isDev()) console.log(`[LevelHomeManager] 右箭头按钮: interactable=${!nextDisabled}`);
                }
            }

            if (arrow1) arrow1.setSiblingIndex(2000);
            if (arrow2) arrow2.setSiblingIndex(2001);
        } catch (error) {
            if (EDM.isDev()) console.warn('[LevelHomeManager] 初始化关卡切换箭头失败:', error);
        }
    }

    /**
     * 切换关卡
     */
    public async changeLevel(currentLevel: number, type: 'prev' | 'next'): Promise<number> {
        try {
            let newLevel = currentLevel;

            if (type === 'prev') {
                if (currentLevel > 1) {
                    newLevel--;
                } else {
                    if (EDM.isDev()) console.log('[LevelHomeManager] 已经是第一关，不能往前');
                    return currentLevel;
                }
            } else if (type === 'next') {
                if (currentLevel < PDM.getLatestLevel() && currentLevel < LDM.getLevelCount() - 1) {
                    newLevel++;
                } else {
                    if (EDM.isDev()) console.log('[LevelHomeManager] 已经是最后一关，不能往后');
                    return currentLevel;
                }
            }

            if (EDM.isDev()) console.log(`[LevelHomeManager] 切换关卡: ${currentLevel} -> ${newLevel}`);

            // 如果有变化，更新关卡
            if (newLevel !== currentLevel) {
                await this.initLevel(newLevel);
            }

            return newLevel;
        } catch (error) {
            if (EDM.isDev()) console.error('[LevelHomeManager] 切换关卡失败:', error);
            return currentLevel;
        }
    }

    /**
     * 应用文字样式
     */
    private applyTextStyle(label: Label, fontSize: number, addBorder: boolean = true): void {
        try {
            if (!label) return;
            label.fontSize = fontSize;
            label.lineHeight = fontSize + 4;
            label.color = new Color(255, 255, 255, 255);
            if (addBorder) {
                label.enableShadow = true;
                label.shadowColor = new Color(0, 0, 0, 255);
                label.shadowOffset = new Vec2(1, 1);
                label.shadowBlur = 2;
            }
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
        } catch (error) {
            if (EDM.isDev()) console.warn('[LevelHomeManager] 应用文字样式失败:', error);
        }
    }

    /**
     * 清理资源
     */
    public cleanup(): void {
        try {
            this.stopAnimations();
            this.levelNode = null;
            this.planetNode = null;
            this.planetSprite = null;
            this.currentPlanetIndex = -1;
            this.originalScale = new Vec3(1, 1, 1);
        } catch (error) {
            if (EDM.isDev()) console.warn('[LevelHomeManager] 清理资源失败:', error);
        }
    }
}
