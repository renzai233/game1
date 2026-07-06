import { _decorator, Component, Node, Widget, Layout, view, instantiate, Prefab, UITransform, Button, Sprite, Label } from 'cc';
import { INavigationConfig, defaultNavigationConfig, INavigationButton } from './NavigationConfig';
import { EDM } from '../data/env/ConfigManager';
import { NavigationButton } from './NavigationButton';
import { Skin1UIPolish } from '../ui/skin1/Skin1UIPolish';

const { ccclass, property } = _decorator;

@ccclass('NavigationManager')
export class NavigationManager extends Component {
    @property(Node)
    navigationBar: Node = null;

    @property(Layout)
    buttonLayout: Layout = null;

    @property(Prefab)
    buttonPrefab: Prefab = null;

    private _config: INavigationConfig = null;
    private _buttons: Map<string, NavigationButton> = new Map();
    private _currentButtonId: string = '';

    onLoad() {
        try {
            this.scheduleOnce(() => {
                if (this.node && this.node.isValid) {
                    this.initNavigationBar();
                }
            }, 0);
            this.node.on('language-changed', this.onLanguageChanged, this);
        } catch (error) {
            console.error('[NavigationManager] onLoad时发生错误:', error);
        }
    }

    onDestroy() {
        try {
            this.node.off('language-changed', this.onLanguageChanged, this);
            this.clearButtons();
            this._config = null;
            this._currentButtonId = '';
        } catch (error) {
            console.warn('[NavigationManager] 销毁时发生错误:', error);
        }
    }

    private onLanguageChanged(): void {
        this.refreshLocalization();
    }

    public initNavigationBar(): void {
        try {
            EDM.initLanguage();
            this.loadConfig();
            this.setupNavigationBar();
            this.createButtons();
        } catch (error) {
            console.error('[NavigationManager] 初始化导航栏时发生错误:', error);
        }
    }

    public loadConfig(): void {
        try {
            if (EDM && EDM.config && EDM.config.navigation) {
                this._config = EDM.config.navigation;
            } else {
                this._config = defaultNavigationConfig;
            }
        } catch (error) {
            console.error('[NavigationManager] 加载配置时发生错误:', error);
            this._config = defaultNavigationConfig;
        }
    }

    public setupNavigationBar(): void {
        try {
            if (!this.navigationBar) {
                console.warn('⚠️ NavigationManager navigationBar 未设置');
                return;
            }
            const screenWidth = view.getVisibleSize().width;
            const navigationTransform = this.navigationBar.getComponent(UITransform);
            if (navigationTransform) {
                navigationTransform.setContentSize(screenWidth, 98);
            }
            Skin1UIPolish.applyNavigation(this.navigationBar);

            const dock = this.navigationBar.getChildByName('Skin1NavDockPolish');
            const dockTransform = dock?.getComponent(UITransform);
            if (dock && dockTransform) {
                dockTransform.setContentSize(screenWidth + 8, 142);
                dock.setPosition(0, -24, 0);
            }

            const navList = this.navigationBar.getChildByName('NavList');
            if (navList) {
                navList.setPosition(0, -6, 0);
                const navListTransform = navList.getComponent(UITransform);
                if (navListTransform) navListTransform.setContentSize(screenWidth, 118);
            }

            const container = navList?.getChildByName('ButtonContainer');
            if (container) {
                const containerTransform = container.getComponent(UITransform);
                if (containerTransform) containerTransform.setContentSize(screenWidth, 118);
                const layout = container.getComponent(Layout);
                if (layout) {
                    layout.spacingX = 22;
                    layout.paddingLeft = 58;
                    layout.paddingRight = 58;
                }
            }
        } catch (error) {
            console.error('[NavigationManager] 设置导航栏时发生错误:', error);
        }
    }

    public createButtons(): void {
        try {
            if (!this._config) {
                console.warn('⚠️ NavigationManager 配置未加载');
                return;
            }
            if (EDM.isDev()) console.log('[Nav] createButtons:', this._config);

            this._config.buttons.forEach((buttonConfig) => {
                if (!buttonConfig.enabled) return;

                const buttonNode = this.buttonPrefab ? instantiate(this.buttonPrefab) : this.createNavigationButtonStructure();

                if (buttonNode) {
                    buttonNode.parent = this.buttonLayout?.node || this.navigationBar;
                    buttonNode.active = true;

                    const button = buttonNode.getComponent(NavigationButton);
                    if (button) {
                        buttonConfig.showName = this._config.showButtonNames;
                        button.init(buttonConfig);
                        this._buttons.set(buttonConfig.id, button);
                        buttonNode.on('navigation-button-click', this.onButtonClick, this);
                    } else {
                        console.error(`[NavigationManager] 按钮组件获取失败: ${buttonConfig.id}`);
                    }
                } else {
                    console.error(`[NavigationManager] 按钮节点创建失败: ${buttonConfig.id}`);
                }
            });

            this.initButtonSelection();
        } catch (error) {
            console.error('[NavigationManager] 创建按钮时发生错误:', error);
        }
    }

    private createNavigationButtonStructure(): Node {
        const rootNode = new Node('NavigationButton');
        rootNode.addComponent(NavigationButton);

        const buttonNode = new Node('Button');
        buttonNode.addComponent(Button);
        buttonNode.parent = rootNode;

        const iconNode = new Node('Icon');
        iconNode.addComponent(Sprite);
        iconNode.parent = rootNode;
        iconNode.setPosition(0, 10, 0);

        const labelNode = new Node('Label');
        labelNode.addComponent(Label);
        labelNode.parent = rootNode;
        labelNode.setPosition(0, -20, 0);

        const backgroundNode = new Node('Background');
        backgroundNode.addComponent(Sprite);
        backgroundNode.parent = rootNode;

        const rootTransform = rootNode.getComponent(UITransform);
        const buttonTransform = buttonNode.getComponent(UITransform);
        const iconTransform = iconNode.getComponent(UITransform);
        const labelTransform = labelNode.getComponent(UITransform);
        const backgroundTransform = backgroundNode.getComponent(UITransform);

        if (rootTransform) rootTransform.setContentSize(120, 120);
        if (buttonTransform) buttonTransform.setContentSize(120, 120);
        if (iconTransform) iconTransform.setContentSize(64, 64);
        if (labelTransform) labelTransform.setContentSize(100, 30);
        if (backgroundTransform) backgroundTransform.setContentSize(120, 120);

        return rootNode;
    }

    private onButtonClick(buttonConfig: INavigationButton): void {
        this.selectButton(buttonConfig.id);
        this.node.emit('navigation-button-selected', buttonConfig);
    }

    public refreshLocalization(): void {
        this._buttons.forEach(button => button.refreshLocalization());
    }

    public updateShowButtonNames(): void {
        if (!this._config) return;
        this._buttons.forEach(button => {
            const config = button.config;
            if (config) {
                config.showName = this._config.showButtonNames;
                button.refreshLocalization();
            }
        });
    }

    private clearButtons(): void {
        this._buttons.forEach(button => {
            if (button && button.node && button.node.isValid) {
                button.node.off('navigation-button-click', this.onButtonClick, this);
            }
        });
        this._buttons.clear();

        if (this.buttonLayout && this.buttonLayout.node && this.buttonLayout.node.isValid) {
            this.buttonLayout.node.removeAllChildren();
        }
    }

    public selectButton(buttonId: string): void {
        try {
            if (this._currentButtonId && this._buttons.has(this._currentButtonId)) {
                const previousButton = this._buttons.get(this._currentButtonId);
                if (previousButton) {
                    previousButton.setSelected(false);
                }
            }

            if (this._buttons.has(buttonId)) {
                const currentButton = this._buttons.get(buttonId);
                if (currentButton) {
                    currentButton.setSelected(true);
                    this._currentButtonId = buttonId;
                    if (EDM.isDev()) console.log(`✅ NavigationManager 选中按钮: ${buttonId}`);
                }
            }
        } catch (error) {
            console.error('[NavigationManager] 选择按钮时发生错误:', error);
        }
    }

    private initButtonSelection(): void {
        try {
            if (this._config.buttons.length > 0) {
                const homeButton = this._config.buttons.find(button => button.id === 'home' && button.enabled);
                if (homeButton) {
                    this.selectButton('home');
                } else {
                    const firstEnabledButton = this._config.buttons.find(button => button.enabled);
                    if (firstEnabledButton) {
                        this.selectButton(firstEnabledButton.id);
                    }
                }
            }
        } catch (error) {
            console.error('[NavigationManager] 初始化按钮选中状态时发生错误:', error);
        }
    }

    public show(): void {
        if (this.navigationBar) {
            this.navigationBar.active = true;
        }
    }

    public hide(): void {
        if (this.navigationBar) {
            this.navigationBar.active = false;
        }
    }

    public updateConfig(config: INavigationConfig): void {
        this._config = config;
        this.clearButtons();
        this.createButtons();
    }

    public get currentButtonId(): string {
        return this._currentButtonId;
    }

    public get config(): INavigationConfig {
        return this._config;
    }
}
