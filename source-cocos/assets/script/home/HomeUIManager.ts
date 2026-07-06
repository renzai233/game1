// assets/scripts/ui/home/HomeUIManager.ts
import { _decorator, Component, Node, Prefab, instantiate, view, Size, UITransform, director } from 'cc';
import { HOME_EVENTS } from '../../utils/signal/HomeEvents';
import { gameBus } from '../../utils/signal/GameBus';

const { ccclass } = _decorator;

@ccclass('HomeUIManager')
export class HomeUIManager extends Component {
    // UI节点引用
    private bgNode: Node = null;
    private coreUINode: Node = null;
    private secondaryUINode: Node = null;
    private menuNode: Node = null;
    private hudNode: Node = null;

    // 预制体
    private HUDPrefab: Prefab = null;

    // 状态
    private isInitialized: boolean = false;

    /**
     * 初始化UI管理器
     */
    public initialize(rootNode: Node, hudPrefab: Prefab): void {
        if (this.isInitialized) return;

        this.HUDPrefab = hudPrefab;

        // 查找UI节点
        this.bgNode = rootNode.getChildByName('Bg');
        this.menuNode = rootNode.getChildByName('Menu');
        this.coreUINode = this.findCoreUINode();
        this.secondaryUINode = this.findSecondaryUINode();

        // 设置初始状态
        if (this.secondaryUINode) {
            this.secondaryUINode.active = false;
        }

        this.isInitialized = true;
        console.log('[HomeUIManager] 初始化完成');
    }

    /**
     * 显示核心UI（立即显示）
     */
    public async showCoreUI(): Promise<void> {
        if (!this.isInitialized) {
            console.error('[HomeUIManager] 未初始化');
            return;
        }

        // 1. 适配屏幕
        this.adaptScreen();

        // 2. 显示背景
        if (this.bgNode) {
            this.bgNode.active = true;
        }

        // 3. 显示核心UI节点
        if (this.coreUINode) {
            this.coreUINode.active = true;
        }

        // 4. 触发事件
        gameBus.emit(HOME_EVENTS.UI_CORE_SHOW);

        console.log('[HomeUIManager] 核心UI显示完成');

        return Promise.resolve();
    }

    /**
     * 显示次要UI（延迟显示）
     */
    public showSecondaryUI(): void {
        if (!this.isInitialized) return;

        // 1. 显示菜单
        if (this.menuNode) {
            this.menuNode.active = true;
        }

        // 2. 显示次要UI节点
        if (this.secondaryUINode) {
            this.secondaryUINode.active = true;
        }

        // 3. 初始化HUD
        this.initHUD();

        console.log('[HomeUIManager] 次要UI显示完成');
    }

    /**
     * 初始化HUD
     */
    private initHUD(): void {
        if (!this.HUDPrefab) {
            console.warn('[HomeUIManager] HUD预制体未设置');
            return;
        }

        // 检查是否已存在HUD
        if (this.hudNode && this.hudNode.isValid) {
            console.log('[HomeUIManager] HUD已存在，跳过初始化');
            return;
        }

        try {
            // 创建HUD实例
            const hudInstance = instantiate(this.HUDPrefab);
            hudInstance.name = 'HUD';
            this.node.addChild(hudInstance);

            // 设置位置和层级
            hudInstance.setPosition(0, 620, 0);
            hudInstance.setSiblingIndex(999);

            this.hudNode = hudInstance;

            gameBus.emit(HOME_EVENTS.UI_HUD_SHOW);
            console.log('[HomeUIManager] HUD初始化完成');
        } catch (error) {
            console.error('[HomeUIManager] 初始化HUD失败:', error);
        }
    }

    /**
     * 适配屏幕
     */
    private adaptScreen(): void {
        const winSize: Size = view.getVisibleSize();

        // 适配背景
        if (this.bgNode) {
            const bgTransform = this.bgNode.getComponent(UITransform);
            if (bgTransform) {
                bgTransform.setContentSize(winSize.width, winSize.height);
            }

            // 适配子节点
            this.adaptBgChildren(winSize);
        }

        // 适配菜单
        if (this.menuNode) {
            const menuTransform = this.menuNode.getComponent(UITransform);
            if (menuTransform) {
                menuTransform.setContentSize(winSize.width, winSize.height);
                this.menuNode.setPosition(0, 0);
            }
        }

        // 监听屏幕尺寸变化
        view.on('design-resolution-changed', this.onScreenResize, this);

        console.log('[HomeUIManager] 屏幕适配完成');
    }

    /**
     * 适配背景子节点
     */
    private adaptBgChildren(winSize: Size): void {
        if (!this.bgNode) return;

        const children = this.bgNode.children;
        for (const child of children) {
            const childTransform = child.getComponent(UITransform);
            if (!childTransform) continue;

            const childName = child.name;

            switch (childName) {
                case 'SpriteSplash':
                    childTransform.setContentSize(winSize.width, winSize.height);
                    child.setPosition(0, 0);
                    break;

                case 'Top':
                    const topHeight = childTransform.height;
                    child.setPosition(0, winSize.height / 2 - topHeight / 2);
                    break;

                case 'Bottom':
                    const bottomHeight = childTransform.height;
                    child.setPosition(0, -winSize.height / 2 + bottomHeight / 2);
                    break;
            }
        }
    }

    /**
     * 屏幕尺寸变化回调
     */
    private onScreenResize(): void {
        console.log('[HomeUIManager] 屏幕尺寸变化，重新适配');
        this.adaptScreen();
        gameBus.emit(HOME_EVENTS.UI_SCREEN_RESIZE);
    }

    /**
     * 刷新UI
     */
    public refreshUI(): void {
        console.log('[HomeUIManager] 刷新UI');

        // 重新适配屏幕
        this.adaptScreen();

        // 刷新HUD显示
        gameBus.emit(HOME_EVENTS.DATA_CURRENCY_UPDATED);
    }

    /**
     * 查找核心UI节点
     */
    private findCoreUINode(): Node {
        // 核心UI包括：游戏标题、开始按钮等
        // 这里根据实际节点结构调整
        const possiblePaths = [
            'Title',
            'StartButton',
            'GameTitle'
        ];

        for (const path of possiblePaths) {
            const node = this.node.getChildByPath(path);
            if (node) return node;
        }

        // 如果找不到，返回根节点
        return this.node;
    }

    /**
     * 查找次要UI节点
     */
    private findSecondaryUINode(): Node {
        // 次要UI包括：菜单按钮、功能按钮等
        const possiblePaths = [
            'Menu/LeftMenu',
            'Menu/RightMenu',
            'Menu/TopMenu',
            'Buttons'
        ];

        for (const path of possiblePaths) {
            const node = this.node.getChildByPath(path);
            if (node) return node;
        }

        return null;
    }

    /**
     * 清理
     */
    public cleanup(): void {
        // 移除屏幕尺寸变化监听
        view.off('design-resolution-changed', this.onScreenResize, this);

        console.log('[HomeUIManager] 清理完成');
    }
}