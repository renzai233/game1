import { _decorator, Component, Label, Button, Node, Color, Vec2 } from 'cc';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';
import { PDM } from '../../utils/data/config/player/PlayerDataManager';
import { languageDataManager } from '../../utils/data/language/LanguageDataManager';

const { ccclass, property } = _decorator;

/**
 * Home界面本地化管理器
 * 负责管理Home场景中所有需要本地化的UI元素
 */
@ccclass('HomeLocalizationManager')
export class HomeLocalizationManager extends Component {
    // 游戏标题
    @property(Label)
    gameTitleLabel: Label | null = null;

    // 关卡标题
    @property(Label)
    levelTitleLabel: Label | null = null;

    // 关卡名称
    @property(Label)
    levelNameLabel: Label | null = null;

    // 菜单按钮
    @property(Label)
    heroMenuLabel: Label | null = null;

    @property(Label)
    talentMenuLabel: Label | null = null;

    @property(Label)
    settingsMenuLabel: Label | null = null;

    @property(Label)
    monsterMapMenuLabel: Label | null = null;

    @property(Label)
    heroMapMenuLabel: Label | null = null;

    @property(Label)
    heroBackpackMenuLabel: Label | null = null;

    @property([Label])
    extraLabels: Label[] = [];
    @property([Button])
    extraButtons: Button[] = [];
    @property([Node])
    extraNodes: Node[] = [];

    private _lastLanguage: string = '';
    private _lastLevelIndex: number = -1;
    private _initialized: boolean = false;

    private static readonly LOCALIZATION_KEY_MAP: { [key: string]: string } = {
        'Setting': 'home.menu.settings',
        'Talent': 'home.menu.talent',
        'Hero': 'home.menu.hero',
        'MonsterBtn': 'home.menu.monster_map',
        'HeroBtn': 'home.menu.hero_map',
        'HeroBag': 'home.menu.hero_backpack',
        'Benefit': 'home.menu.daily_welfare',
        'Codex': 'home.menu.monster_codex',
        'Title': 'game.title',
        'Start': 'game.start',
        'Level': 'level.title',
        'Name': 'level.name',
        'Label': 'common.label',
        'Button': 'common.button',
        'home_menu_settings': 'home.menu.settings',
        'home_menu_talent': 'home.menu.talent',
        'home_menu_hero': 'home.menu.hero',
        'home_menu_monster_map': 'home.menu.monster_map',
        'home_menu_hero_map': 'home.menu.hero_map',
        'home_menu_hero_backpack': 'home.menu.hero_backpack',
        'home_menu_daily_welfare': 'home.menu.daily_welfare',
        'home_menu_monster_codex': 'home.menu.monster_codex',
        'game_title': 'game.title',
        'game_start': 'game.start',
        'level_title': 'level.title',
        'level_name': 'level.name',
        'home menu settings': 'home.menu.settings',
        'home menu talent': 'home.menu.talent',
        'home menu hero': 'home.menu.hero',
        'home menu monster_map': 'home.menu.monster_map',
        'home menu hero_map': 'home.menu.hero_map',
        'home menu hero_backpack': 'home.menu.hero_backpack',
        'home menu daily_welfare': 'home.menu.daily_welfare',
        'home menu monster_codex': 'home.menu.monster_codex',
        'game title': 'game.title',
        'game start': 'game.start',
        'level title': 'level.title',
        'level name': 'level.name',
        'start game': 'game.start',
        'settings': 'home.menu.settings',
        'talent': 'home.menu.talent',
        'hero': 'home.menu.hero',
        'monster map': 'home.menu.monster_map',
        'hero map': 'home.menu.hero_map',
        'hero backpack': 'home.menu.hero_backpack',
        'daily welfare': 'home.menu.daily_welfare',
        'monster codex': 'home.menu.monster_codex',
    };

    /**
     * 更新所有文本
     */
    public updateAllTexts(): void {
        if (this._initialized && this._lastLanguage === EDM.currentLanguage) {
            return;
        }

        if (EDM.isDev()) console.log('🔄 更新Home界面所有本地化文本...');

        if (this.gameTitleLabel) {
            this.gameTitleLabel.string = EDM.getText('game.title');
            this.applyTextStyle(this.gameTitleLabel, 48, true);
        }

        this.hideLevelInfoLabels();

        // 更新菜单按钮
        this.updateMenuLabels();

        // 更新额外Label - 添加节点名称到key的映射
        this.extraLabels.forEach(label => {
            if (label && label.node && label.node.name) {
                const localizedKey = this.getLocalizationKeyFromNodeName(label.node.name);
                if (localizedKey) {
                    label.string = EDM.getText(localizedKey);
                    this.applyTextStyle(label, 24, true);
                }
            }
        });

        this.extraButtons.forEach(button => {
            if (button) {
                const buttonLabel = button.getComponentInChildren(Label);
                if (buttonLabel && buttonLabel.node && buttonLabel.node.name) {
                    const localizedKey = this.getLocalizationKeyFromNodeName(buttonLabel.node.name);
                    if (localizedKey) {
                        buttonLabel.string = EDM.getText(localizedKey);
                        this.applyTextStyle(buttonLabel, 24, true);
                    }
                }
            }
        });

        this._lastLanguage = EDM.currentLanguage;
        this._initialized = true;

        if (EDM.isDev()) console.log('✅ Home界面本地化文本更新完成');
    }

    /**
     * 应用文字样式（边框、大小、颜色等）
     */
    private applyTextStyle(label: Label, fontSize: number, addBorder: boolean = true): void {
        if (!label) return;

        // 设置字体大小
        label.fontSize = fontSize;

        // 设置行高
        label.lineHeight = fontSize + 4;

        // 设置文字颜色（白色）
        label.color = new Color(255, 255, 255, 255);

        if (addBorder) {
            // 添加文字边框效果
            // 注意：Cocos Creator 3.x中，Label的outline属性已被移除
            // 我们通过设置阴影来实现边框效果
            label.enableShadow = true;
            label.shadowColor = new Color(0, 0, 0, 255);
            label.shadowOffset = new Vec2(1, 1);
            label.shadowBlur = 2;
        }

        // 设置文字对齐方式
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
    }

    /**
     * 根据节点名称获取本地化key
     * 处理节点名称与本地化key的映射关系
     */
    private getLocalizationKeyFromNodeName(nodeName: string): string | null {
        // 直接匹配
        if (HomeLocalizationManager.LOCALIZATION_KEY_MAP[nodeName]) {
            return HomeLocalizationManager.LOCALIZATION_KEY_MAP[nodeName];
        }

        // 处理包含空格的节点名称（如"home menu settings"）
        const normalizedName = nodeName.replace(/\s+/g, '_').toLowerCase();
        if (HomeLocalizationManager.LOCALIZATION_KEY_MAP[normalizedName]) {
            return HomeLocalizationManager.LOCALIZATION_KEY_MAP[normalizedName];
        }

        console.warn(`⚠️ 未找到节点 "${nodeName}" 对应的本地化key`);
        return null;
    }

    /**
     * 更新菜单标签
     */
    private updateMenuLabels(): void {
        if (this.heroMenuLabel) {
            this.heroMenuLabel.string = EDM.getText('home.menu.hero');
            this.applyTextStyle(this.heroMenuLabel, 24, true);
        }

        if (this.talentMenuLabel) {
            this.talentMenuLabel.string = EDM.getText('home.menu.talent');
            this.applyTextStyle(this.talentMenuLabel, 24, true);
        }

        if (this.settingsMenuLabel) {
            this.settingsMenuLabel.string = EDM.getText('home.menu.settings');
            this.applyTextStyle(this.settingsMenuLabel, 24, true);
        }

        if (this.monsterMapMenuLabel) {
            this.monsterMapMenuLabel.string = EDM.getText('home.menu.monster_map');
            this.applyTextStyle(this.monsterMapMenuLabel, 24, true);
        }

        if (this.heroMapMenuLabel) {
            this.heroMapMenuLabel.string = EDM.getText('home.menu.hero_map');
            this.applyTextStyle(this.heroMapMenuLabel, 24, true);
        }

        if (this.heroBackpackMenuLabel) {
            this.heroBackpackMenuLabel.string = EDM.getText('home.menu.hero_backpack');
            this.applyTextStyle(this.heroBackpackMenuLabel, 24, true);
        }
    }

    private hideLevelInfoLabels(): void {
        [this.levelTitleLabel, this.levelNameLabel].forEach(label => {
            if (!label) return;
            label.string = '';
            label.node.active = false;
        });
    }

    /**
     * 更新关卡信息
     * @param levelIndex 关卡索引
     * @param levelName 关卡名称
     */
    public updateLevelInfo(levelIndex: number, levelName: string): void {
        this.hideLevelInfoLabels();
    }

    /**
     * 安全更新关卡信息，避免覆盖已经正确设置的关卡信息
     */
    private updateLevelInfoSafely(): void {
        const currentLevelIndex = PDM.getCurrentLevel();

        if (this._lastLevelIndex === currentLevelIndex && this._initialized) {
            return;
        }

        this.hideLevelInfoLabels();

        this._lastLevelIndex = currentLevelIndex;
    }

    /**
     * 重置初始化状态，允许重新更新
     */
    public resetInitialization(): void {
        this._initialized = false;
        this._lastLanguage = '';
        this._lastLevelIndex = -1;
    }

    /**
     * 测试本地化功能
     */
    public testLocalization(): void {
        console.log('🧪 Home界面本地化测试:');
        console.log(`  游戏标题: ${EDM.getText('game.title')}`);
        console.log(`  开始游戏: ${EDM.getText('game.start')}`);
        console.log(`  关卡标题: ${EDM.getText('level.title')}`);
        console.log(`  关卡名称: ${EDM.getText('level.name')}`);
        console.log(`  英雄菜单: ${EDM.getText('home.menu.hero')}`);
        console.log(`  天赋菜单: ${EDM.getText('home.menu.talent')}`);
        console.log(`  设置菜单: ${EDM.getText('home.menu.settings')}`);
        console.log(`  怪物图菜单: ${EDM.getText('home.menu.monster_map')}`);
        console.log(`  英雄图菜单: ${EDM.getText('home.menu.hero_map')}`);
        console.log(`  英雄背包菜单: ${EDM.getText('home.menu.hero_backpack')}`);
        console.log(`  每日福利菜单: ${EDM.getText('home.menu.daily_welfare')}`);
        console.log(`  魔物图鉴菜单: ${EDM.getText('home.menu.monster_codex')}`);
    }

    /**
     * 运行时语言切换时自动刷新
     */
    onEnable() {
        // 只在首次启用时更新，避免重复调用
        if (!this._initialized) {
            this.updateAllTexts();
        }
        // 监听语言切换事件（假设有事件总线或全局信号）
        // GameBus.on('languageChanged', this.updateAllTexts, this);
    }
    onDisable() {
        // GameBus.off('languageChanged', this.updateAllTexts, this);
    }

    /**
     * 自动扫描并本地化所有UI元素
     * 递归查找所有Label和Button组件
     */
    public autoLocalizeAllUI(): void {
        if (EDM.isDev()) console.log('🔍 自动扫描并本地化所有UI元素...');

        // 扫描当前节点及其所有子节点
        this.scanAndLocalizeNode(this.node);

        if (EDM.isDev()) console.log('✅ 自动本地化完成');
    }

    /**
     * 递归扫描节点并本地化
     */
    private scanAndLocalizeNode(node: Node): void {
        if (!node) return;

        // 处理当前节点的Label组件
        const label = node.getComponent(Label);
        if (label && label.string) {
            this.localizeLabel(label);
        }

        // 处理当前节点的Button组件
        const button = node.getComponent(Button);
        if (button) {
            this.localizeButton(button);
        }

        // 递归处理子节点
        for (let i = 0; i < node.children.length; i++) {
            this.scanAndLocalizeNode(node.children[i]);
        }
    }

    /**
     * 本地化Label组件
     */
    private localizeLabel(label: Label): void {
        const originalText = label.string;
        if (!originalText) return;

        // 尝试将原始文本作为key进行本地化
        const localizedText = this.tryLocalizeText(originalText);
        if (localizedText && localizedText !== originalText) {
            label.string = localizedText;
            if (EDM.isDev()) console.log(`🔄 本地化Label: "${originalText}" -> "${localizedText}"`);
        }
    }

    /**
     * 本地化Button组件
     */
    private localizeButton(button: Button): void {
        // 查找Button内的Label组件
        const buttonLabel = button.getComponentInChildren(Label);
        if (buttonLabel) {
            this.localizeLabel(buttonLabel);
        }
    }

    /**
     * 尝试本地化文本
     */
    private tryLocalizeText(text: string): string | null {
        if (!text.includes('.') && !text.includes('_') && !text.includes(' ')) {
            return null;
        }

        try {
            const localized = EDM.getText(text);
            if (localized && localized !== text) {
                return localized;
            }
        } catch (e) {}

        const normalizedText = text.toLowerCase().trim();
        const key = HomeLocalizationManager.LOCALIZATION_KEY_MAP[normalizedText];
        if (key) {
            try {
                const localized = EDM.getText(key);
                if (localized && localized !== text) {
                    return localized;
                }
            } catch (e) {}
        }

        return null;
    }


    /**
     * 获取当前所有文本的本地化状态
     */
    public getLocalizationStatus(): void {
        console.log('📊 本地化状态检查:');
        console.log(`当前语言: ${languageDataManager.getCurrentLanguage()}`);
        console.log(`游戏标题: ${this.gameTitleLabel?.string || '未设置'}`);
        console.log(`英雄菜单: ${this.heroMenuLabel?.string || '未设置'}`);
        console.log(`天赋菜单: ${this.talentMenuLabel?.string || '未设置'}`);
        console.log(`设置菜单: ${this.settingsMenuLabel?.string || '未设置'}`);
    }
}
