import { _decorator, Node, Prefab, Label, Button, UITransform, Sprite, SpriteFrame, Vec3, tween } from 'cc';
import { UIBase } from 'db://assets/utils/ui/UIBase';
import { SettingsLocalizationManager } from './SettingsLocalizationManager';
import { loadResSingleAsset } from 'db://assets/utils/utils';

import { UIManager } from 'db://assets/utils/ui/UIManager';
import { ConfigManager, EDM } from 'db://assets/utils/data/env/ConfigManager';
import { APM } from 'db://assets/utils/common/AudioPlayManager';

const { ccclass, property } = _decorator;

@ccclass('SettingsPanelController')
export class SettingsPanelController extends UIBase {
    @property(Prefab)
    settingsItemPrefab: Prefab; // item预制体
    @property(Node)
    contentNode: Node;
    @property(Node)
    scrollContentNode: Node; // 滚动内容节点
    @property(SettingsLocalizationManager)
    localizationManager: SettingsLocalizationManager | null = null;

    // 存储动态创建的设置项节点，用于管理
    private settingNodes: Node[] = [];
    private EDM = ConfigManager.instance;

    private settingsOn = 'settings.on';
    private settingsOff = 'settings.off';
    private settingsLanguage = 'settings.language';
    private settingsMusic = 'settings.music';
    private settingsSound = 'settings.sound';

    private settingsMusicIcon = 'textures/icon/common/icon-arrow-rn/spriteFrame';
    private settingsSoundIcon = 'textures/icon/common/icon-arrow-rc/spriteFrame';
    private settingsLanguageIcon = 'textures/icon/common/icon-game/spriteFrame';

    // 标记是否已初始化
    private _settingsInitialized: boolean = false;

    start() {
        console.log('[SettingsPanelController][start]');
        this.init();
    }

    init() {
        // 只在第一次初始化时创建节点
        if (!this._settingsInitialized) {
            this.createAllSettingItems();
            this._settingsInitialized = true;
        } else {
            // 后续只更新文本内容
            this.updateAllSettingTexts();
        }
    }

    /**
     * 创建所有设置项
     */
    private createAllSettingItems(): void {
        // 创建音乐和音效设置项
        this.createMusicSettingItem(this.settingsMusic, 'music');
        this.createMusicSettingItem(this.settingsSound, 'effect');
        // 创建语言设置项
        if (EDM.config.useLocalization) this.createLanguageSettingItem();
    }

    /**
     * 更新所有设置项的文本
     */
    private updateAllSettingTexts(): void {

        // 更新音乐设置项
        this.updateSettingItemText(0, this.settingsMusic, 'music');
        // 更新音效设置项
        this.updateSettingItemText(1, this.settingsSound, 'effect');
        // 更新语言设置项
        this.updateLanguageItemText();
    }

    /**
     * 更新单个设置项的文本
     */
    private updateSettingItemText(index: number, labelKey: string, key: 'music' | 'effect'): void {
        if (index >= this.settingNodes.length) return;

        const itemNode = this.settingNodes[index];
        if (!itemNode || !itemNode.isValid) return;

        // 更新标签文本
        const labelNode = itemNode.getChildByName('Label');
        if (labelNode) {
            const labelComp = labelNode.getComponent(Label);
            if (labelComp) {
                labelComp.string = EDM.getText(labelKey);
            }
        }

        // 更新按钮文本
        const btnNode = itemNode.getChildByName('Btn');
        if (btnNode) {
            const btnLabel = btnNode.getComponent(Label);
            if (btnLabel) {
                btnLabel.string = this.getSettingStatus(key) ?
                    EDM.getText(this.settingsOn) :
                    EDM.getText(this.settingsOff);
            }
        }
    }

    /**
     * 更新语言设置项的文本
     */
    private updateLanguageItemText(): void {
        if (this.settingNodes.length < 3) return;

        const itemNode = this.settingNodes[2]; // 语言是第三个
        if (!itemNode || !itemNode.isValid) return;

        // 更新标签文本
        const labelNode = itemNode.getChildByName('Label');
        if (labelNode) {
            const labelComp = labelNode.getComponent(Label);
            if (labelComp) {
                labelComp.string = EDM.getText(this.settingsLanguage);
            }
        }

        // 更新下拉菜单文本
        const dropdownNode = itemNode.getChildByName('Dropdown');
        if (dropdownNode) {
            const dropdownLabel = dropdownNode.getComponent(Label);
            if (dropdownLabel) {
                dropdownLabel.string = this.getLanguage();
            }
        }
    }

    /**
     * 清理设置项节点（仅在销毁时使用）
     */
    private clearSettingNodes(): void {
        console.log(`🧹 清理 ${this.settingNodes.length} 个设置项节点`);
        this.settingNodes.forEach(node => {
            if (node && node.isValid) {
                node.destroy();
            }
        });
        this.settingNodes = [];
        this._settingsInitialized = false;
    }

    /**
     * 创建音乐/音效设置项
     */
    private createMusicSettingItem(labelKey: string, key: 'music' | 'effect') {
        // 父节点
        let itemNode = new Node();
        itemNode.name = EDM.getText(labelKey) || labelKey;
        itemNode.getComponent(UITransform)?.setAnchorPoint(0.5, 0.5);

        // 根据类型设置Y轴位置，确保间隔一致且不会超出屏幕
        let offsetY = 0;
        if (key === 'music') {
            offsetY = -100; // 音乐在最上面
        } else if (key === 'effect') {
            offsetY = -200; // 音效在中间
        }

        // 图标
        let iconNode = new Node('Icon');
        let iconSprite = iconNode.addComponent(Sprite);
        iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        iconNode.getComponent(UITransform).setContentSize(32, 32);
        iconNode.setPosition(-150, offsetY);
        itemNode.addChild(iconNode);

        // 异步加载图标资源
        let iconPath = key === 'music' ? this.settingsMusicIcon : this.settingsSoundIcon;
        loadResSingleAsset(iconPath, (spriteFrame: SpriteFrame) => {
            if (iconSprite && iconSprite.isValid) {
                iconSprite.spriteFrame = spriteFrame;
            }
        });

        // Label - 使用本地化文本
        let labelNode = new Node('Label');
        let labelComp = labelNode.addComponent(Label);
        labelComp.string = EDM.getText(labelKey);
        labelComp.fontSize = 32;
        labelComp.lineHeight = 36;
        labelNode.setPosition(-50, offsetY);
        itemNode.addChild(labelNode);

        // 开关按钮
        let btnNode = new Node('Btn');
        let btn = btnNode.getComponent(Button);
        if (!btn) {
            btn = btnNode.addComponent(Button);
        }
        let btnLabel = btnNode.getComponent(Label);
        if (!btnLabel) {
            btnLabel = btnNode.addComponent(Label);
        }
        btnLabel.string = this.getSettingStatus(key) ? EDM.getText(this.settingsOn) : EDM.getText(this.settingsOff);
        btnLabel.fontSize = 32;
        btnLabel.lineHeight = 36;
        btnNode.setPosition(150, offsetY);
        btnNode.on('click', () => {
            this.toggleSetting(key);
        });
        itemNode.addChild(btnNode);

        // 设置节点宽度，避免重叠
        itemNode.getComponent(UITransform)?.setContentSize(350, 60);

        this.scrollContentNode.addChild(itemNode);
        this.settingNodes.push(itemNode);
    }

    /**
     * 创建语言设置项
     */
    private createLanguageSettingItem() {
        // 父节点
        let itemNode = new Node();
        itemNode.name = EDM.getText(this.settingsLanguage);
        itemNode.getComponent(UITransform)?.setAnchorPoint(0.5, 0.5);
        let offsetY = -300; // 语言在最下面

        // 图标
        let iconNode = new Node('Icon');
        let iconSprite = iconNode.addComponent(Sprite);
        iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        iconNode.getComponent(UITransform).setContentSize(32, 32);
        iconNode.setPosition(-150, offsetY);
        itemNode.addChild(iconNode);

        // 异步加载图标资源
        loadResSingleAsset(this.settingsLanguageIcon, (spriteFrame: SpriteFrame) => {
            if (iconSprite && iconSprite.isValid) {
                iconSprite.spriteFrame = spriteFrame;
            }
        });

        // Label - 使用本地化文本
        let labelNode = new Node('Label');
        let labelComp = labelNode.addComponent(Label);
        labelComp.string = EDM.getText(this.settingsLanguage);
        labelComp.fontSize = 32;
        labelComp.lineHeight = 36;
        labelNode.setPosition(-50, offsetY);
        itemNode.addChild(labelNode);

        // 下拉菜单
        let dropdownNode = new Node('Dropdown');
        let dropdown = dropdownNode.getComponent(Button);
        if (!dropdown) {
            dropdown = dropdownNode.addComponent(Button);
        }
        let dropdownLabel = dropdownNode.getComponent(Label);
        if (!dropdownLabel) {
            dropdownLabel = dropdownNode.addComponent(Label);
        }
        dropdownLabel.string = this.getLanguage();
        dropdownLabel.fontSize = 32;
        dropdownLabel.lineHeight = 36;
        dropdownNode.setPosition(150, offsetY);
        dropdownNode.on('click', () => {
            this.toggleLanguage();
        });
        itemNode.addChild(dropdownNode);

        // 设置节点宽度，避免重叠
        itemNode.getComponent(UITransform)?.setContentSize(350, 60);

        this.scrollContentNode.addChild(itemNode);
        this.settingNodes.push(itemNode);
    }

    /**
     * 获取设置状态
     */
    private getSettingStatus(key: 'music' | 'effect'): boolean {
        return localStorage.getItem('setting_' + key) !== '0';
    }

    /**
     * 切换设置
     */
    private toggleSetting(key: 'music' | 'effect') {
        const cur = this.getSettingStatus(key);
        const newValue = !cur;
        localStorage.setItem('setting_' + key, newValue ? '1' : '0');

        if (key === 'music') {
            APM.setMusicOn(newValue);
        } else {
            APM.setEffectOn(newValue);
        }

        // 只更新对应设置项的文本，不重新创建
        const index = key === 'music' ? 0 : 1;
        this.updateSettingItemText(index, key === 'music' ? this.settingsMusic : this.settingsSound, key);

        console.log(`🔊 ${key === 'music' ? '音乐' : '音效'}已${newValue ? '开启' : '关闭'}`);
    }

    /**
     * 获取当前语言
     */
    private getLanguage(): string {
        return EDM.getCurrentLanguageDisplayName();
    }

    /**
     * 切换语言
     */
    private toggleLanguage() {
        // 使用EDM切换到下一个语言
        EDM.switchToNextLanguage();
        // 更新所有设置项的文本
        this.updateAllSettingTexts();
        // 更新本地化管理器
        if (this.localizationManager) {
            this.localizationManager.updateAllTexts();
        }
        // 通知所有相关面板刷新本地化
        this.notifyAllPanelsRefresh();
        // 触发语言切换事件，通知导航栏刷新
        this.triggerLanguageChanged();
        console.log(`🌍 语言已切换为: ${EDM.getCurrentLanguageDisplayName()}`);
    }

    /**
     * 触发语言切换事件
     */
    private triggerLanguageChanged(): void {
        // 在场景中触发语言切换事件
        const scene = this.node.scene;
        if (scene) {
            scene.emit('language-changed');
            console.log('🔄 触发语言切换事件');
        }
    }

    /**
     * 通知所有相关面板刷新本地化
     */
    private notifyAllPanelsRefresh(): void {
        console.log('🔄 通知所有面板刷新本地化...');

        // 查找并刷新 Welfare 面板
        const welfarePanels = this.node.scene.getComponentsInChildren('WelfarePanelController');
        welfarePanels.forEach(panel => {
            if (typeof (panel as any).refreshLocalization === 'function') {
                (panel as any).refreshLocalization();
            }
        });

        // 查找并刷新 Home 本地化管理器
        const homeLocalizationManagers = this.node.scene.getComponentsInChildren('HomeLocalizationManager');
        homeLocalizationManagers.forEach(manager => {
            if (typeof (manager as any).updateAllTexts === 'function') {
                (manager as any).updateAllTexts();
            }
        });

        // 查找并刷新 HUD 控制器
        const hudControllers = this.node.scene.getComponentsInChildren('HUDController');
        hudControllers.forEach(controller => {
            if (typeof (controller as any).updateLocalizedTexts === 'function') {
                (controller as any).updateLocalizedTexts();
            }
        });

        // 查找并刷新 Hero 面板控制器
        const heroPanelControllers = this.node.scene.getComponentsInChildren('HeroPanelController');
        heroPanelControllers.forEach(controller => {
            if (typeof (controller as any).updateLocalizedTexts === 'function') {
                (controller as any).updateLocalizedTexts();
            }
        });

        console.log('✅ 所有面板刷新通知完成');
    }


    /**
     * 重写onShow方法
     */
    protected onShow(data?: any): void {
        // 初始化设置面板
        this.init();
    }

    /**
     * 重写打开动画，添加调试信息
     */
    protected _playOpenAnim(): void {
        // 调用父类的动画方法
        super._playOpenAnim();
    }

    /**
     * 重写关闭动画，添加调试信息
     */
    protected _playCloseAnim(callback?: () => void): void {
        // 调用父类的动画方法
        super._playCloseAnim(callback);
    }


    protected onDestroy(): void {
        this.clearSettingNodes();
        super.onDestroy();
    }

    // 关闭弹窗
    onClose() {
        UIManager.instance.closeUI('ui/popup/settings/SettingsPanel');
    }
}
