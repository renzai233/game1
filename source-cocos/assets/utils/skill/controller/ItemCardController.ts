import { _decorator, Component, Node, Label, Sprite, tween, Vec2, Vec3, Color, UITransform, Graphics } from 'cc';
import { loadResSingleAsset } from 'db://assets/utils/utils';

import { HDM } from '../../data/config/hero/HeroDataManager';
import { SDM } from '../../data/config/skill/SkillDataManager';
const { ccclass, property } = _decorator;
const CARD_TITLE = new Color(248, 252, 255, 255);
const CARD_ACTION = new Color(218, 236, 255, 255);
const CARD_ROLE = new Color(255, 231, 150, 255);
const CARD_SHADOW = new Color(20, 2, 58, 235);
const CARD_FRAME_PATH = 'textures/ui/skin1/upgrade_card_frame/spriteFrame';
const CARD_BAKED_PATH = 'textures/ui/skin1/upgrade_cards/';
const CARD_ICON_PATH = 'textures/ui/skin1/card_icons/';
const CARD_FRAME_WIDTH = 226;
const CARD_FRAME_HEIGHT = 410;
const CARD_TITLE_Y = 132;
const CARD_ICON_Y = 74;
const CARD_ACTION_Y = -112;
const CARD_ICON_SIZE = 108;
const HERO_INTRO_BOX_WIDTH = 216;
const HERO_INTRO_BOX_HEIGHT = 120;
const HERO_INTRO_BOX_Y = -280;


/**
 * ItemCardController 卡牌控制器
 * 用于管理ItemCard预制体，支持新英雄和技能升级两种模式
 */
@ccclass('ItemCardController')
export class ItemCardController extends Component {
    @property(Node)
    bgNode: Node = null!; // 背景节点
    @property(Node)
    mainNode: Node = null!; // 主节点
    @property(Node)
    iconNode: Node = null!; // 图标节点
    @property(Node)
    iconBgNode: Node = null!; // 图标背景节点
    @property(Node)
    titleNode: Node = null!; // 标题节点
    @property(Node)
    avatarNode: Node = null!; // 头像节点
    @property(Node)
    avatarImageNode: Node = null!; // 头像节点
    @property(Node)
    avatarBgNode: Node = null!; // 头像背景节点
    @property(Node)
    descNode: Node = null!; // 描述节点

    private _data: any = null; // 卡牌数据
    private _isNewHero: boolean = false; // 是否为新英雄
    private _heroPath: string = "textures/hero/"; // 英雄路径
    private _skillPath: string = "textures/skill/"; // 技能路径
    private _premiumIconSprite: Sprite | null = null;
    private _premiumTitleLabel: Label | null = null;
    private _premiumDescLabel: Label | null = null;
    private _premiumHeroIntroLabel: Label | null = null;

    private getSkillId(): number | undefined {
        return this._data?.skill_id ?? this._data?.skillId ?? this._data?.id;
    }

    private getSkillConfig(): any {
        const skillId = this.getSkillId();
        if (skillId === undefined) return null;
        return SDM.getSkillById(skillId);
    }

    private getHeroConfig(): any {
        const heroId = this._data?.use_unit_id ?? this._data?.effect_unit_id;
        if (heroId === undefined) return null;
        return HDM.getHeroList().find(h => h.id === heroId);
    }

    private getBakedCardPath(): string {
        if (this._isNewHero) {
            const hero = this.getHeroConfig();
            const url = hero?.url ?? this._data?.avatar ?? 'default';
            return `${CARD_BAKED_PATH}hero_${url}/spriteFrame`;
        }

        const skillId = this.getSkillId();
        if (skillId !== undefined) {
            return `${CARD_BAKED_PATH}skill_${skillId}/spriteFrame`;
        }

        const skillCfg = this.getSkillConfig();
        const skillUrl = this._data?.url || skillCfg?.url || 'arrow';
        return `${CARD_BAKED_PATH}skill_${skillUrl}/spriteFrame`;
    }

    private compactEffectName(value: string | undefined, skillName: string): string {
        const raw = (value || '').trim();
        if (!raw) return '强化本次守护火力';
        return raw
            .replace(skillName, '')
            .replace(/获得/g, '')
            .replace(/保持原数值成长规则不变。?/g, '')
            .replace(/几何晶核矩阵制式技能：?/g, '')
            .trim()
            .replace(/^，/, '') || '强化本次守护火力';
    }

    private shortText(value: string | undefined, maxLength = 8): string {
        const raw = (value || '').trim();
        if (!raw || raw.length <= maxLength) return raw;
        return raw.slice(0, maxLength);
    }

    /**
     * 初始化卡牌数据
     * @param data 卡牌数据
     * @param isNewHero 是否为新英雄（true显示Avatar，false隐藏Avatar）
     */
    public init(data: any, isNewHero: boolean = false) {
        this._data = data;
        this._isNewHero = isNewHero;

        // 设置标题
        this.setTitle();
        // 设置背景颜色
        this.setBgColor();
        this.setAvatarBgColor();
        this.setIconBgColor();
        this.applyPremiumCardLayout();
        // 设置图标
        this.setIcon();
        // 设置Avatar（仅新英雄显示）
        this.setAvatar();
        // 设置描述
        this.setDescription();
        // 绑定点击事件
        this.bindClickEvent();
    }

    private applyPremiumCardLayout(): void {
        const oldFrame = this.node.getChildByName('PremiumCardFrame');
        if (oldFrame) oldFrame.destroy();
        this._premiumIconSprite = null;
        this._premiumTitleLabel = null;
        this._premiumDescLabel = null;
        this._premiumHeroIntroLabel = null;
        const oldIntroBox = this.node.getChildByName('HeroIntroBox');
        if (oldIntroBox) oldIntroBox.destroy();

        if (this.bgNode) this.bgNode.active = false;
        if (this.avatarNode) this.avatarNode.active = false;
        if (this.mainNode) this.mainNode.active = false;
        const mainLayout = this.mainNode?.getComponent('cc.Layout') as any;
        if (mainLayout) mainLayout.enabled = false;
        const descWidget = this.descNode?.getComponent('cc.Widget') as any;
        if (descWidget) descWidget.enabled = false;
        const titleParent = this.titleNode?.parent;
        if (titleParent) titleParent.active = false;
        if (this.descNode) this.descNode.active = false;
        const titleBg = titleParent?.getChildByName('Btn');
        if (titleBg) titleBg.active = false;
        const duplicateTitleLabel = titleParent?.getComponent(Label);
        if (duplicateTitleLabel) duplicateTitleLabel.enabled = false;

        const frame = new Node('PremiumCardFrame');
        frame.setPosition(0, 0, 0);
        this.node.addChild(frame);
        frame.setSiblingIndex(0);
        frame.addComponent(UITransform).setContentSize(CARD_FRAME_WIDTH, CARD_FRAME_HEIGHT);
        const frameSprite = frame.addComponent(Sprite);
        frameSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadResSingleAsset(this.getBakedCardPath(), (asset) => {
            if (asset && frameSprite && frameSprite.isValid) {
                frameSprite.spriteFrame = asset;
                return;
            }

            loadResSingleAsset(CARD_FRAME_PATH, (fallback) => {
                if (fallback && frameSprite && frameSprite.isValid) {
                    frameSprite.spriteFrame = fallback;
                }
            });
        });

        const legacyIconRoot = this.iconNode?.parent?.parent;
        if (legacyIconRoot) legacyIconRoot.active = false;
        if (this.iconNode) this.iconNode.active = false;
        if (this.iconBgNode) this.iconBgNode.active = false;

        if (this._isNewHero) {
            this._premiumHeroIntroLabel = this.createHeroIntroBox();
        }
    }

    private applyPremiumCardLayoutLegacy(): void {
        const oldFrame = this.node.getChildByName('PremiumCardFrame');
        if (oldFrame) oldFrame.destroy();
        this._premiumIconSprite = null;
        this._premiumTitleLabel = null;
        this._premiumDescLabel = null;
        this._premiumHeroIntroLabel = null;
        const oldIntroBox = this.node.getChildByName('HeroIntroBox');
        if (oldIntroBox) oldIntroBox.destroy();

        if (this.bgNode) this.bgNode.active = false;
        if (this.avatarNode) this.avatarNode.active = false;
        if (this.mainNode) this.mainNode.active = false;
        const mainLayout = this.mainNode?.getComponent('cc.Layout') as any;
        if (mainLayout) mainLayout.enabled = false;
        const descWidget = this.descNode?.getComponent('cc.Widget') as any;
        if (descWidget) descWidget.enabled = false;
        const titleParent = this.titleNode?.parent;
        if (titleParent) titleParent.active = false;
        if (this.descNode) this.descNode.active = false;
        const titleBg = titleParent?.getChildByName('Btn');
        if (titleBg) titleBg.active = false;
        const duplicateTitleLabel = titleParent?.getComponent(Label);
        if (duplicateTitleLabel) duplicateTitleLabel.enabled = false;

        const frame = new Node('PremiumCardFrame');
        frame.setPosition(0, 0, 0);
        this.node.addChild(frame);
        frame.setSiblingIndex(0);
        frame.addComponent(UITransform).setContentSize(CARD_FRAME_WIDTH, CARD_FRAME_HEIGHT);
        const frameSprite = frame.addComponent(Sprite);
        frameSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadResSingleAsset(CARD_FRAME_PATH, (asset) => {
            if (asset && frameSprite && frameSprite.isValid) {
                frameSprite.spriteFrame = asset;
            }
        });

        const legacyIconRoot = this.iconNode?.parent?.parent;
        if (legacyIconRoot) legacyIconRoot.active = false;
        if (this.iconNode) this.iconNode.active = false;
        if (this.iconBgNode) this.iconBgNode.active = false;

        this._premiumTitleLabel = this.createPremiumLabel(
            frame,
            'PremiumTitle',
            184,
            46,
            0,
            CARD_TITLE_Y,
            this._isNewHero ? 30 : 29,
            37,
            this._isNewHero ? CARD_ROLE : CARD_TITLE,
            5,
        );

        const cleanIcon = new Node('PremiumIconImage');
        cleanIcon.setPosition(0, CARD_ICON_Y, 0);
        frame.addChild(cleanIcon);
        cleanIcon.setSiblingIndex(1);
        cleanIcon.addComponent(UITransform).setContentSize(CARD_ICON_SIZE, CARD_ICON_SIZE);
        this._premiumIconSprite = cleanIcon.addComponent(Sprite);
        this._premiumIconSprite.sizeMode = Sprite.SizeMode.CUSTOM;

        this._premiumDescLabel = this.createPremiumLabel(
            frame,
            'PremiumAction',
            164,
            40,
            0,
            CARD_ACTION_Y,
            24,
            30,
            CARD_ACTION,
            4,
        );

        this.setTitle();
        this.setDescription();
    }

    private styleLabel(node: Node | null, fontSize: number, lineHeight: number, color: Color, bold: boolean, outlineWidth: number): void {
        const label = node?.getComponent(Label);
        if (!label) return;
        this.styleLabelComponent(label, fontSize, lineHeight, color, bold, outlineWidth);
    }

    private createPremiumLabel(
        parent: Node,
        name: string,
        width: number,
        height: number,
        x: number,
        y: number,
        fontSize: number,
        lineHeight: number,
        color: Color,
        outlineWidth: number,
    ): Label {
        const node = new Node(name);
        node.setPosition(x, y, 0);
        parent.addChild(node);
        node.addComponent(UITransform).setContentSize(width, height);
        const label = node.addComponent(Label);
        this.styleLabelComponent(label, fontSize, lineHeight, color, true, outlineWidth);
        return label;
    }

    private createHeroIntroBox(): Label {
        const box = new Node('HeroIntroBox');
        box.setPosition(0, HERO_INTRO_BOX_Y, 0);
        this.node.addChild(box);
        box.addComponent(UITransform).setContentSize(HERO_INTRO_BOX_WIDTH, HERO_INTRO_BOX_HEIGHT);

        const graphics = box.addComponent(Graphics);
        graphics.clear();
        graphics.fillColor = new Color(8, 10, 34, 220);
        graphics.strokeColor = new Color(119, 226, 255, 210);
        graphics.lineWidth = 2;
        graphics.roundRect(
            -HERO_INTRO_BOX_WIDTH / 2,
            -HERO_INTRO_BOX_HEIGHT / 2,
            HERO_INTRO_BOX_WIDTH,
            HERO_INTRO_BOX_HEIGHT,
            10,
        );
        graphics.fill();
        graphics.stroke();

        const labelNode = new Node('HeroIntroLabel');
        labelNode.setPosition(0, 0, 0);
        box.addChild(labelNode);
        labelNode.addComponent(UITransform).setContentSize(HERO_INTRO_BOX_WIDTH - 20, HERO_INTRO_BOX_HEIGHT - 10);

        const label = labelNode.addComponent(Label);
        label.fontSize = 19;
        label.lineHeight = 24;
        label.fontFamily = 'PingFang SC, Microsoft YaHei, Arial';
        label.color = new Color(219, 248, 255, 255);
        label.isBold = true;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.RESIZE_HEIGHT;
        label.enableWrapText = true;
        label.enableOutline = true;
        label.outlineColor = new Color(24, 4, 77, 245);
        label.outlineWidth = 2;
        return label;
    }

    private formatHeroIntro(value: string | undefined): string {
        return (value || '守护防线的晶核英雄。').trim();
    }

    private styleLabelComponent(label: Label, fontSize: number, lineHeight: number, color: Color, bold: boolean, outlineWidth: number): void {
        label.fontSize = fontSize;
        label.lineHeight = lineHeight;
        label.fontFamily = 'PingFang SC, Microsoft YaHei, Arial';
        label.color = color;
        label.isBold = bold;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableOutline = true;
        label.outlineColor = new Color(36, 5, 92, 255);
        label.outlineWidth = outlineWidth;
        label.enableShadow = true;
        label.shadowColor = CARD_SHADOW;
        label.shadowOffset = new Vec2(0, -3);
        label.shadowBlur = 5;
    }

    /**
     * 设置背景颜色（根据稀有度自动调整）
     */
    private setBgColor() {
        if (!this.bgNode) return;
        // 获取 RoundedBackground 组件
        const roundedBg = this.bgNode.getComponent('RoundedBackground') as any;
        if (!roundedBg) return;

        // 稀有度字符串转枚举
        let rarityRaw = this._data.rarity;
        const hero = HDM.getHeroList().find(h => h.id === this._data.use_unit_id);
        if (hero && hero.rarity !== undefined) rarityRaw = hero.rarity;

        // 字符串转枚举（如'4_purple' => Rarity.Epic）
        let rarityEnum = 0; // 默认Common
        if (typeof rarityRaw === 'string') {
            if (rarityRaw.indexOf('common') !== -1) rarityEnum = 0;
            else if (rarityRaw.indexOf('rare') !== -1) rarityEnum = 1;
            else if (rarityRaw.indexOf('epic') !== -1) rarityEnum = 2;
            else if (rarityRaw.indexOf('legendary') !== -1) rarityEnum = 3;
            else if (rarityRaw.indexOf('sr') !== -1) rarityEnum = 4;
            else if (rarityRaw.indexOf('ssr') !== -1) rarityEnum = 5;
            else if (rarityRaw.indexOf('gem') !== -1) rarityEnum = 6;
            else if (rarityRaw.indexOf('color') !== -1) rarityEnum = 7;
            else if (rarityRaw.indexOf('red') !== -1) rarityEnum = 8;
            // 可扩展更多
        } else if (typeof rarityRaw === 'number') {
            rarityEnum = rarityRaw - 1;
        }

        // 设置稀有度并重绘
        if (typeof roundedBg.setRarity === 'function') {
            roundedBg.setRarity(rarityEnum);
        } else {
            roundedBg.rarity = rarityEnum;
            if (typeof roundedBg.drawBackground === 'function') {
                roundedBg.drawBackground();
            }
        }
    }

    /**
     * 设置头像背景颜色（根据稀有度自动调整）
     */
    private setAvatarBgColor() {
        if (!this.avatarBgNode) return;
        // 获取 RoundedBackground 组件
        const circleDrawer = this.avatarBgNode.getComponent('SimpleCircleDrawer') as any;
        if (!circleDrawer) {
            console.warn('[ItemCardController][setAvatarBgColor] AvatarBg节点没有SimpleCircleDrawer组件');
            return;
        }
        // 稀有度字符串转枚举
        let rarityRaw = this._data.rarity;
        const hero = HDM.getHeroList().find(h => h.id === this._data.use_unit_id);
        if (hero && hero.rarity !== undefined) rarityRaw = hero.rarity;
        // 设置颜色
        circleDrawer.setColorByRarity(rarityRaw);
    }
    /**
     * 设置图标背景颜色（根据稀有度自动调整）
     */
    private setIconBgColor() {
        if (!this.iconBgNode) return;
        // 获取 RoundedBackground 组件
        // 获取 SimpleCircleDrawer 组件
        let circleDrawer = this.iconBgNode.getComponent('SimpleCircleDrawer') as any;

        // 如果没有组件，动态添加一个
        if (!circleDrawer) {
            console.log('[ItemCardController][setIconBgColor] 动态添加 SimpleCircleDrawer 组件');

            // 动态添加 SimpleCircleDrawer 组件
            circleDrawer = this.iconBgNode.addComponent('SimpleCircleDrawer') as any;

            // 设置默认属性
            if (circleDrawer) {
                // 启用边框
                circleDrawer.drawBorder = true;
                circleDrawer.borderWidth = 2;

                // 设置半径，可以根据节点大小调整
                const transform = this.iconBgNode.getComponent(UITransform);
                if (transform) {
                    // 半径设置为节点宽高的一半（取较小值）
                    const minSize = Math.min(transform.width, transform.height);
                    circleDrawer.radius = Math.floor(minSize / 2);
                } else {
                    circleDrawer.radius = 30; // 默认半径
                }
            }
        }

        // 稀有度字符串转枚举
        let rarityRaw = this._data.rarity;
        const skillId = this._data.skill_id || this._data.id;
        const skillData = SDM.getSkillById(skillId);
        if (skillData && skillData.rarity !== undefined) {
            rarityRaw = skillData?.rarity;
            console.log('[ItemCardController][setIconBgColor] skillData', skillData, rarityRaw);
        } else {
            console.error('[ItemCardController][setIconBgColor] skillData', skillData, this._data);
        }
        // 设置颜色
        if (typeof circleDrawer.setColorByRarity === 'function') {
            circleDrawer.setColorByRarity(rarityRaw);
        } else {
            console.error('[ItemCardController][setIconBgColor] circleDrawer 没有 setColorByRarity 方法');
        }
    }

    /**
     * 设置标题
     */
    private setTitle() {
        if (!this.titleNode) return;

        const titleLabel = this.titleNode.getComponent(Label);
        if (!titleLabel) return;

        if (this._isNewHero) {
            const heroData = this.getHeroConfig();
            if (heroData) {
                const value = `${this.shortText(heroData.name || '守护者', 4)}`;
                titleLabel.string = value;
                if (this._premiumTitleLabel) this._premiumTitleLabel.string = value;
            } else {
                titleLabel.string = '守护者';
                if (this._premiumTitleLabel) this._premiumTitleLabel.string = '守护者';
            }
        } else {
            const skillCfg = this.getSkillConfig();
            const value = `${this.shortText(skillCfg?.name || this._data.name || '技能', 5)}`;
            titleLabel.string = value;
            if (this._premiumTitleLabel) this._premiumTitleLabel.string = value;
        }
    }

    /**
     * 设置图标
     */
    private setIcon() {
        if (!this.iconNode && !this._premiumIconSprite) return;
        const iconSprite = this._premiumIconSprite || this.iconNode.getComponent(Sprite);
        if (!iconSprite) return;

        if (this._isNewHero) {
            const hero = this.getHeroConfig();
            const url = hero?.url ?? this._data.avatar ?? 'default';
            this.loadIconWithFallback(
                iconSprite,
                `${CARD_ICON_PATH}hero_${url}/spriteFrame`,
                [
                    `${this._heroPath}${url}/icon/spriteFrame`,
                    `${this._heroPath}${url}/portrait/spriteFrame`,
                ],
            );
            return;
        }

        const skillCfg = this.getSkillConfig();
        const skillUrl = this._data.url || skillCfg?.url || 'arrow';
        this.loadIconWithFallback(
            iconSprite,
            `${CARD_ICON_PATH}skill_${skillUrl}/spriteFrame`,
            `${this._skillPath}${skillUrl}/icon/spriteFrame`,
        );
    }

    private loadIconWithFallback(iconSprite: Sprite, path: string, fallbackPath?: string | string[]): void {
        loadResSingleAsset(path, (data) => {
            if (data) {
                iconSprite.spriteFrame = data;
                return;
            }
            const fallbacks = Array.isArray(fallbackPath) ? fallbackPath : (fallbackPath ? [fallbackPath] : []);
            const loadNext = (index: number) => {
                const nextPath = fallbacks[index];
                if (!nextPath) return;
                loadResSingleAsset(nextPath, (fallback) => {
                    if (fallback) {
                        iconSprite.spriteFrame = fallback;
                        return;
                    }
                    loadNext(index + 1);
                });
            };
            loadNext(0);
        });
    }

    /**
     * 设置Avatar（仅新英雄显示）
     */
    private setAvatar() {
        if (!this.avatarNode) return;

        // 始终隐藏头像节点
        this.avatarNode.active = false;
        if (this.avatarBgNode) this.avatarBgNode.active = false;

        if (false && this.avatarImageNode) {
            // 设置Avatar图片
            const avatarSprite = this.avatarImageNode.getComponent(Sprite);
            let url = this._data.avatar ?? "default";
            // 优先使用unit_id获得英雄头像
            if (this._data.unit_id && typeof HDM !== 'undefined' && Array.isArray(HDM.getHeroList())) {
                const hero = HDM.getHeroList().find(h => h.id === this._data.use_unit_id);
                if (hero && hero.url) {
                    url = hero.url;
                }
            }
            let path = `${this._heroPath}${url}/portrait/spriteFrame`;
            loadResSingleAsset(path, (data) => {
                avatarSprite.spriteFrame = data;
            });
        }
    }

    /**
     * 设置描述
     */
    private setDescription() {
        if (!this.descNode) return;

        const descLabel = this.descNode.getComponent(Label);
        if (!descLabel) return;

        if (this._isNewHero) {
            const heroData = this.getHeroConfig();
            if (heroData) {
                descLabel.string = '角色入阵';
                if (this._premiumDescLabel) this._premiumDescLabel.string = '角色入阵';
                if (this._premiumHeroIntroLabel) {
                    this._premiumHeroIntroLabel.string = this.formatHeroIntro(heroData.desc);
                }
            } else {
                descLabel.string = '角色入阵';
                if (this._premiumDescLabel) this._premiumDescLabel.string = '角色入阵';
                if (this._premiumHeroIntroLabel) {
                    this._premiumHeroIntroLabel.string = this.formatHeroIntro(undefined);
                }
            }
        } else {
            const currentLevel = Number(this._data.level || 1);
            const nextLevel = Number(this._data.level || 1) + 1;
            const value = `Lv.${currentLevel}→${nextLevel}`;
            descLabel.string = value;
            if (this._premiumDescLabel) this._premiumDescLabel.string = value;
        }
    }

    /**
     * 绑定点击事件
     */
    private bindClickEvent() {
        // 移除旧的事件监听
        this.node.off(Node.EventType.TOUCH_END);

        // 添加新的事件监听
        this.node.on(Node.EventType.TOUCH_END, this.onCardClick, this);
    }

    /**
     * 卡牌点击事件
     */
    private onCardClick() {
        // 动画反馈
        this.playClickAnim(() => {
            // 发送卡牌选择事件
            this.node.emit('card-selected', this._data);
        });
    }

    /**
     * 点击动画反馈
     */
    private playClickAnim(callback?: () => void) {
        tween(this.node)
            .to(0.08, { scale: new Vec3(0.92, 0.92, 1) }, { easing: 'quadIn' })
            .to(0.12, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'quadOut' })
            .to(0.08, { scale: new Vec3(1, 1, 1) }, { easing: 'quadIn' })
            .call(() => {
                if (callback) callback();
            })
            .start();
    }

    /**
     * 组件销毁时清理事件
     */
    onDestroy() {
        this.node.off(Node.EventType.TOUCH_END, this.onCardClick, this);
    }
} 
