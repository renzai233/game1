import { _decorator, Component, Node, Label, Button, Sprite, Prefab, instantiate, Layout, view, UITransform, Vec3, Size, ScrollView, Widget, UIOpacity, Color, SpriteFrame, Texture2D } from 'cc';
import { UIBase } from '../../utils/ui/UIBase';
import { UIAnimationManager } from '../../utils/ui/UIAnimationManager';
import { BAG_TAB_TYPE, IBagItemData, BAG_ITEMS_CONFIG } from './BagConfig';
import { BagItemController } from './BagItem';
import { CDM, CurrencyType } from '../../utils/common/CurrencyManager';
import { gameBus } from '../../utils/signal/GameBus';
import { SIGNAL_TYPES } from '../../utils/signal/ISignal';
import { HDM } from '../../utils/data/config/hero/HeroDataManager';
import { loadResSingleAsset } from '../../utils/utils';

const { ccclass, property } = _decorator;

const BAG_POLISH_ASSETS = {
    tabButton: 'textures/ui/skin1/polish/supply_claim_button/texture',
    vaultSlot: 'textures/ui/skin1/polish/vault_slot_frame/texture',
};

/**
 * 背包控制器
 * 负责背包UI逻辑、数据管理、显示等
 */
@ccclass('BagPanelController')
export class BagPanelController extends UIBase {

    @property({ type: Node, tooltip: '全部标签' })
    tabALL: Node = null!;
    @property({ type: Node, tooltip: '碎片标签' })
    tabFragment: Node = null!;
    @property({ type: Node, tooltip: '货币标签' })
    tabCurrency: Node = null!;

    @property({ type: Node, tooltip: '物品列表内容' })
    itemContent: Node = null!;
    @property({ type: Prefab, tooltip: '物品项预制体' })
    itemPrefab: Prefab = null!;

    private _currentTab: BAG_TAB_TYPE = BAG_TAB_TYPE.ALL;
    private _bagItems: Map<string, IBagItemData> = new Map();
    private _itemNodes: Map<string, Node> = new Map(); // 存储背包节点引用
    private _currentLayoutParams: {
        itemWidth: number;
        itemHeight: number;
        spacing: number;
        padding: number;
        scaleRatio: number;
    } | null = null;

    onLoad() {
        // 禁用背景点击关闭
        this.closeOnMask = false;
        this.initBagData();
        this.bindEvents();
        this.setupDynamicLayout();
        this.applyBagPolishLayout();

        // 初始化选项卡UI状态
        this.updateTabUI();

        // 监听语言切换事件
        this.node.on('language-changed', this.onLanguageChanged, this);

        // 监听货币变化事件，实时更新背包显示
        gameBus.on(SIGNAL_TYPES.CURRENCY_CHANGED, this.onCurrencyChanged.bind(this));

        // 监听英雄数据更新事件
        this._onHeroDataUpdatedHandler = this.onHeroDataUpdated.bind(this);
        this._onHeroDataBatchUpdatedHandler = this.onHeroDataBatchUpdated.bind(this);
        gameBus.on(SIGNAL_TYPES.HERO_DATA_UPDATED, this._onHeroDataUpdatedHandler);
        gameBus.on(SIGNAL_TYPES.HERO_DATA_BATCH_UPDATED, this._onHeroDataBatchUpdatedHandler);
    }

    onDestroy() {
        // 清理事件监听
        this.node.off('language-changed', this.onLanguageChanged, this);
        gameBus.off(SIGNAL_TYPES.CURRENCY_CHANGED, this.onCurrencyChanged.bind(this));
        gameBus.off(SIGNAL_TYPES.HERO_DATA_UPDATED, this._onHeroDataUpdatedHandler);
        gameBus.off(SIGNAL_TYPES.HERO_DATA_BATCH_UPDATED, this._onHeroDataBatchUpdatedHandler);

        // 清理节点引用
        this._itemNodes.clear();
    }

    private _onHeroDataUpdatedHandler: Function | null = null;
    private _onHeroDataBatchUpdatedHandler: Function | null = null;

    private onHeroDataUpdated(data: any): void {
        if (!data || !data.heroId) return;
        this.updateBagItemQuantities();
    }

    private onHeroDataBatchUpdated(data: { updates: any[] }): void {
        if (!data || !data.updates) return;
        this.updateBagItemQuantities();
    }

    /**
     * 语言切换事件处理
     */
    public onLanguageChanged(): void {
        this._itemNodes.forEach((node, itemId) => {
            const itemController = node.getComponent(BagItemController);
            if (itemController) {
                itemController.refreshLocalization();
            }
        });
    }

    /**
     * 货币变化事件处理
     */
    private onCurrencyChanged(event: any): void {
        this.updateBagItemQuantities();
    }

    /**
     * 设置动态布局
     */
    private setupDynamicLayout(): void {
        if (!this.itemContent) return;

        // 固定为高密度库存托盘，避免整屏背景里漂着几块小格子。
        const itemCount = 4;
        const spacing = 18; // 间距
        const padding = 18; // 边距
        const screenWidth = view.getVisibleSize().width; // 屏幕宽度
        const containerWidth = Math.min(650, screenWidth - 72);
        const availableWidth = containerWidth - (padding * 2) - (spacing * (itemCount - 1)); // 减去左右边距和间距
        const scaleRatio = 1; // 缩放比例

        // 根据屏幕大小动态计算背包项尺寸
        const itemWidth = Math.floor(availableWidth / itemCount);
        const itemHeight = itemWidth; // 宽高比约为1:1

        // 检查并调整ItemList容器大小
        this.adjustItemListContainerSize(containerWidth, 720);

        // 更新Layout组件配置
        const layout = this.itemContent.getComponent(Layout);
        if (layout) {
            layout.type = Layout.Type.GRID;
            layout.resizeMode = Layout.ResizeMode.CONTAINER;
            layout.startAxis = Layout.AxisDirection.HORIZONTAL;
            layout.constraint = Layout.Constraint.FIXED_COL;
            layout.constraintNum = itemCount;
            layout.cellSize = new Size(itemWidth, itemHeight);
            layout.spacingX = spacing;
            layout.spacingY = 20;
            layout.paddingLeft = padding;
            layout.paddingRight = padding;
            layout.paddingTop = padding;
            layout.paddingBottom = padding;

            // 强制更新布局
            layout.updateLayout();
        }

        // 存储当前布局参数，供BagItemController使用
        this._currentLayoutParams = {
            itemWidth,
            itemHeight,
            spacing,
            padding,
            scaleRatio
        };
    }

    /**
     * 调整ItemList容器大小
     */
    private adjustItemListContainerSize(containerWidth: number, containerHeight: number): void {
        const uiTransform = this.itemContent.getComponent(UITransform);
        if (uiTransform) {
            uiTransform.width = containerWidth;
            uiTransform.height = containerHeight;
        }
    }

    private applyBagPolishLayout(): void {
        const content = this.node.getChildByName('Content');
        if (content) {
            this.disableWidget(content);
            content.active = true;
            content.setPosition(new Vec3(0, -30, 0));
            content.setScale(new Vec3(1, 1, 1));
            this.setNodeSize(content, 690, 900);
            this.setNodeOpacity(content, 255);
        }

        if (this.itemContent) {
            this.disableWidget(this.itemContent);
            this.itemContent.setPosition(new Vec3(0, -48, 0));
            this.itemContent.setScale(new Vec3(1, 1, 1));
            this.setNodeSize(this.itemContent, 650, 720);
            this.setNodeOpacity(this.itemContent, 255);
        }

        const tabBar = content?.getChildByName('TabBar') || this.node.getChildByName('TabBar');
        if (tabBar) {
            tabBar.active = true;
            this.disableWidget(tabBar);
            tabBar.setPosition(new Vec3(0, 426, 0));
            tabBar.setScale(new Vec3(1, 1, 1));
            this.setNodeSize(tabBar, 620, 64);
            this.setNodeOpacity(tabBar, 255);
        }

        this.styleTabNode(this.tabALL, '全部', -208, this._currentTab === BAG_TAB_TYPE.ALL);
        this.styleTabNode(this.tabFragment, '碎片', 0, this._currentTab === BAG_TAB_TYPE.FRAGMENT);
        this.styleTabNode(this.tabCurrency, '资源', 208, this._currentTab === BAG_TAB_TYPE.CURRENCY);
    }

    private styleTabNode(tab: Node, text: string, x: number, selected: boolean): void {
        if (!tab) return;

        tab.active = true;
        this.disableWidget(tab);
        tab.setPosition(new Vec3(x, 0, 0));
        this.setNodeSize(tab, 176, 52);
        this.applySpriteAsset(tab, BAG_POLISH_ASSETS.tabButton, selected ? 255 : 205);

        const label = tab.getComponentInChildren(Label);
        if (label) {
            label.string = text;
            label.fontSize = 22;
            label.lineHeight = 28;
            label.isBold = true;
            label.color = selected ? new Color(255, 236, 154, 255) : new Color(198, 241, 255, 245);
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
            label.overflow = Label.Overflow.SHRINK;
            label.enableOutline = true;
            label.outlineColor = new Color(0, 0, 0, 205);
            label.outlineWidth = selected ? 3 : 2;
            this.setNodeSize(label.node, 148, 34);
            label.node.setPosition(new Vec3(0, 1, 0));
        }

        const button = tab.getComponent(Button);
        if (button) {
            button.interactable = !selected;
            button.transition = Button.Transition.SCALE;
            button.zoomScale = 1.06;
        }

        tab.setScale(new Vec3(selected ? 1.06 : 1, selected ? 1.06 : 1, 1));
    }

    private applySpriteAsset(node: Node, path: string, opacity = 255): void {
        const sprite = node.getComponent(Sprite) || node.addComponent(Sprite);
        sprite.type = Sprite.Type.SIMPLE;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.color = Color.WHITE;
        this.setNodeOpacity(node, opacity);

        loadResSingleAsset(path, (asset) => {
            if (!node || !node.isValid || !asset || !sprite || !sprite.node?.isValid) return;
            const spriteFrame = new SpriteFrame();
            spriteFrame.texture = asset as Texture2D;
            sprite.spriteFrame = spriteFrame;
        }, Texture2D);
    }

    private disableWidget(node: Node): void {
        const widget = node.getComponent(Widget);
        if (widget) widget.enabled = false;
    }

    private setNodeSize(node: Node | null, width: number, height: number): void {
        if (!node) return;
        const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
        transform.setContentSize(width, height);
    }

    private setNodeOpacity(node: Node | null, opacity: number): void {
        if (!node) return;
        const uiOpacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
        uiOpacity.opacity = opacity;
    }

    /**
     * 初始化背包数据
     */
    private initBagData(): void {
        // 清空现有数据
        this._bagItems.clear();
        // 基于配置生成背包项
        BAG_ITEMS_CONFIG.forEach((config) => {

            const itemData: IBagItemData = {
                ...config,
                ownNum: 0, // 初始数量为0，稍后从CurrencyManager获取
                isAvailable: true,
                isShow: true,
            };

            // 同步实时数量从CurrencyManager
            this.syncItemQuantityWithCurrencyManager(itemData);

            this._bagItems.set(config.id, itemData);
        });

        // 动态生成英雄碎片项
        this.generateHeroFragmentItems();
    }

    /**
     * 生成英雄碎片项
     */
    private generateHeroFragmentItems(): void {
        const heroes = HDM.getHeroList();
        console.log("生成英雄碎片项，英雄数量:", heroes.length);
        
        heroes.forEach((hero) => {
            if (!hero || !hero.id || !hero.name) {
                console.warn("跳过无效英雄数据:", hero);
                return;
            }

            const itemData: IBagItemData = {
                id: `${CurrencyType.HeroFragment}${hero.id}`,
                name: `${hero.name}碎片`,
                desc: `${hero.name}升级材料`,
                icon: HDM.getHeroPathById(Number(hero.id), 'portrait') || 'textures/icon/res/coin/spriteFrame',
                resType: CurrencyType.HeroFragment,
                tabType: BAG_TAB_TYPE.FRAGMENT,
                ownNum: 0,
                isAvailable: true,
                isShow: true,
                heroId: Number(hero.id)
            };

            // 同步实时数量从CurrencyManager
            this.syncItemQuantityWithCurrencyManager(itemData);

            this._bagItems.set(itemData.id, itemData);
        });

        console.log("背包项总数:", this._bagItems.size);
    }

    /**
     * 同步物品数量与CurrencyManager
     */
    private syncItemQuantityWithCurrencyManager(itemData: IBagItemData): void {
        try {
            if (itemData.resType === CurrencyType.HeroFragment) {
                // 英雄碎片特殊处理：显示对应英雄的碎片数量
                if (itemData.heroId) {
                    const heroFragments = CDM.getHeroFragmentCount(itemData.heroId);
                    itemData.ownNum = heroFragments;
                } else {
                    itemData.ownNum = 0;
                    console.warn(`[BagPanelController] 英雄碎片项缺少heroId: ${itemData.name}`);
                }
            } else {
                // 其他货币直接从CurrencyManager获取
                const realAmount = CDM.getCurrency(itemData.resType);
                if (realAmount !== null && realAmount !== undefined) {
                    itemData.ownNum = realAmount;
                } else {
                    console.warn(`[BagPanelController] CurrencyManager返回的数量为空: ${itemData.name}`);
                }
            }
        } catch (error) {
            console.error('[BagPanelController] 同步物品数量失败:', error);
        }
    }



    /**
     * 更新背包物品数量显示（监听到货币变化时调用）
     */
    private updateBagItemQuantities(): void {
        if (!this._itemNodes || this._itemNodes.size === 0) {
            return;
        }
        try {
            this._itemNodes.forEach((node) => {
                if (node && node.isValid) {
                    const itemController = node.getComponent(BagItemController);
                    if (itemController) {
                        itemController.refreshLocalization();
                    }
                }
            });
        } catch (error) {
            console.error('[BagPanelController] 更新背包物品数量时出错:', error);
        }
    }

    /**
     * 绑定事件
     */
    private bindEvents(): void {
        // 绑定标签切换事件
        if (this.tabALL) {
            const button = this.tabALL.getComponent(Button);
            if (button) {
                button.node.on(Button.EventType.CLICK, () => this.switchTab(BAG_TAB_TYPE.ALL));
            }
        }

        if (this.tabFragment) {
            const button = this.tabFragment.getComponent(Button);
            if (button) {
                button.node.on(Button.EventType.CLICK, () => this.switchTab(BAG_TAB_TYPE.FRAGMENT));
            }
        }

        if (this.tabCurrency) {
            const button = this.tabCurrency.getComponent(Button);
            if (button) {
                button.node.on(Button.EventType.CLICK, () => this.switchTab(BAG_TAB_TYPE.CURRENCY));
            }
        }
    }

    /**
     * 切换标签
     * @param tab 标签类型
     */
    public switchTab(tab: BAG_TAB_TYPE): void {
        this._currentTab = tab;
        this.updateTabUI();
        this.refreshItemList();
        // 切换标签后重置滚动位置
        this.resetScrollPosition();
    }

    /**
     * 重置滚动位置到顶部
     */
    private resetScrollPosition(): void {
        if (this.itemContent) {
            const scrollView = this.itemContent.getComponent(ScrollView);
            if (scrollView) {
                scrollView.scrollToTop(0.1);
            }
        }
    }

    /**
     * 更新标签UI
     */
    private updateTabUI(): void {
        // 重置所有标签状态
        this.resetTabState(this.tabALL);
        this.resetTabState(this.tabFragment);
        this.resetTabState(this.tabCurrency);

        // 设置当前选中标签
        let currentTab: Node | null = null;
        switch (this._currentTab) {
            case BAG_TAB_TYPE.ALL:
                currentTab = this.tabALL;
                break;
            case BAG_TAB_TYPE.FRAGMENT:
                currentTab = this.tabFragment;
                break;
            case BAG_TAB_TYPE.CURRENCY:
                currentTab = this.tabCurrency;
                break;
        }

        if (currentTab) {
            this.setTabSelectedState(currentTab);
        }
    }

    /**
     * 重置选项卡状态
     */
    private resetTabState(tab: Node): void {
        if (!tab) return;
        const isAll = tab === this.tabALL;
        const isFragment = tab === this.tabFragment;
        this.styleTabNode(tab, isAll ? '全部' : isFragment ? '碎片' : '资源', isAll ? -208 : isFragment ? 0 : 208, false);
        const button = tab.getComponent(Button);
        if (button) { button.interactable = true; }
    }

    /**
     * 设置选项卡选中状态
     */
    private setTabSelectedState(tab: Node): void {
        if (!tab) return;
        const isAll = tab === this.tabALL;
        const isFragment = tab === this.tabFragment;
        this.styleTabNode(tab, isAll ? '全部' : isFragment ? '碎片' : '资源', isAll ? -208 : isFragment ? 0 : 208, true);

        // 禁用按钮交互（避免重复点击）
        const button = tab.getComponent(Button);
        if (button) {
            button.interactable = false;
        }
    }

    /**
     * 刷新背包列表
     */
    public refreshItemList(): void {
        if (!this.itemContent) {
            console.error('[BagPanelController] itemContent未设置');
            return;
        }

        if (!this.itemPrefab) {
            console.error('[BagPanelController] itemPrefab未设置');
            return;
        }

        // 确保背包数据已初始化
        if (this._bagItems.size === 0) {
            console.warn('[BagPanelController] 背包数据为空，重新初始化');
            this.initBagData();
        }

        // 清理旧节点引用
        this._itemNodes.clear();

        // 清空现有背包
        this.itemContent.removeAllChildren();
        let items: IBagItemData[] = [];

        // 获取当前标签的背包
        if (this._currentTab === BAG_TAB_TYPE.ALL) {
            items = Array.from(this._bagItems.values());
        } else {
            items = Array.from(this._bagItems.values()).filter(item => {
                return item.tabType === this._currentTab;
            });
        }
        // 创建背包项
        items.forEach((itemData, index) => {
            try {
                const itemNode = instantiate(this.itemPrefab);
                if (!itemNode) {
                    console.error('[BagPanelController] 创建背包节点失败');
                    return;
                }

                // 添加到容器
                itemNode.parent = this.itemContent;

                // 初始化背包控制器
                const itemController = itemNode.getComponent(BagItemController);
                if (itemController) {
                    // 传递布局参数给背包控制器
                    itemController.init(itemData, this, this._currentLayoutParams);
                    this._itemNodes.set(itemData.id, itemNode); // 存储节点引用
                    // 添加点击事件处理
                    this.addItemClickEvents(itemNode, itemData);
                } else {
                    console.error('[BagPanelController] BagItemController组件未找到');
                }
            } catch (error) {
                console.error(`[BagPanelController] 创建背包项 ${itemData.name} 时出错:`, error);
            }
        });

        this.addEmptySlotPlaceholders(items.length);

        const layout = this.itemContent.getComponent(Layout);
        if (layout) layout.updateLayout();
    }

    private addEmptySlotPlaceholders(actualCount: number): void {
        if (!this.itemContent || !this._currentLayoutParams) return;

        const minSlotCount = 16;
        const columnCount = 4;
        const targetCount = Math.max(minSlotCount, Math.ceil(actualCount / columnCount) * columnCount);
        const emptyCount = Math.max(0, targetCount - actualCount);

        for (let i = 0; i < emptyCount; i++) {
            const slot = new Node(`EmptySlot-${i + 1}`);
            slot.parent = this.itemContent;
            slot.layer = this.itemContent.layer;
            this.setNodeSize(slot, this._currentLayoutParams.itemWidth, this._currentLayoutParams.itemHeight);
            this.applySpriteAsset(slot, BAG_POLISH_ASSETS.vaultSlot, 112);
        }
    }

    /**
     * 添加背包点击事件
     */
    private addItemClickEvents(itemNode: Node, itemData: IBagItemData): void {
        // 为整个背包项添加点击事件
        itemNode.on(Node.EventType.TOUCH_END, () => {
            this.onItemClick(itemData);
        }, this);
    }

    /**
     * 背包项点击事件
     */
    private onItemClick(itemData: IBagItemData): void {
        // 播放点击动画
        if (UIAnimationManager.instance) {
            UIAnimationManager.instance.playButtonClickAnimation(this._itemNodes.get(itemData.id));
        }
        // 可以在这里添加背包详情显示逻辑
        this.showItemDetail(itemData);
    }

    /**
     * 显示背包详情
     */
    private showItemDetail(itemData: IBagItemData): void {
        // TODO: 实现背包详情显示逻辑
    }

    /**
     * UI显示时回调
     */
    protected onShow(data?: any): void {
        super.onShow(data);
        this.setupDynamicLayout();
        this.applyBagPolishLayout();
        this.updateTabUI();

        // 重新同步数据
        this.syncAllBagData();

        // 刷新物品列表
        this.refreshItemList();
        this.applyBagPolishLayout();
    }

    /**
     * 同步所有背包数据
     */
    private syncAllBagData(): void {
        this._bagItems.forEach((itemData, itemId) => {
            this.syncItemQuantityWithCurrencyManager(itemData);
        });
    }

    /**
     * UI隐藏时回调
     */
    protected onHide(): void {
        super.onHide();
    }
} 
