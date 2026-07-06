import { _decorator, Component, Node } from 'cc';
import { NavigationManager } from './NavigationManager';
import { NavigationUtils } from './NavigationUtils';
import { UIManager } from '../ui/UIManager';
import { UIGroup } from '../ui/UIBase';
import { Widget } from 'cc';
import { UITransform } from 'cc';
import { EDM } from '../data/env/ConfigManager';
import { INavigationButton } from './NavigationConfig';
import { SIGNAL_TYPES } from '../signal/ISignal';
import { gameBus } from '../signal/GameBus';

const { ccclass } = _decorator;

@ccclass('NavigationController')
export class NavigationController extends Component {
    navigationManager: NavigationManager = null;

    private _currentPanel: string = '';
    private _panelCache: Map<string, any> = new Map();
    private _onLanguageChangedHandler: (() => void) | null = null;

    onLoad() {
        this.initNavigation();
        this._onLanguageChangedHandler = this.onLanguageChanged.bind(this);
        gameBus.on(SIGNAL_TYPES.LANGUAGE_CHANGED, this._onLanguageChangedHandler);
    }

    onDestroy() {
        if (this._onLanguageChangedHandler) {
            gameBus.off(SIGNAL_TYPES.LANGUAGE_CHANGED, this._onLanguageChangedHandler);
            this._onLanguageChangedHandler = null;
        }

        if (this.navigationManager?.node) {
            this.navigationManager.node.off('navigation-button-selected', this.onNavigationButtonSelected, this);
        }
        this.navigationManager = null;

        if (this._panelCache) {
            this._panelCache.clear();
            this._panelCache = null;
        }
    }

    private onLanguageChanged(): void {
        console.log('🔄 NavigationController 收到语言切换事件');
        if (this.navigationManager) {
            this.navigationManager.refreshLocalization();
        }
    }

    private initNavigation(): void {
        try {
            if (!this.navigationManager) {
                this.navigationManager = this.getComponent(NavigationManager);
            }

            if (this.navigationManager) {
                NavigationUtils.setNavigationManager(this.navigationManager);
                NavigationUtils.setNavigationController(this);
                this.navigationManager.node.on('navigation-button-selected', this.onNavigationButtonSelected, this);
                this.navigationManager.show();
                this.openDefaultPanel();
            } else {
                console.warn('[NavigationController] 无法找到NavigationManager组件');
            }
        } catch (error) {
            console.error('[NavigationController] 初始化导航栏时发生错误:', error);
        }
    }

    private onNavigationButtonSelected(buttonConfig: INavigationButton): void {
        if (buttonConfig && buttonConfig.panelPath) {
            this.switchToPanel(buttonConfig.id);
        }
    }

    private async openDefaultPanel(): Promise<void> {
        const config = this.navigationManager.config;
        if (config && config.buttons.length > 0) {
            const firstButton = config.buttons[0];
            await this.switchToPanel(firstButton.id);
        }
    }

    public async switchToPanel(buttonId: string): Promise<void> {
        const config = this.navigationManager.config;
        const button = config.buttons.find(btn => btn.id === buttonId);

        if (!button || !button.enabled) {
            console.warn(`[NavigationController] 按钮 ${buttonId} 不存在或未启用`);
            return;
        }

        this.navigationManager.selectButton(buttonId);

        if (button.panelPath === 'home_scene') {
            this.handleHomeScene();
            this._currentPanel = buttonId;
            return;
        }

        if (button.panelPath) {
            await this.openPanel(button.panelPath, button.id);
            this._currentPanel = buttonId;
        }
    }

    private handleHomeScene(): void {
        this.hideAllPanels();
        this._panelCache.clear();
        this.notifyHomeController();
    }

    private notifyHomeController(): void {
        const homeController = this.node.scene.getComponentInChildren('HomeController') as any;
        if (homeController && typeof homeController.refreshHomeScene === 'function') {
            homeController.refreshHomeScene();
        }
    }

    private async openPanel(panelPath: string, panelId: string): Promise<void> {
        let panel = this._panelCache.get(panelPath);

        if (!panel) {
            try {
                panel = await UIManager.instance.openUI(panelPath, null, true, UIGroup.Main, 'prefabs');

                this._panelCache.set(panelPath, panel);

                if (panel && panel.node) {
                    NavigationUtils.setPanelSiblingIndex(panel.node, 50);
                    this.setupGroupNode(panel.node.parent);
                    this.refreshPanelLayout(panel);
                }
            } catch (error) {
                console.error(`[NavigationController] 面板创建失败: ${panelPath}`, error);
                return;
            }
        } else {
            if (panel && panel.node && panel.node.isValid) {
                if (typeof panel.show === 'function') {
                    await panel.show(null);
                } else {
                    panel.node.active = true;
                }
                NavigationUtils.setPanelSiblingIndex(panel.node, 50);
                this.setupGroupNode(panel.node.parent);
                this.refreshPanelLayout(panel);
            } else {
                this._panelCache.delete(panelPath);
                await this.openPanel(panelPath, panelId);
                return;
            }
        }

        this.hideOtherPanels(panelPath);
    }

    private setupGroupNode(groupNode: Node): void {
        if (!groupNode) return;

        const groupTransform = groupNode.getComponent(UITransform);
        if (groupTransform) {
            groupTransform.setContentSize(EDM.config.viewWidth, EDM.config.viewHeight);
        }

        groupNode.setPosition(0, 0, 0);

        let groupWidget = groupNode.getComponent(Widget);
        if (!groupWidget) {
            groupWidget = groupNode.addComponent(Widget);
        }
        if (groupWidget) {
            groupWidget.isAlignTop = true;
            groupWidget.top = 0;
            groupWidget.isAlignBottom = true;
            groupWidget.bottom = 0;
            groupWidget.isAlignLeft = true;
            groupWidget.left = 0;
            groupWidget.isAlignRight = true;
            groupWidget.right = 0;
            groupWidget.enabled = false;
        }

        groupNode.setPosition(0, 0, 0);

        NavigationUtils.setGroupNodeSiblingIndex(groupNode, 30);
    }

    private refreshPanelLayout(panel: any): void {
        if (!panel || !panel.node || !panel.node.isValid) return;

        const panelTransform = panel.node.getComponent(UITransform) || panel.node.addComponent(UITransform);
        panelTransform.setContentSize(EDM.config.viewWidth, EDM.config.viewHeight);

        const panelWidget = panel.node.getComponent(Widget);
        if (panelWidget) panelWidget.enabled = false;

        panel.node.setPosition(0, 0, 0);
        panel.node.setScale(1, 1, 1);

        if (typeof panel.refreshFullScreenLayout === 'function') {
            panel.refreshFullScreenLayout();
        }
    }

    private hideOtherPanels(currentPanelPath: string): void {
        if (!this._panelCache) return;

        this._panelCache.forEach((panel, path) => {
            if (path !== currentPanelPath && panel && panel.node && panel.node.isValid) {
                panel.node.active = false;
            }
        });
    }

    public hideAllPanels(): void {
        if (!this._panelCache) return;

        this._panelCache.forEach((panel, path) => {
            if (panel && panel.node && panel.node.isValid) {
                panel.node.active = false;
            }
        });
    }

    public showNavigation(): void {
        if (this.navigationManager) {
            this.navigationManager.show();
        }
    }

    public hideNavigation(): void {
        if (this.navigationManager) {
            this.navigationManager.hide();
        }
    }

    public get currentPanel(): string {
        return this._currentPanel;
    }

    public get panelCache(): Map<string, any> {
        return this._panelCache;
    }

    public clearPanelCache(): void {
        if (!this._panelCache) return;
        this._panelCache.clear();
    }

    public updateNavigationConfig(): void {
        if (this.navigationManager) {
            this.navigationManager.updateConfig(EDM.config.navigation);
        }
    }
}
