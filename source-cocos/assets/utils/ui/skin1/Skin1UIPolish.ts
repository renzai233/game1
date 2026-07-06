import { Button, Color, Graphics, Label, Node, ProgressBar, Sprite, SpriteFrame, Texture2D, UIOpacity, UITransform, Vec3, Widget } from 'cc';
import { EDM } from '../../data/env/ConfigManager';
import { loadResSingleAsset } from '../../utils';

const POLISH_NODE = 'Skin1UIPolish';
const HOME_NODE = 'Skin1HomeCommandPolish';
const NAV_NODE = 'Skin1NavDockPolish';
const PATROL_NODE = 'Skin1PatrolBadgePolish';
const FULL_BG_NODE = 'Skin1SceneBackdrop';
const HOME_LOGO_NODE = 'HomeCrystalLogo';
const HOME_LOGO_POSITION_Y = 430;
const HOME_LOGO_WIDTH = 430;
const HOME_LOGO_HEIGHT = 184;
const HOME_LEVEL_POSITION_Y = 0;
const HOME_START_POSITION_Y = -260;
const HOME_PATROL_POSITION_X = -235;
const HOME_PATROL_POSITION_Y = -405;
const HOME_START_BUTTON_WIDTH = 470;
const HOME_START_BUTTON_HEIGHT = 196;
const SPLASH_PROGRESS_WIDTH = 500;
const SPLASH_PROGRESS_BG_HEIGHT = 36;
const SPLASH_PROGRESS_BAR_HEIGHT = 24;

const ASSETS = {
    homeBg: 'textures/ui/skin1/polish/home_command_bg/spriteFrame',
    shopBg: 'textures/ui/skin1/polish/shop_supply_bg/spriteFrame',
    bagBg: 'textures/ui/skin1/polish/bag_vault_bg/spriteFrame',
    heroBg: 'textures/ui/skin1/polish/hero_array_bg/spriteFrame',
    panelFrame: 'textures/ui/skin1/polish/panel_crystal_frame/spriteFrame',
    cardFrame: 'textures/ui/skin1/polish/card_crystal_frame/spriteFrame',
    navDock: 'textures/ui/skin1/polish/nav_crystal_dock/spriteFrame',
    homeLogoTexture: 'textures/ui/skin1/polish/home_logo/texture',
    homeStartButtonTexture: 'textures/ui/skin1/polish/home_start_button/texture',
    splashProgressBg: 'textures/ui/progress/pb-bg/spriteFrame',
    splashProgressBar: 'textures/ui/progress/pb-loading/spriteFrame',
};

const FULL_PANEL_BACKDROPS: Record<string, string> = {
    ShopPanel: ASSETS.shopBg,
    BagPanel: ASSETS.bagBg,
    HeroPanel: ASSETS.heroBg,
    HeroDetailPanel: ASSETS.heroBg,
};

const PANEL_COPY: Record<string, { title: string; subtitle: string }> = {
    ShopPanel: { title: '补给中枢', subtitle: '晶币 · 棱钻 · 能量 · 守卫碎片' },
    BagPanel: { title: '晶核仓库', subtitle: '资源库存 / 碎片合成 / 战备清点' },
    HeroPanel: { title: '守卫阵列', subtitle: '筛选属性 · 配置防线 · 升级核心战力' },
    SettingsPanel: { title: '系统校准', subtitle: '音频 / 反馈 / 作战偏好' },
    PatrolPanel: { title: '离线巡逻', subtitle: '晶核基地持续回收战利品' },
    DailyTask: { title: '每日补给', subtitle: '每日领取晶核防线补给序列' },
    SignInTask: { title: '七日签到', subtitle: '连续登录激活晶体奖励' },
    SharingPanel: { title: '分享福利', subtitle: '邀请作战同伴领取补给' },
    ShortcutPanel: { title: '添加桌面', subtitle: '建立快捷入口领取基地奖励' },
    DyPopup: { title: '入口有奖', subtitle: '从侧边栏返回即可领取晶币' },
    RewardReceivedPanel: { title: '奖励入库', subtitle: '资源已同步至晶核仓库' },
    DialogPopup: { title: '指令确认', subtitle: '确认后将执行当前操作' },
    LotteryPanel: { title: '星核抽取', subtitle: '守卫碎片 / 稀有资源 / 阵列补强' },
    RewardPanel: { title: '抽取结果', subtitle: '奖励已完成扫描，确认后入库' },
    VictoryPanel: { title: '防线已稳固', subtitle: '本层晶核回收完成，奖励同步中' },
    LosePanel: { title: '防线受损', subtitle: '保留已回收资源，整备后再次出击' },
    ExitPanel: { title: '撤离确认', subtitle: '退出前将同步本次战斗回收数据' },
    HeroInfo: { title: '守卫档案', subtitle: '属性 / 技能 / 作战记录' },
};

function viewWidth(): number {
    return EDM.config?.viewWidth || 750;
}

function viewHeight(): number {
    return EDM.config?.viewHeight || 1334;
}

function ensureNode(parent: Node, name: string, width: number, height: number, position = new Vec3()): Node {
    let node = parent.getChildByName(name);
    if (!node) {
        node = new Node(name);
        parent.addChild(node);
    }

    const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
    transform.setContentSize(width, height);
    node.setPosition(position);
    return node;
}

function addSprite(parent: Node, name: string, path: string, width: number, height: number, position = new Vec3(), opacity = 255): Node {
    const node = ensureNode(parent, name, width, height, position);
    const sprite = node.getComponent(Sprite) || node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;

    const alpha = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
    alpha.opacity = opacity;

    loadResSingleAsset(path, (asset) => {
        if (!node || !node.isValid || !asset) return;
        sprite.spriteFrame = asset as SpriteFrame;
    });

    return node;
}

function textureToSpriteFrame(texture: Texture2D | null): SpriteFrame | null {
    if (!texture) return null;
    const spriteFrame = new SpriteFrame();
    spriteFrame.texture = texture;
    return spriteFrame;
}

function loadTextureSpriteFrame(path: string, callback: (asset: SpriteFrame | null) => void): void {
    loadResSingleAsset(path, (asset) => {
        callback(textureToSpriteFrame(asset as Texture2D | null));
    }, Texture2D);
}

function hideHomeLevelCaptions(canvas: Node): void {
    const level = canvas.getChildByName('Level');
    if (!level) return;

    const walk = (node: Node): void => {
        const label = node.getComponent(Label);
        const isLegacyCaption =
            node.name === 'Title' ||
            node.name === 'Name' ||
            (!!label && /关卡|level/i.test(label.string));

        if (isLegacyCaption) {
            node.active = false;
            if (label) label.string = '';
            return;
        }

        node.children.forEach(child => walk(child));
    };

    walk(level);
}

function addPanel(parent: Node, name: string, width: number, height: number, position = new Vec3(), radius = 24): Node {
    const node = ensureNode(parent, name, width, height, position);
    const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = new Color(8, 12, 34, 184);
    graphics.strokeColor = new Color(39, 224, 255, 210);
    graphics.lineWidth = 3;
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.fill();
    graphics.stroke();
    graphics.strokeColor = new Color(187, 74, 255, 150);
    graphics.lineWidth = 1.5;
    graphics.roundRect(-width / 2 + 10, -height / 2 + 10, width - 20, height - 20, Math.max(6, radius - 10));
    graphics.stroke();
    return node;
}

function addLabel(parent: Node, name: string, text: string, width: number, height: number, x: number, y: number, fontSize: number, color = new Color(235, 250, 255, 255), bold = false): Label {
    const node = ensureNode(parent, name, width, height, new Vec3(x, y, 0));
    const label = node.getComponent(Label) || node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.2);
    label.isBold = bold;
    label.color = color;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    label.enableOutline = true;
    label.outlineColor = new Color(0, 0, 0, 210);
    label.outlineWidth = bold ? 3 : 2;
    return label;
}

function addPremiumTitle(parent: Node, text: string, x: number, y: number, fontSize: number): void {
    // ✧ 霓虹发光阴影层 ✧
    const shadowColor = new Color(187, 74, 255, 220); // 霓虹紫
    const shadowLabel = addLabel(parent, 'TitleGlowShadow', `✧  ${text}  ✧`, 520, 44, x, y - 2, fontSize, shadowColor, true);
    shadowLabel.outlineColor = new Color(187, 74, 255, 255);
    shadowLabel.outlineWidth = 5;

    // ✦ 主文本层 ✦
    const mainLabel = addLabel(parent, 'TitleMain', `✦  ${text}  ✦`, 520, 44, x, y, fontSize, new Color(246, 252, 255, 255), true);
    mainLabel.outlineColor = new Color(0, 26, 77, 255); // 深邃蓝底线
    mainLabel.outlineWidth = 3;
}

function findPrimaryContent(node: Node): Node {
    const preferredNames = ['ContentBg', 'Content', 'Background', 'Panel', 'Window'];
    for (const name of preferredNames) {
        const found = node.getChildByName(name);
        if (found) return found;
    }

    const candidates = node.children
        .filter(child => child.name !== 'UIMask' && child.name !== POLISH_NODE)
        .map(child => ({ child, transform: child.getComponent(UITransform) }))
        .filter(item => !!item.transform)
        .sort((a, b) => {
            const areaA = a.transform!.contentSize.width * a.transform!.contentSize.height;
            const areaB = b.transform!.contentSize.width * b.transform!.contentSize.height;
            return areaB - areaA;
        });

    return candidates[0]?.child || node;
}

function softenLegacyBackgrounds(content: Node): void {
    const names = ['Background', 'ContentBg', 'Bg'];
    names.forEach(name => {
        const child = content.getChildByName(name);
        if (!child) return;
        const opacity = child.getComponent(UIOpacity) || child.addComponent(UIOpacity);
        opacity.opacity = Math.min(opacity.opacity, 86);
    });
}

function hideLegacyRewardReceivedChrome(node: Node, content: Node): void {
    if (node.name !== 'RewardReceivedPanel') return;
    setNodeOpacity(content.getChildByName('Dcr'), 0);
    setNodeOpacity(content.getChildByName('Title'), 0);
}

function setNodeOpacity(node: Node | null, opacity: number): void {
    if (!node) return;
    const uiOpacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
    uiOpacity.opacity = opacity;
}

function softenFullPanelChrome(node: Node): void {
    setNodeOpacity(node.getChildByName('Background'), 0);
    setNodeOpacity(node.getChildByName('TitleBar'), 0);
    const mask = node.getChildByName('UIMask');
    if (mask) mask.active = false;

    const titleBar = node.getChildByName('TitleBar');
    if (titleBar) {
        titleBar.children.forEach(child => setNodeOpacity(child, 0));
    }
}

function applySceneBackdrop(node: Node): void {
    const widget = node.getComponent(Widget);
    if (widget) widget.enabled = false;

    const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
    transform.setContentSize(viewWidth(), viewHeight());
    node.setPosition(0, 0, 0);
    node.setScale(1, 1, 1);

    const path = FULL_PANEL_BACKDROPS[node.name] || ASSETS.homeBg;
    const layer = ensureNode(node, FULL_BG_NODE, viewWidth(), viewHeight());
    layer.setSiblingIndex(0);
    addSprite(layer, 'SceneImage', path, viewWidth(), viewHeight(), new Vec3(0, 0, 0), 252);

    const well = addPanel(layer, 'SceneContentWell', 650, 980, new Vec3(0, 30, 0), 34);
    well.active = false;
    setNodeOpacity(well, 132);

    const floor = addPanel(layer, 'SceneNavShelf', viewWidth() + 24, 210, new Vec3(0, -542, 0), 24);
    setNodeOpacity(floor, 126);

    const headerShade = addPanel(layer, 'SceneHeaderShade', viewWidth() + 24, 170, new Vec3(0, 530, 0), 20);
    setNodeOpacity(headerShade, 92);
}

function pinLegacyFullPanelControls(node: Node): void {
    const hud = node.getChildByName('HUD');
    if (hud) {
        const widget = hud.getComponent(Widget);
        if (widget) widget.enabled = false;
        if (node.name === 'ShopPanel') {
            hud.active = true;
            hud.setPosition(0, 494, 0);
            hud.setScale(0.78, 0.78, 1);
            setNodeOpacity(hud, 245);
        } else {
            hud.setPosition(0, 468, 0);
            hud.setScale(0.76, 0.76, 1);
            setNodeOpacity(hud, 218);
        }
    }

    if (node.name === 'BagPanel') {
        const content = node.getChildByName('Content');
        if (content) {
            const widget = content.getComponent(Widget);
            if (widget) widget.enabled = false;
            content.setPosition(0, -28, 0);
            content.setScale(1, 1, 1);
            setNodeOpacity(content, 255);
        }
    }

    if (node.name === 'HeroPanel') {
        const tabContainer = node.getChildByName('TabContainer');
        if (tabContainer) {
            const widget = tabContainer.getComponent(Widget);
            if (widget) widget.enabled = false;
            tabContainer.setPosition(0, 470, 0);
            tabContainer.setScale(0.72, 0.72, 1);
            setNodeOpacity(tabContainer, 236);
        }
    }
}

function hideLegacyTitles(root: Node, protectedNames: string[] = [], depth = 0): void {
    root.children.forEach((child) => {
        if (!child || child.name.startsWith('Skin1') || protectedNames.includes(child.name)) return;

        const isTitleNode = /^(Title|title|TitleNode|TitleLabel|HeaderTitle)$/.test(child.name);
        if (isTitleNode && depth <= 2) {
            setNodeOpacity(child, 0);
            return;
        }

        if (child.children.length > 0 && depth < 2) hideLegacyTitles(child, protectedNames, depth + 1);
    });
}

function enhanceLabels(root: Node): void {
    root.getComponentsInChildren(Label).forEach((label) => {
        if (!label || !label.node || label.node.name.startsWith('Skin1')) return;
        label.enableOutline = true;
        label.outlineColor = new Color(0, 0, 0, 205);
        label.outlineWidth = Math.max(label.outlineWidth || 0, label.fontSize >= 28 ? 3 : 2);
        label.overflow = Label.Overflow.SHRINK;
    });
}

function addCommandChip(parent: Node, name: string, text: string, x: number, y: number, width = 300): void {
    const chip = addPanel(parent, name, width, 48, new Vec3(x, y, 0), 18);
    const opacity = chip.getComponent(UIOpacity) || chip.addComponent(UIOpacity);
    opacity.opacity = 224;
    addLabel(chip, `${name}Text`, text, width - 28, 34, 0, 0, 19, new Color(178, 235, 255, 248), true);
}

export class Skin1UIPolish {
    public static applySplash(canvas: Node): void {
        if (!canvas || !canvas.isValid) return;

        const canvasTransform = canvas.getComponent(UITransform) || canvas.addComponent(UITransform);
        canvasTransform.setContentSize(viewWidth(), viewHeight());

        this.applySplashBackground(canvas);
        this.applySplashTitle(canvas);
        this.applySplashProgress(canvas);
    }

    private static applySplashBackground(canvas: Node): void {
        const bg = canvas.getChildByName('Bg');
        if (!bg) return;

        bg.active = true;
        bg.setSiblingIndex(0);
        bg.setPosition(0, 0, 0);

        const bgTransform = bg.getComponent(UITransform) || bg.addComponent(UITransform);
        bgTransform.setContentSize(viewWidth(), viewHeight());

        const bgWidget = bg.getComponent(Widget);
        if (bgWidget) {
            bgWidget.enabled = true;
            bgWidget.isAlignLeft = true;
            bgWidget.isAlignRight = true;
            bgWidget.isAlignTop = true;
            bgWidget.isAlignBottom = true;
            bgWidget.left = 0;
            bgWidget.right = 0;
            bgWidget.top = 0;
            bgWidget.bottom = 0;
        }

        const bgSprite = bg.getComponent(Sprite);
        if (bgSprite) {
            bgSprite.type = Sprite.Type.SIMPLE;
            bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            bgSprite.color = new Color(255, 255, 255, 255);
        }

        const opacity = bg.getComponent(UIOpacity) || bg.addComponent(UIOpacity);
        opacity.opacity = 255;

        bg.children.forEach((child) => {
            if (/^Cloud/.test(child.name) || child.name === 'House') {
                child.active = false;
            }
        });
    }

    private static applySplashTitle(canvas: Node): void {
        const title = canvas.getChildByName('Title');
        if (!title) return;

        title.active = true;
        title.setPosition(0, 380, 0);

        const titleTransform = title.getComponent(UITransform) || title.addComponent(UITransform);
        titleTransform.setContentSize(620, 210);

        const titleWidget = title.getComponent(Widget);
        if (titleWidget) titleWidget.enabled = false;

        const titleLabel = title.getComponent(Label);
        if (titleLabel) {
            titleLabel.string = '';
            titleLabel.enabled = false;
        }
    }

    private static applySplashProgress(canvas: Node): void {
        const progressNode = canvas.getChildByName('ProgressBar');
        if (!progressNode) return;

        progressNode.active = true;
        progressNode.setPosition(0, -570, 0);
        progressNode.setSiblingIndex(canvas.children.length - 1);

        const widget = progressNode.getComponent(Widget);
        if (widget) widget.enabled = false;

        const transform = progressNode.getComponent(UITransform) || progressNode.addComponent(UITransform);
        transform.setContentSize(SPLASH_PROGRESS_WIDTH, SPLASH_PROGRESS_BG_HEIGHT);

        const bgSprite = progressNode.getComponent(Sprite) || progressNode.addComponent(Sprite);
        bgSprite.type = Sprite.Type.SLICED;
        bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        bgSprite.color = new Color(255, 255, 255, 255);
        loadResSingleAsset(ASSETS.splashProgressBg, (asset) => {
            if (progressNode.isValid && bgSprite.isValid && asset) bgSprite.spriteFrame = asset as SpriteFrame;
        });

        const progressBar = progressNode.getComponent(ProgressBar);
        if (progressBar) progressBar.totalLength = SPLASH_PROGRESS_WIDTH - 22;

        const bar = progressNode.getChildByName('Bar');
        if (bar) {
            bar.active = true;
            bar.setPosition(-((SPLASH_PROGRESS_WIDTH - 22) / 2), 0, 0);
            const barTransform = bar.getComponent(UITransform) || bar.addComponent(UITransform);
            barTransform.setContentSize(0, SPLASH_PROGRESS_BAR_HEIGHT);

            const barSprite = bar.getComponent(Sprite) || bar.addComponent(Sprite);
            barSprite.type = Sprite.Type.SLICED;
            barSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            barSprite.color = new Color(255, 255, 255, 255);
            loadResSingleAsset(ASSETS.splashProgressBar, (asset) => {
                if (bar.isValid && barSprite.isValid && asset) barSprite.spriteFrame = asset as SpriteFrame;
            });
        }

        const label = progressNode.getChildByName('Label');
        if (label) {
            label.setPosition(0, -38, 0);
            const labelText = label.getComponent(Label);
            if (labelText) {
                labelText.fontSize = 24;
                labelText.lineHeight = 28;
                labelText.color = new Color(220, 246, 255, 255);
            }
        }
    }

    public static applyHome(canvas: Node): void {
        if (!canvas || !canvas.isValid) return;
        this.applyHomeBackground(canvas);
        hideHomeLevelCaptions(canvas);
        this.applyHomeLogo(canvas);
        this.applyHomeSelectionLayout(canvas);
        this.applyStartButton(canvas);
        this.applyPatrolBadge(canvas);
        const overlay = canvas.getChildByName(HOME_NODE);
        if (overlay) overlay.active = false;
    }

    private static applyHomeBackground(canvas: Node): void {
        const bg = canvas.getChildByName('Bg');
        if (!bg) return;

        bg.active = true;
        bg.setSiblingIndex(1);
        bg.setPosition(0, 0, 0);

        const bgTransform = bg.getComponent(UITransform) || bg.addComponent(UITransform);
        bgTransform.setContentSize(viewWidth(), viewHeight());

        const bgWidget = bg.getComponent(Widget);
        if (bgWidget) bgWidget.enabled = false;

        const bgSprite = bg.getComponent(Sprite) || bg.addComponent(Sprite);
        bgSprite.type = Sprite.Type.SIMPLE;
        bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        bgSprite.color = new Color(255, 255, 255, 255);

        const opacity = bg.getComponent(UIOpacity) || bg.addComponent(UIOpacity);
        opacity.opacity = 255;

        loadResSingleAsset(ASSETS.homeBg, (asset) => {
            if (bg.isValid && bgSprite.isValid && asset) bgSprite.spriteFrame = asset as SpriteFrame;
        });

        const house = bg.getChildByName('House');
        if (house) house.active = false;
    }

    private static applyHomeLogo(canvas: Node): void {
        const title = canvas.getChildByName('Title');
        if (!title) return;

        const titleWidget = title.getComponent(Widget);
        if (titleWidget) titleWidget.enabled = false;
        title.active = true;
        title.setPosition(0, HOME_LOGO_POSITION_Y, 0);

        const titleTransform = title.getComponent(UITransform) || title.addComponent(UITransform);
        titleTransform.setContentSize(HOME_LOGO_WIDTH, HOME_LOGO_HEIGHT);

        title.children.forEach((child) => {
            if (child.name === HOME_LOGO_NODE) return;
            const label = child.getComponent(Label);
            if (label) label.string = '';
            child.active = false;
        });

        const logo = ensureNode(title, HOME_LOGO_NODE, HOME_LOGO_WIDTH, HOME_LOGO_HEIGHT);
        logo.active = true;
        logo.setPosition(0, 0, 0);
        logo.setSiblingIndex(Math.max(0, title.children.length - 1));

        const sprite = logo.getComponent(Sprite) || logo.addComponent(Sprite);
        sprite.type = Sprite.Type.SIMPLE;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.color = new Color(255, 255, 255, 255);

        const opacity = logo.getComponent(UIOpacity) || logo.addComponent(UIOpacity);
        opacity.opacity = 255;

        loadTextureSpriteFrame(ASSETS.homeLogoTexture, (asset) => {
            if (logo.isValid && sprite.isValid && asset) sprite.spriteFrame = asset;
        });
    }

    private static applyHomeSelectionLayout(canvas: Node): void {
        const level = canvas.getChildByName('Level');
        if (level) {
            const levelWidget = level.getComponent(Widget);
            if (levelWidget) levelWidget.enabled = false;
            level.setPosition(0, HOME_LEVEL_POSITION_Y, 0);
        }

        const start = canvas.getChildByName('Start');
        if (start) {
            const startWidget = start.getComponent(Widget);
            if (startWidget) startWidget.enabled = false;
            start.setPosition(0, HOME_START_POSITION_Y, 0);
        }

        const patrol = canvas.getChildByName('Patrol');
        if (patrol) {
            const patrolWidget = patrol.getComponent(Widget);
            if (patrolWidget) patrolWidget.enabled = false;
            patrol.setPosition(HOME_PATROL_POSITION_X, HOME_PATROL_POSITION_Y, 0);
        }
    }

    public static applyStartButton(canvas: Node): void {
        const start = canvas.getChildByName('Start');
        if (!start) return;

        const startTransform = start.getComponent(UITransform);
        if (startTransform) startTransform.setContentSize(HOME_START_BUTTON_WIDTH, HOME_START_BUTTON_HEIGHT);

        const startButton = start.getComponent(Button);
        if (startButton) {
            startButton.transition = Button.Transition.SCALE;
            startButton.zoomScale = 1.06;
            startButton.target = start;
        }

        const bg = start.getChildByName('Bg');
        const bgTransform = bg?.getComponent(UITransform);
        const bgSprite = bg?.getComponent(Sprite);
        if (bg && bgTransform && bgSprite) {
            bg.active = true;
            bgTransform.setContentSize(HOME_START_BUTTON_WIDTH, HOME_START_BUTTON_HEIGHT);
            bg.setPosition(0, 0, 0);
            bgSprite.color = new Color(255, 255, 255, 255);
            bgSprite.type = Sprite.Type.SIMPLE;
            bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            const bgOpacity = bg.getComponent(UIOpacity) || bg.addComponent(UIOpacity);
            bgOpacity.opacity = 255;
            loadTextureSpriteFrame(ASSETS.homeStartButtonTexture, (asset) => {
                if (bg.isValid && bgSprite.isValid && asset) bgSprite.spriteFrame = asset;
            });
        }

        const labelNode = start.getChildByName('Label');
        const label = labelNode?.getComponent(Label);
        const labelTransform = labelNode?.getComponent(UITransform);
        if (labelNode && label && labelTransform) {
            label.string = '';
            labelNode.active = false;
        }
    }

    public static applyPatrolBadge(canvas: Node): void {
        const patrol = canvas.getChildByName('Patrol');
        if (!patrol) return;

        const badge = patrol.getChildByName(PATROL_NODE);
        if (badge) {
            badge.active = false;
            badge.removeFromParent();
            badge.destroy();
        }

        const oldTitle = patrol.getChildByName('Skin1PatrolTitle');
        if (oldTitle) oldTitle.active = false;
        const oldSub = patrol.getChildByName('Skin1PatrolSub');
        if (oldSub) oldSub.active = false;

        const title = patrol.getChildByName('Title');
        if (title) {
            title.active = true;
            title.setPosition(0, -58, 0);
            const titleBg = title.getChildByName('Bg');
            if (titleBg) titleBg.active = false;

            const titleLabelNode = title.getChildByName('Label');
            const titleLabel = titleLabelNode?.getComponent(Label);
            const titleTransform = titleLabelNode?.getComponent(UITransform);
            if (titleLabelNode && titleLabel && titleTransform) {
                titleLabelNode.setPosition(0, 0, 0);
                titleTransform.setContentSize(108, 34);
                titleLabel.string = '巡逻';
                titleLabel.fontSize = 24;
                titleLabel.lineHeight = 30;
                titleLabel.isBold = true;
                titleLabel.color = new Color(255, 236, 150, 255);
                titleLabel.enableOutline = true;
                titleLabel.outlineColor = new Color(24, 12, 42, 235);
                titleLabel.outlineWidth = 3;
                titleLabel.overflow = Label.Overflow.SHRINK;
            }
        }
    }

    public static applyNavigation(navigationBar: Node): void {
        if (!navigationBar || !navigationBar.isValid || navigationBar.getChildByName(NAV_NODE)) return;

        const legacyBg = navigationBar.getChildByName('Background');
        if (legacyBg) legacyBg.active = false;

        const dock = addSprite(navigationBar, NAV_NODE, ASSETS.navDock, viewWidth() + 56, 214, new Vec3(0, -6, 0), 255);
        dock.setSiblingIndex(0);
    }

    public static applyPanel(node: Node): void {
        if (!node || !node.isValid) return;
        if (node.name.includes('SkillPanel')) return;

        const isFullPanel = ['ShopPanel', 'BagPanel', 'HeroPanel', 'HeroDetailPanel'].includes(node.name);
        if (isFullPanel) {
            this.applyFullPanel(node);
            enhanceLabels(node);
            return;
        }

        if (node.getChildByName(POLISH_NODE)) {
            enhanceLabels(node);
            return;
        }

        if (!isFullPanel && findPrimaryContent(node).getChildByName(POLISH_NODE)) {
            enhanceLabels(node);
            return;
        }

        this.applyPopupPanel(node);
        enhanceLabels(node);
    }

    public static applyFullPanel(node: Node): void {
        softenFullPanelChrome(node);
        applySceneBackdrop(node);
        pinLegacyFullPanelControls(node);

        const layer = ensureNode(node, POLISH_NODE, viewWidth(), viewHeight());
        layer.setSiblingIndex(1);

        const copy = PANEL_COPY[node.name];
        if (copy) {
            addPanel(layer, 'FullHeaderGlass', 610, 86, new Vec3(0, 545, 0), 26);
            addPremiumTitle(layer, copy.title, 0, 560, 32);
            addLabel(layer, 'FullSubtitle', copy.subtitle, 520, 28, 0, 524, 17, new Color(158, 223, 246, 236));
        }

        const navGuard = addPanel(layer, 'FullNavGuard', viewWidth() + 12, node.name === 'ShopPanel' ? 118 : 150, new Vec3(0, node.name === 'ShopPanel' ? -604 : -585, 0), 20);
        setNodeOpacity(navGuard, node.name === 'ShopPanel' ? 82 : 112);

        const legacyHeroEmpty = layer.getChildByName('HeroEmptyCommand');
        if (legacyHeroEmpty) legacyHeroEmpty.active = false;
        ['HeroEmptyTitle', 'HeroEmptySub', 'HeroEmptyHint'].forEach((name) => {
            const child = layer.getChildByName(name);
            if (child) child.active = false;
        });
    }

    public static applyPopupPanel(node: Node): void {
        const content = findPrimaryContent(node);
        const transform = content.getComponent(UITransform);
        const width = Math.max(transform?.contentSize.width || 580, 520);
        const height = Math.max(transform?.contentSize.height || 640, 420);

        softenLegacyBackgrounds(content);
        hideLegacyRewardReceivedChrome(node, content);
        hideLegacyTitles(node, [POLISH_NODE]);

        const layer = ensureNode(content, POLISH_NODE, width + 34, height + 34);
        layer.setSiblingIndex(Math.min(1, content.children.length - 1));

        addSprite(layer, 'PopupFrameImage', ASSETS.panelFrame, width + 42, height + 42, new Vec3(0, 0, 0), 210);
        addPanel(layer, 'PopupGlass', width - 30, height - 42, new Vec3(0, -8, 0), 28);

        const copy = PANEL_COPY[node.name] || PANEL_COPY[content.name];
        const isPatrolPanel = node.name === 'PatrolPanel' || content.name === 'PatrolPanel';
        if (copy) {
            addPremiumTitle(layer, copy.title, 0, height / 2 - 58, isPatrolPanel ? 32 : 28);
            addLabel(layer, 'PopupKicker', copy.subtitle, width - 80, isPatrolPanel ? 36 : 30, 0, height / 2 - 98, isPatrolPanel ? 20 : 16, new Color(157, 225, 246, 235));
        }

        this.decorateRewardCards(content);
    }

    public static refreshDynamicContent(root: Node): void {
        if (!root || !root.isValid) return;
        this.decorateRewardCards(root);
        enhanceLabels(root);
    }

    private static decorateRewardCards(content: Node, depth = 0): void {
        content.children.forEach((child) => {
            if (!child || child.name.startsWith('Skin1')) return;
            const transform = child.getComponent(UITransform);
            if (!transform) {
                if (depth < 3) this.decorateRewardCards(child, depth + 1);
                return;
            }

            const width = transform.contentSize.width;
            const height = transform.contentSize.height;
            const looksLikeCard = /Item|Gift|Good|Rwd|Reward|Tab/.test(child.name) && width >= 60 && height >= 36 && width <= 260 && height <= 260;
            if (looksLikeCard && !child.getChildByName('Skin1CardGlow')) {
                const glow = addSprite(child, 'Skin1CardGlow', ASSETS.cardFrame, width + 20, height + 20, new Vec3(0, 0, 0), 105);
                glow.setSiblingIndex(0);
            }

            if (depth < 3) this.decorateRewardCards(child, depth + 1);
        });
    }
}
