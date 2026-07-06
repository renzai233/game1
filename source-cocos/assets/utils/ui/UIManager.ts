import { _decorator, Node, Prefab, instantiate, resources, director, Director, assetManager, UITransform, Widget, view } from 'cc';
import { UIBase, UIGroup } from './UIBase';
import { EventBus } from './UIEventBus';
import { EDM } from '../data/env/ConfigManager';
import { PDM } from '../data/config/player/PlayerDataManager';

const { ccclass } = _decorator;

/**
 * UI管理器，负责UI的打开、关闭、缓存、层级等
 */
@ccclass('UIManager')
export class UIManager {
    /*** 全局广告/支付开关和VIP判断 ***/
    public isAdEnabled: boolean = EDM.config.enableAd ?? true; // 是否开启广告
    public isPayEnabled: boolean = EDM.config.enablePay ?? true; // 是否开启充值
    public isAdVip: boolean = PDM.getIsAdVip() ?? false; // 是否为广告VIP用户
    public vipLevel: number = PDM.getVipLevel() ?? 0; //VIP等级，0为非VIP用户

    private static _instance: UIManager;
    public static get instance(): UIManager {
        if (!this._instance) this._instance = new UIManager();
        return this._instance;
    }

    /** UI缓存池 */
    private _uiCache: Map<string, UIBase> = new Map();
    /** Bundle缓存 */
    private _bundleCache: Map<string, any> = new Map();
    /** UI根节点 */
    private _uiRoot: Node = null;

    /** 分组节点 */
    private _groupNodes: Map<UIGroup, Node> = new Map();

    /** UI栈 */
    private _uiStack: string[] = [];

    /** 事件总线 */
    public eventBus = EventBus.instance;

    /** 持久化UI配置 - 这些UI在场景切换时不会被销毁，并且会预加载 */
    private static readonly PERSISTENT_UI_CONFIG = [
        'ui/hero/HeroPanel',
        'ui/bag/BagPanel',
        'ui/shop/ShopPanel'
    ];

    /** 持久化UI列表 - 这些UI在场景切换时不会被销毁 */
    private _persistentUIs: Set<string> = new Set(UIManager.PERSISTENT_UI_CONFIG);

    constructor() {
        // 监听场景切换，自动重置所有缓存
        director.on(Director.EVENT_AFTER_SCENE_LAUNCH, this._onSceneChanged, this);
    }

    private _onSceneChanged() {
        // 场景切换后，所有节点缓存都要重置
        this._uiRoot = null;
        this._groupNodes.clear();

        // 清除非持久化的UI缓存
        const keysToDelete: string[] = [];
        this._uiCache.forEach((ui, key) => {
            if (!this._persistentUIs.has(key)) {
                keysToDelete.push(key);
            }
        });

        keysToDelete.forEach(key => {
            const ui = this._uiCache.get(key);
            if (ui && ui.node && ui.node.isValid) {
                ui.node.destroy();
            }
            this._uiCache.delete(key);
        });

        // 注意：Bundle缓存不清除，因为Bundle是全局资源
    }

    /** 获取UI根节点 */
    private getUIRoot(): Node {
        if (!this._uiRoot) {
            this._uiRoot = director.getScene().getChildByName('Canvas');
        }
        return this._uiRoot;
    }

    /** 初始化分组节点 */
    private _initGroupNodes(): void {
        const root = this.getUIRoot();
        (Object.keys(UIGroup) as Array<keyof typeof UIGroup>).forEach(key => {
            const group = UIGroup[key];
            let node = root.getChildByName(group);
            if (!node) {
                node = new Node(group);
                root.addChild(node);
            }

            // 设置分组节点的层级
            switch (group) {
                case UIGroup.Main:
                    node.setSiblingIndex(10);
                    break;
                case UIGroup.Popup:
                    node.setSiblingIndex(100);
                    break;
                case UIGroup.Toast:
                    node.setSiblingIndex(1000); // 最高层级
                    break;
                case UIGroup.Guide:
                    node.setSiblingIndex(2000); // 引导层级最高
                    break;
            }

            this.normalizeFullScreenNode(node);
            this._groupNodes.set(group, node);
        });
    }

    /** 获取分组节点 */
    private getGroupNode(group: UIGroup): Node {
        if (this._groupNodes.size === 0) this._initGroupNodes();
        let node = this._groupNodes.get(group);
        // 防御性：如果分组节点丢失，自动重建
        if (!node || !node.isValid) {
            this._initGroupNodes();
            node = this._groupNodes.get(group);
            // 若还没有则直接在UIRoot下新建
            if (!node) {
                node = new Node(group);
                this.getUIRoot().addChild(node);
                this._groupNodes.set(group, node);
            }
        }
        return node;
    }

    /**
     * 打开UI（支持从Bundle加载）
     * @param path 预制体路径（如 'prefab/home/popup/DailyTask'）
     * @param data 传递给UI的数据
     * @param cache 是否缓存
     * @param group 分组
     * @param bundleName Bundle名称，可选（如 'res'），如果不指定则从默认resources加载
     */
    public async openUI<T extends UIBase>(
        path: string,
        data?: any,
        cache: boolean = true,
        group: UIGroup = UIGroup.Popup,
        bundleName?: string
    ): Promise<T> {
        // 生成唯一的UI标识（包含bundle信息）
        const uiKey = bundleName ? `${bundleName}:${path}` : path;

        let ui: UIBase = this._uiCache.get(uiKey);

        // 如果缓存的UI节点已失效，则自动重建
        if (!ui || !ui.node || !ui.node.isValid) {
            const prefab = await this._loadPrefab(path, bundleName);
            if (!prefab) throw new Error(`UIManager: 预制体加载失败: ${path}, bundle: ${bundleName || 'default'}`);

            const groupNode = this.getGroupNode(group);
            if (!groupNode || !groupNode.isValid) throw new Error(`UIManager: 分组节点无效: ${group}`);

            const node = instantiate(prefab);
            if (!node) throw new Error(`UIManager: 预制体实例化失败: ${path}`);

            this.normalizeFullScreenNode(groupNode);
            node.parent = groupNode;
            if (group === UIGroup.Main) {
                this.normalizePanelNode(node);
            }
            ui = node.getComponent(UIBase);

            if (cache && ui) {
                this._uiCache.set(uiKey, ui);
            }
        }

        // 再次防御：ui和node必须有效
        if (!ui || !ui.node || !ui.node.isValid) {
            // 彻底兜底：递归重试一次
            this._uiCache.delete(uiKey);
            return await this.openUI<T>(path, data, cache, group, bundleName);
        }

        await ui.show(data);
        if (group === UIGroup.Main) {
            this.normalizePanelNode(ui.node);
            const refreshLayout = (ui as any).refreshFullScreenLayout;
            if (typeof refreshLayout === 'function') {
                refreshLayout.call(ui);
            }
        }
        if (EDM.isDev()) console.log('[UIManager] openUI: uiKey', uiKey, 'data', data);

        // UI栈管理
        if (group === UIGroup.Popup) this._uiStack.push(uiKey);

        return ui as T;
    }

    private normalizeFullScreenNode(node: Node): void {
        if (!node || !node.isValid) return;

        const visibleSize = view.getVisibleSize();
        const width = EDM.config?.viewWidth || visibleSize.width;
        const height = EDM.config?.viewHeight || visibleSize.height;
        const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
        transform.setContentSize(width, height);

        const widget = node.getComponent(Widget);
        if (widget) widget.enabled = false;

        node.setPosition(0, 0, 0);
        node.setScale(1, 1, 1);
    }

    private normalizePanelNode(node: Node): void {
        if (!node || !node.isValid) return;

        this.normalizeFullScreenNode(node);
        const widget = node.getComponent(Widget);
        if (widget) {
            widget.isAlignTop = true;
            widget.top = 0;
            widget.isAlignBottom = true;
            widget.bottom = 0;
            widget.isAlignLeft = true;
            widget.left = 0;
            widget.isAlignRight = true;
            widget.right = 0;
            widget.enabled = false;
        }
        node.setPosition(0, 0, 0);
    }

    /**
     * 加载Bundle（如果还未加载）
     * @param bundleName Bundle名称
     * @returns Bundle对象
     */
    private async _loadBundle(bundleName: string): Promise<any> {
        // 检查是否已缓存
        if (this._bundleCache.has(bundleName)) {
            return this._bundleCache.get(bundleName);
        }

        return new Promise((resolve, reject) => {
            // 检查Bundle是否已加载
            const existingBundle = assetManager.getBundle(bundleName);
            if (existingBundle) {
                this._bundleCache.set(bundleName, existingBundle);
                resolve(existingBundle);
                return;
            }

            // 加载Bundle
            assetManager.loadBundle(bundleName, (err, bundle) => {
                if (err) {
                    console.error(`UIManager: Bundle加载失败: ${bundleName}`, err);
                    reject(err);
                } else {
                    console.log(`UIManager: Bundle加载成功: ${bundleName}`);
                    this._bundleCache.set(bundleName, bundle);
                    resolve(bundle);
                }
            });
        });
    }

    /**
     * 加载预制体（支持从Bundle或默认resources加载）
     * @param path 预制体路径
     * @param bundleName Bundle名称，可选
     * @returns 预制体对象
     */
    private async _loadPrefab(path: string, bundleName?: string): Promise<Prefab> {
        if (bundleName) {
            // 从指定Bundle加载
            try {
                const bundle = await this._loadBundle(bundleName);
                return new Promise((resolve, reject) => {
                    bundle.load(path, Prefab, (err, prefab) => {
                        if (err) {
                            console.error(`UIManager: 从Bundle ${bundleName} 加载预制体失败: ${path}`, err);
                            reject(err);
                        } else {
                            resolve(prefab);
                        }
                    });
                });
            } catch (error) {
                console.error(`UIManager: Bundle加载过程出错: ${bundleName}`, error);
                throw error;
            }
        } else {
            // 从默认resources加载
            return new Promise((resolve, reject) => {
                resources.load(path, Prefab, (err, prefab) => {
                    if (err) {
                        console.error(`UIManager: 从resources加载预制体失败: ${path}`, err);
                        reject(err);
                    } else {
                        resolve(prefab);
                    }
                });
            });
        }
    }

    /** 关闭UI */
    public closeUI(path: string, bundleName?: string): void {
        const uiKey = bundleName ? `${bundleName}:${path}` : path;
        const ui = this._uiCache.get(uiKey);
        if (ui) {
            ui.hide();
            // UI栈管理
            const idx = this._uiStack.lastIndexOf(uiKey);
            if (idx !== -1) this._uiStack.splice(idx, 1);
        }
    }

    /** 返回上一个UI */
    public back(): void {
        if (this._uiStack.length > 0) {
            const last = this._uiStack.pop();
            this.closeUIByKey(last);
        }
    }

    /** 通过完整Key关闭UI */
    private closeUIByKey(uiKey: string): void {
        const ui = this._uiCache.get(uiKey);
        if (ui) {
            ui.hide();
        }
    }

    /** 销毁UI */
    public destroyUI(path: string, bundleName?: string): void {
        const uiKey = bundleName ? `${bundleName}:${path}` : path;
        const ui = this._uiCache.get(uiKey);
        if (ui) {
            ui.destroyUI();
            this._uiCache.delete(uiKey);
        }
    }

    /** 预加载UI */
    public async preloadUI(path: string, bundleName?: string): Promise<void> {
        await this._loadPrefab(path, bundleName);
    }

    /** 预加载Bundle */
    public async preloadBundle(bundleName: string): Promise<void> {
        await this._loadBundle(bundleName);
    }

    /**
     * 预加载导航栏面板UI
     * 预加载英雄面板、背包面板和商店面板的预制体，避免点击时重复加载
     */
    public async preloadNavigationPanels(): Promise<void> {
        console.log('[UIManager] 开始预加载导航栏面板...');

        const preloadTasks: Promise<void>[] = [];

        try {
            for (const path of UIManager.PERSISTENT_UI_CONFIG) {
                preloadTasks.push(this.preloadUI(path, 'prefabs'));
            }

            await Promise.all(preloadTasks);

            console.log('[UIManager] 导航栏面板预加载完成');
        } catch (error) {
            console.error('[UIManager] 导航栏面板预加载失败:', error);
        }
    }

    /** 获取已加载的Bundle */
    public getBundle(bundleName: string): any {
        return this._bundleCache.get(bundleName) || assetManager.getBundle(bundleName);
    }

    /** 切换全局样式/皮肤 */
    public setStyle(style: string): void {
        this._uiCache.forEach(ui => ui.onStyleChanged(style));
    }

    /**
     * 通用广告按钮点击处理
     * @param rewardCallback 广告完成后回调奖励
     * @param failCallback 广告未完成回调
     */
    public showAdAndReward(rewardCallback: () => void, failCallback?: () => void) {
        if (!this.isAdEnabled) {
            // 广告功能未开启，直接给奖励
            rewardCallback && rewardCallback();
            return;
        }
        if (this.isAdVip) {
            // VIP用户直接给奖励
            rewardCallback && rewardCallback();
            return;
        }
        // 跳转广告模块（假设有全局AdManager）
        if (window['AdManager'] && typeof window['AdManager'].showRewardAd === 'function') {
            window['AdManager'].showRewardAd({
                onSuccess: () => { rewardCallback && rewardCallback(); },
                onFail: () => { failCallback && failCallback(); }
            });
        } else {
            // 没有广告模块，直接给奖励
            rewardCallback && rewardCallback();
        }
    }

    /**
     * 通用支付按钮点击处理
     * @param rewardCallback 支付完成后回调奖励
     * @param failCallback 支付未完成回调
     */
    public showPayAndReward(rewardCallback: () => void, failCallback?: () => void) {
        if (!this.isPayEnabled) {
            // 支付功能未开启，直接给奖励
            rewardCallback && rewardCallback();
            return;
        }
        // 跳转支付模块（假设有全局PayManager）
        if (window['PayManager'] && typeof window['PayManager'].showPay === 'function') {
            window['PayManager'].showPay({
                onSuccess: () => { rewardCallback && rewardCallback(); },
                onFail: () => { failCallback && failCallback(); }
            });
        } else {
            // 没有支付模块，直接给奖励
            rewardCallback && rewardCallback();
        }
    }

    /**
     * 通用UI按钮点击处理（广告/支付/普通奖励）
     * @param type 'ad' | 'pay' | 'normal'
     * @param rewardCallback 完成后奖励回调
     * @param failCallback 失败回调
     */
    public handleUIButton(type: 'ad' | 'pay' | 'normal', rewardCallback: () => void, failCallback?: () => void) {
        if (type === 'ad') {
            this.showAdAndReward(rewardCallback, failCallback);
        } else if (type === 'pay') {
            this.showPayAndReward(rewardCallback, failCallback);
        } else {
            // 普通按钮直接奖励
            rewardCallback && rewardCallback();
        }
    }
}
