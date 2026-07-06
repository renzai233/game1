import { _decorator, tween, Graphics, Node, Button, Label, ScrollView, Prefab, Layout, Sprite, UITransform, Color, instantiate, Widget, Vec3, view, Size } from 'cc';
import { HeroItemController } from './HeroItemController';
import { IHero as IHeroData } from './IHero';
import { HeroDetailPanel } from './HeroDetailPanel';
import { HeroItemPool } from './HeroItemPool';
import { FullScreenPanel } from 'db://assets/utils/ui/FullScreenPanel';
import { HeroUpgradeNotificationManager } from './HeroUpgradeNotificationManager';
import { UNIT_ATTR } from 'db://assets/utils/data/dict/base/UnitAttrList';
import { CDM } from 'db://assets/utils/common/CurrencyManager';
import { HDM } from '../data/config/hero/HeroDataManager';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';
import { gameBus } from 'db://assets/utils/signal/GameBus';
import { SIGNAL_TYPES } from 'db://assets/utils/signal/ISignal';

const { ccclass, property } = _decorator;

const HERO_PANEL_STAGE_NODE = 'Skin1HeroListStage';
const HERO_PANEL_EMPTY_STATE_NODE = 'Skin1HeroEmptyState';
const HERO_PANEL_WIDTH = 750;
const HERO_PANEL_HEIGHT = 1334;
const HERO_LIST_WIDTH = 700;
const HERO_LIST_HEIGHT = 770;
const HERO_CARD_WIDTH = 220;
const HERO_CARD_HEIGHT = 310;
const HERO_CARD_SPACING_X = 12;
const HERO_CARD_SPACING_Y = 22;
const HERO_LIST_Z_INDEX = 25;
const HERO_TAB_Z_INDEX = 60;

@ccclass('HeroPanelController')
export class HeroPanelController extends FullScreenPanel {
    @property({ type: Node, tooltip: '全部标签' })
    tabAll: Node = null!;
    @property({ type: Node, tooltip: '火标签' })
    tabFire: Node = null!;
    @property({ type: Node, tooltip: '冰标签' })
    tabIce: Node = null!;
    @property({ type: Node, tooltip: '土标签' })
    tabEarth: Node = null!;
    @property({ type: Node, tooltip: '暗标签' })
    tabDark: Node = null!;
    @property({ type: Node, tooltip: '光标签' })
    tabLight: Node = null!;
    @property({ type: Node, tooltip: '英雄列表容器' })
    heroContainer: Node = null!;
    @property({ type: Node, tooltip: '英雄列表内容' })
    heroContent: Node = null!;
    @property({ type: Prefab, tooltip: '英雄项预制体' })
    heroItemPrefab: Prefab = null!;
    @property({ type: Prefab, tooltip: '英雄详情面板预制体' })
    heroDetailPanelPrefab: Prefab = null!;


    private _currentTab: string = UNIT_ATTR.ALL.name;
    private _heroNodes: Map<string, Node> = new Map();
    private _currentDetailPanel: HeroDetailPanel | null = null;
    private _tabs: { node: Node, attr: string }[] = [];
    private _pendingHeroRefreshIds: Set<number> = new Set();
    private _isFlushScheduled: boolean = false;
    private _heroDataById: Map<number, IHeroData> = new Map();
    private _heroIdsForCurrentTab: number[] = [];

    onLoad() {
        super.onLoad();
        this.closeOnMask = false;

        console.log(`[HeroPanelController] onLoad: heroItemPrefab = ${this.heroItemPrefab ? '已设置' : '未设置'}`);
        
        if (this.heroItemPrefab) {
            HeroItemPool.instance.init(this.heroItemPrefab, 20);
            console.log(`[HeroPanelController] HeroItemPool 已初始化`);
        } else {
            console.error(`[HeroPanelController] heroItemPrefab 未设置！请在编辑器中绑定英雄项预制体`);
        }

        this.bindTabEvents();
        this.updateTabUI();
        this.applyHeroPanelLayout();

        this.setupHeroDataEventListeners();

        this.scheduleOnce(() => {
            this.analyzeAllHeroUpgradeStatus();
        }, 0.1);
    }

    private analyzeAllHeroUpgradeStatus(): void {
        let upgradableCount = 0;
        let starUpgradableCount = 0;
        
        const heroes = HDM.getHeroList();
        heroes.forEach((heroData) => {
            const canUpgrade = HDM.canUpgradeHero(heroData.id);
            const canStarUp = HDM.canStarUpHero(heroData.id);
            if (canUpgrade) {
                upgradableCount++;
            }
            if (canStarUp) {
                starUpgradableCount++;
            }
        });
        
        this.broadcastUpgradeStatus(upgradableCount > 0 || starUpgradableCount > 0);
    }

    private broadcastUpgradeStatus(hasUpgradableHeroes: boolean): void {
        const notificationManager = HeroUpgradeNotificationManager.instance;
        if (notificationManager) {
            const heroes = HDM.getHeroList();
            heroes.forEach((heroData) => {
                notificationManager.updateHeroUpgradeStatus(heroData as any);
            });
        }

        this.broadcastToNavigationButton(hasUpgradableHeroes);
        this.broadcastToHeroItems(hasUpgradableHeroes);
        this.broadcastToDetailPanel(hasUpgradableHeroes);
    }

    private broadcastToNavigationButton(hasUpgradableHeroes: boolean): void {
        const navigationButtons = this.node.scene?.getComponentsInChildren('NavigationButtonController');
        if (navigationButtons && navigationButtons.length > 0) {
            navigationButtons.forEach(controller => {
                const navController = controller as any;
                if (navController && navController.updateNotification) {
                    navController.updateNotification(hasUpgradableHeroes ? 1 : 0);
                }
            });
            return;
        }

        this.updateNavigationButtonGraphics(hasUpgradableHeroes);
    }

    private updateNavigationButtonGraphics(hasUpgradableHeroes: boolean): void {
        const navigationButton = this.findNavigationButton();
        
        if (navigationButton) {
            this.updateNotificationDot(navigationButton, hasUpgradableHeroes);
        } else {
            console.warn(`[HeroPanelController] 未找到导航按钮`);
        }
    }

    private findNavigationButton(): Node | null {
        const possibleNames = [
            'NavigationButton', 'HeroButton', 'HeroTab', 'Navigation', 'NavButton',
            'Hero', 'HeroPanel', 'HeroIcon', 'HeroBtn', 'NavHero'
        ];

        for (const name of possibleNames) {
            const button = this.node.scene?.getChildByName(name);
            if (button) return button;
        }

        const canvas = this.node.scene?.getChildByName('Canvas');
        if (canvas) {
            for (const name of possibleNames) {
                const button = canvas.getChildByName(name);
                if (button) return button;
            }
        }

        return null;
    }

    private updateNotificationDot(parentNode: Node, isActive: boolean): void {
        let notificationDot = parentNode.getChildByName('NotificationDot');
        if (!notificationDot) {
            notificationDot = new Node('NotificationDot');
            notificationDot.parent = parentNode;
            notificationDot.setPosition(30, 30, 0);
        }

        let graphics = notificationDot.getComponent(Graphics);
        if (!graphics) {
            graphics = notificationDot.addComponent(Graphics);
        }

        if (isActive) {
            graphics.clear();
            graphics.fillColor = new Color(255, 0, 0, 255);
            graphics.circle(0, 0, 6);
            graphics.fill();
            notificationDot.active = true;

            const originalScale = notificationDot.scale.clone();
            tween(notificationDot)
                .to(0.6, { scale: originalScale.clone().multiplyScalar(1.3) })
                .to(0.6, { scale: originalScale })
                .union()
                .repeatForever()
                .start();
        } else {
            notificationDot.active = false;
        }
    }

    private broadcastToHeroItems(hasUpgradableHeroes: boolean): void {
        this.refreshHeroItemsLight();
    }

    private broadcastToDetailPanel(hasUpgradableHeroes: boolean): void {
        if (this._currentDetailPanel && this._currentDetailPanel.node.active) {
            const detailPanel = this._currentDetailPanel as any;
            if (detailPanel.updateButtonStates) {
                detailPanel.updateButtonStates();
            }
        }
    }

    onDestroy() {
        this._heroNodes.clear();
        this._pendingHeroRefreshIds.clear();
        this._isFlushScheduled = false;
        this._heroDataById.clear();
        this._heroIdsForCurrentTab = [];
        HeroItemPool.instance.clear();
        
        gameBus.off(SIGNAL_TYPES.HERO_DATA_UPDATED, this._onHeroDataUpdatedHandler);
        gameBus.off(SIGNAL_TYPES.HERO_DATA_BATCH_UPDATED, this._onHeroDataBatchUpdatedHandler);
    }

    private setupHeroDataEventListeners(): void {
        this._onHeroDataUpdatedHandler = this.onHeroDataUpdated.bind(this);
        this._onHeroDataBatchUpdatedHandler = this.onHeroDataBatchUpdated.bind(this);
        
        gameBus.on(SIGNAL_TYPES.HERO_DATA_UPDATED, this._onHeroDataUpdatedHandler);
        gameBus.on(SIGNAL_TYPES.HERO_DATA_BATCH_UPDATED, this._onHeroDataBatchUpdatedHandler);
    }

    private _onHeroDataUpdatedHandler: Function | null = null;
    private _onHeroDataBatchUpdatedHandler: Function | null = null;

    private onHeroDataUpdated(data: any): void {
        if (!data || !data.heroId) return;
        this.queueHeroRefresh(data.heroId);
    }

    private onHeroDataBatchUpdated(data: any): void {
        if (!data || !data.updates) return;
        data.updates.forEach((update: any) => {
            if (update && update.id) {
                this.queueHeroRefresh(update.id);
            }
        });
    }

    private queueHeroRefresh(heroId: number): void {
        this._pendingHeroRefreshIds.add(heroId);
        if (this._isFlushScheduled) return;
        this._isFlushScheduled = true;
        this.scheduleOnce(() => {
            this.flushHeroRefreshes();
        }, 0);
    }

    private flushHeroRefreshes(): void {
        this._isFlushScheduled = false;
        if (this._pendingHeroRefreshIds.size === 0) return;

        this._pendingHeroRefreshIds.forEach((heroId) => {
            this.updateHeroDataCache(heroId);
            this.refreshHeroItem(heroId);
            this.refreshDetailPanel(heroId);
        });
        this.rebuildHeroIdsForCurrentTab();
        this._pendingHeroRefreshIds.clear();
    }

    private refreshHeroItem(heroId: number): void {
        const heroNode = this._heroNodes.get(String(heroId));
        if (heroNode) {
            const heroItem = heroNode.getComponent(HeroItemController);
            if (heroItem) {
                heroItem.refreshHeroData();
            }
        }
    }

    private refreshHeroItemsLight(): void {
        this._heroNodes.forEach((node) => {
            if (!node || !node.isValid) return;
            const heroItem = node.getComponent(HeroItemController);
            if (heroItem) {
                heroItem.refreshHeroData();
            }
        });
    }

    private refreshDetailPanel(heroId: number): void {
        if (this._currentDetailPanel) {
            const heroData = HDM.getHeroWithRuntimeData(heroId);
            if (heroData) {
                this._currentDetailPanel.setHeroId(heroId);
            }
        }
    }

    private bindTabEvents(): void {
        this._tabs = [
            { node: this.tabAll, attr: UNIT_ATTR.ALL.name },
            { node: this.tabFire, attr: UNIT_ATTR.FIRE.name },
            { node: this.tabIce, attr: UNIT_ATTR.WATER.name },
            { node: this.tabEarth, attr: UNIT_ATTR.EARTH.name },
            { node: this.tabDark, attr: UNIT_ATTR.DARK.name },
            { node: this.tabLight, attr: UNIT_ATTR.LIGHT.name }
        ];

        this._tabs.forEach(({ node, attr }) => {
            if (node) {
                const button = node.getComponent(Button);
                if (button) {
                    button.node.on(Button.EventType.CLICK, () => this.switchTab(attr));
                }
            }
        });
    }

    public validateLayout(): void {
        console.log(`[HeroPanelController] 开始验证布局设置`);

        if (!this.heroContainer) {
            console.error(`[HeroPanelController] HeroContainer未设置`);
            return;
        }

        const heroContainerTransform = this.heroContainer.getComponent(UITransform);
        if (heroContainerTransform) {
            console.log(`[HeroPanelController] HeroContainer尺寸:`, heroContainerTransform.contentSize);
        }

        if (this.heroContent) {
            const contentTransform = this.heroContent.getComponent(UITransform);
            if (contentTransform) {
                console.log(`[HeroPanelController] Content尺寸:`, contentTransform.contentSize);
            }

            const layout = this.heroContent.getComponent(Layout);
            if (layout) {
                console.log(`[HeroPanelController] Layout配置:`, {
                    type: layout.type,
                    cellSize: layout.cellSize,
                    spacingX: layout.spacingX,
                    spacingY: layout.spacingY,
                    paddingLeft: layout.paddingLeft,
                    paddingRight: layout.paddingRight,
                    paddingTop: layout.paddingTop,
                    paddingBottom: layout.paddingBottom,
                    constraintNum: layout.constraintNum
                });
            }
        } else {
            console.error(`[HeroPanelController] 未找到Content节点`);
        }
    }

    public switchTab(tab: string): void {
        if (this._currentTab === tab) return;
        this._currentTab = tab;
        this.updateTabUI();
        this.refreshHeroList();
        this.scheduleHeroListPostLayout();
    }

    private resetScrollPosition(): void {
        if (this.heroContainer) {
            const scrollView = this.heroContainer.getComponent(ScrollView);
            if (scrollView) {
                scrollView.scrollToTop(0);
            }
        }
    }

    private updateTabUI(): void {
        this._tabs.forEach(({ node, attr }) => {
            if (node) {
                const isSelected = this._currentTab === attr;
                this.setTabState(node, isSelected);
            }
        });
    }

    private setTabState(tab: Node, isSelected: boolean): void {
        const sprite = tab.getComponent(Sprite);
        const label = tab.getComponentInChildren(Label);
        const button = tab.getComponent(Button);

        if (button) button.interactable = !isSelected;
        if (sprite) sprite.color.set(isSelected ? 255 : 255, isSelected ? 255 : 255, isSelected ? 0 : 128, 255);
        if (label) {
            let color = isSelected ? new Color(255, 255, 255, 255) : new Color(128, 128, 128, 255);
            label.color = color;
        }
        tab.setScale(isSelected ? 1.1 : 1, isSelected ? 1.1 : 1, 1);
    }

    private rebuildHeroDataSource(): void {
        const heroConfigs = HDM.getHeroList();
        this._heroDataById.clear();
        heroConfigs.forEach((heroConfig) => {
            const heroData = this.buildHeroData(heroConfig as any);
            this._heroDataById.set(Number(heroConfig.id), heroData);
        });
        this.rebuildHeroIdsForCurrentTab();
    }

    private rebuildHeroIdsForCurrentTab(): void {
        const allHeroes = Array.from(this._heroDataById.values());
        const filteredHeroes = this._currentTab === UNIT_ATTR.ALL.name
            ? allHeroes
            : allHeroes.filter(hero => this.isHeroInCurrentTab(hero));
        const sortedHeroes = this.sortHeroesByPriority(filteredHeroes);
        this._heroIdsForCurrentTab = sortedHeroes.map(hero => Number(hero.id));
    }

    private buildHeroData(heroConfig: IHeroData): IHeroData {
        const runtimeData = HDM.getHeroRuntimeData(Number(heroConfig.id));
        const hero = { ...heroConfig } as any as IHeroData;
        if (runtimeData) {
            hero.level = runtimeData.level;
            hero.star = runtimeData.star;
            hero.exp = runtimeData.exp;
            hero.fragmentCount = runtimeData.fragment;
            hero.isDeployed = runtimeData.deployed;
            hero.status = runtimeData.deployed ? 'deployed' : 'unlocked';
        } else {
            hero.status = 'locked';
            hero.isDeployed = false;
        }
        return hero;
    }

    private updateHeroDataCache(heroId: number): void {
        const heroConfig = HDM.getHeroById(heroId);
        if (!heroConfig) return;
        const heroData = this.buildHeroData(heroConfig as any);
        this._heroDataById.set(heroId, heroData);
    }

    private getHeroesForCurrentTab(): IHeroData[] {
        if (this._heroDataById.size === 0) {
            this.rebuildHeroDataSource();
        }
        if (this._heroIdsForCurrentTab.length === 0) {
            this.rebuildHeroIdsForCurrentTab();
        }

        const heroes = this._heroIdsForCurrentTab
            .map(id => this._heroDataById.get(id))
            .filter((hero): hero is IHeroData => !!hero);

        console.log(`[HeroPanelController] 获取英雄配置列表，共 ${this._heroDataById.size} 个英雄`);
        console.log(`[HeroPanelController] 过滤后的英雄列表，共 ${heroes.length} 个英雄`);
        return heroes;
    }

    private isHeroInCurrentTab(hero: IHeroData): boolean {
        if (!hero.attr) return false;
        
        if (typeof hero.attr === 'string') {
            const attrKey = (hero.attr as string).replace('UNIT_ATTR_', '');
            return UNIT_ATTR[attrKey]?.name === this._currentTab;
        }
        return hero.attr.name === this._currentTab;
    }

    private sortHeroesByPriority(heroes: IHeroData[]): IHeroData[] {
        return heroes.sort((a, b) => {
            if (a.status !== b.status) {
                return a.status === 'locked' ? 1 : -1;
            }

            if (a.status !== 'locked' && b.status !== 'locked') {
                const rarityOrder: Record<string, number> = {
                    ssr: 6,
                    sr: 5,
                    legendary: 4,
                    epic: 3,
                    rare: 2,
                    common: 1
                };
                const rarityDiff = (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);

                if (rarityDiff !== 0) {
                    return rarityDiff;
                }

                const levelA = a.level || HDM.getHeroRuntimeData(Number(a.id))?.level || 1;
                const levelB = b.level || HDM.getHeroRuntimeData(Number(b.id))?.level || 1;
                const levelDiff = levelB - levelA;
                if (levelDiff !== 0) {
                    return levelDiff;
                }

                const starA = a.star || HDM.getHeroRuntimeData(Number(a.id))?.star || 1;
                const starB = b.star || HDM.getHeroRuntimeData(Number(b.id))?.star || 1;
                return starB - starA;
            }

            return 0;
        });
    }

    public refreshHeroList(): void {
        if (!this.heroContainer || !this.heroItemPrefab) {
            console.error('[HeroPanelController] 缺少必要组件');
            return;
        }

        if (!this.heroContent) {
            console.error('[HeroPanelController] 未找到Content节点');
            return;
        }

        this.rebuildHeroDataSource();
        this.clearHeroNodes();

        const heroes = this.getHeroesForCurrentTab() as any[];
        console.log(`[HeroPanelController] 开始渲染英雄列表，共 ${heroes.length} 个英雄`);
        this.updateHeroListLayout(heroes.length);
        this.updateEmptyState(heroes.length === 0);

        heroes.forEach((heroData: any, index) => {
            console.log(`[HeroPanelController] 渲染英雄 ${index + 1}/${heroes.length}: ${heroData.name} (ID: ${heroData.id})`);
            
            const heroNode = HeroItemPool.instance.getItem();
            heroNode.name = `HeroItem_${heroData.id}`;
            heroNode.parent = this.heroContent;
            heroNode.active = true;

            const heroItemController = heroNode.getComponent(HeroItemController);
            if (heroItemController) {
                heroItemController.init(heroData);
                this._heroNodes.set(heroData.id, heroNode);
                this.bindHeroClickEvent(heroNode, heroData);
            } else {
                console.error(`[HeroPanelController] HeroItemController组件未找到: ${heroData.name}`);
            }
        });

        this.forceHeroContentLayout();
        this.scheduleHeroListPostLayout();
        
        console.log(`[HeroPanelController] 英雄列表渲染完成`);
    }

    private clearHeroNodes(): void {
        this._heroNodes.forEach((node) => {
            if (node && node.isValid) {
                HeroItemPool.instance.returnItem(node);
            }
        });
        this._heroNodes.clear();
        this.heroContent?.removeAllChildren();
    }

    private bindHeroClickEvent(heroNode: Node, heroData: IHeroData): void {
        heroNode.off(Node.EventType.TOUCH_END);

        let clickTimer: number | null = null;
        heroNode.on(Node.EventType.TOUCH_END, () => {
            if (clickTimer !== null) {
                return;
            }

            clickTimer = setTimeout(() => {
                clickTimer = null;
                this.onHeroClick(heroData);
            }, 100);
        }, this);
    }

    private onHeroClick(heroData: IHeroData): void {
        if (this._currentDetailPanel && this._currentDetailPanel.node.active) {
            return;
        }
        this.showHeroDetail(heroData.id);
    }

    public showHeroDetail(heroId: string): void {
        const heroData = HDM.getHeroById(Number(heroId));
        if (!heroData) {
            console.error(`英雄不存在: ${heroId}`);
            return;
        }

        try {
            if (this._currentDetailPanel && this._currentDetailPanel.node && this._currentDetailPanel.node.isValid) {
                this._currentDetailPanel.setHeroPanelController(this);
                void this._currentDetailPanel.show(Number(heroId));
                return;
            }

            const detailPanelNode = instantiate(this.heroDetailPanelPrefab);
            detailPanelNode.parent = this.node;
            detailPanelNode.setPosition(0, 0, 0);
            detailPanelNode.setScale(1, 1, 1);
            const detailPanel = detailPanelNode.getComponent(HeroDetailPanel);
            
            if (detailPanel) {
                this._currentDetailPanel = detailPanel;
                detailPanel.setHeroPanelController(this);
                void detailPanel.show(Number(heroId));
            } else {
                console.error('[HeroPanelController] HeroDetailPanel组件未找到');
                detailPanelNode.destroy();
            }
        } catch (error) {
            console.error('[HeroPanelController] 显示英雄详情失败:', error);
        }
    }

    private notifyResourceChanged(): void {
        try {
            if (gameBus) {
                gameBus.emit('global-update');
            }
        } catch (error) {
            console.warn('[HeroPanelController] 无法发送资源更新事件:', error);
        }
    }

    public async starUpHero(heroId: string): Promise<boolean> {
        const heroData = HDM.getHeroById(Number(heroId));
        if (!heroData || !HDM.canStarUpHero(Number(heroData.id))) {
            console.warn(`英雄无法升星: ${heroId}`);
            return false;
        }

        if (!this.checkStarUpResources(heroData as any)) {
            console.warn(`升星资源不足: ${heroId}`);
            return false;
        }

        const runtimeData = HDM.getHeroRuntimeData(Number(heroData.id));
        const currentStar = runtimeData?.star || 1;
        const nextStar = Math.min(currentStar + 1, heroData.max_star || 99);

        if (!this.consumeStarUpResources(heroData as any)) {
            console.warn(`升星资源扣除失败: ${heroId}`);
            return false;
        }

        await HDM.updateHero(Number(heroData.id), {
            star: nextStar,
            lastUpgradeTime: Date.now(),
        });

        heroData.star = nextStar;
        this.refreshHeroList();
        this.analyzeAllHeroUpgradeStatus();
        this.notifyResourceChanged();
        return true;
    }

    private checkStarUpResources(heroData: IHeroData): boolean {
        const runtimeData = HDM.getHeroRuntimeData(Number(heroData.id));
        const currentStar = runtimeData?.star || 1;
        const requiredFragments = HDM.calculateStarUpFragments(currentStar);

        const currentFragments = CDM.getHeroFragmentCount(Number(heroData.id));
        if (currentFragments < requiredFragments) {
            console.warn(`[HeroPanelController] 英雄专属碎片不足: 需要 ${requiredFragments}，当前 ${currentFragments}`);
            return false;
        }

        return true;
    }

    private consumeStarUpResources(heroData: IHeroData): boolean {
        const runtimeData = HDM.getHeroRuntimeData(Number(heroData.id));
        const currentStar = runtimeData?.star || 1;
        const requiredFragments = HDM.calculateStarUpFragments(currentStar);
        const success = CDM.subtractHeroFragmentCount(Number(heroData.id), requiredFragments, `hero_starup_${heroData.id}`);
        if (!success) {
            return false;
        }

        const remain = CDM.getHeroFragmentCount(Number(heroData.id));
        heroData.fragmentCount = remain;
        return true;
    }

    public getAllHeroes(): IHeroData[] {
        if (this._heroDataById.size === 0) {
            this.rebuildHeroDataSource();
        }
        return Array.from(this._heroDataById.values());
    }

    public onShow(data?: any): void {
        this.applyHeroPanelLayout();
        this.refreshHeroList();
        this.applyHeroPanelLayout();
        this.scheduleHeroListPostLayout();
    }

    protected onResize(): void {
        this.applyHeroPanelLayout();
    }

    public onHide(): void {
        this.clearHeroNodes();
    }

    private applyHeroPanelLayout(): void {
        if (!this.node || !this.node.isValid) return;

        this.refreshFullScreenLayout();

        const screenSize = this.getPanelSize();
        this.ensureTransform(this.node, screenSize.width, screenSize.height);
        this.disableWidget(this.node);
        this.node.setPosition(0, 0, 0);
        this.node.setScale(1, 1, 1);

        this.ensureListStage(screenSize.width);
        this.layoutTabs();
        this.updateHeroListLayout(this._heroIdsForCurrentTab.length);
        this.bringTabsToFront();
    }

    private getPanelSize(): { width: number; height: number } {
        const visibleSize = view.getVisibleSize();
        return {
            width: EDM.config?.viewWidth || visibleSize.width || HERO_PANEL_WIDTH,
            height: EDM.config?.viewHeight || visibleSize.height || HERO_PANEL_HEIGHT,
        };
    }

    private ensureTransform(node: Node, width: number, height: number): UITransform {
        const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
        transform.setContentSize(width, height);
        return transform;
    }

    private disableWidget(node: Node): void {
        const widget = node.getComponent(Widget);
        if (widget) widget.enabled = false;
    }

    private ensureListStage(panelWidth: number): void {
        const stageWidth = Math.min(panelWidth - 42, HERO_LIST_WIDTH + 18);
        const stage = this.ensureLayoutNode(this.node, HERO_PANEL_STAGE_NODE, stageWidth, HERO_LIST_HEIGHT + 30, new Vec3(0, -12, 0));
        stage.setSiblingIndex(2);
        const graphics = stage.getComponent(Graphics) || stage.addComponent(Graphics);
        graphics.clear();
        graphics.fillColor = new Color(7, 12, 33, 174);
        graphics.strokeColor = new Color(38, 225, 255, 165);
        graphics.lineWidth = 2;
        graphics.roundRect(-stageWidth / 2, -(HERO_LIST_HEIGHT + 30) / 2, stageWidth, HERO_LIST_HEIGHT + 30, 24);
        graphics.fill();
        graphics.stroke();
    }

    private layoutTabs(): void {
        const tabContainer = this.tabAll?.parent || this.node.getChildByName('TabContainer');
        if (!tabContainer) return;

        this.disableWidget(tabContainer);
        const tabLayout = tabContainer.getComponent(Layout);
        if (tabLayout) tabLayout.enabled = false;
        this.ensureTransform(tabContainer, 650, 82);
        tabContainer.setPosition(0, 428, 0);
        tabContainer.setScale(0.9, 0.9, 1);
        tabContainer.setSiblingIndex(HERO_TAB_Z_INDEX);

        this._tabs.forEach(({ node }, index) => {
            if (!node) return;
            this.ensureTransform(node, 72, 72);
            node.setPosition(-225 + index * 90, 0, 0);
        });
    }

    private bringTabsToFront(): void {
        const tabContainer = this.tabAll?.parent || this.node.getChildByName('TabContainer');
        if (tabContainer) {
            tabContainer.setSiblingIndex(HERO_TAB_Z_INDEX);
        }
    }

    private updateHeroListLayout(heroCount: number): void {
        if (!this.heroContainer || !this.heroContent) return;

        this.disableWidget(this.heroContainer);
        this.ensureTransform(this.heroContainer, HERO_LIST_WIDTH, HERO_LIST_HEIGHT);
        this.heroContainer.setPosition(0, -8, 0);
        this.heroContainer.setScale(1, 1, 1);
        this.heroContainer.setSiblingIndex(HERO_LIST_Z_INDEX);

        const viewportNode = this.heroContainer.getChildByName('View');
        if (viewportNode) {
            this.ensureTransform(viewportNode, HERO_LIST_WIDTH, HERO_LIST_HEIGHT);
            viewportNode.setPosition(0, 0, 0);
        }

        const rows = Math.max(1, Math.ceil(heroCount / 3));
        const contentHeight = Math.max(
            HERO_LIST_HEIGHT,
            rows * HERO_CARD_HEIGHT + Math.max(0, rows - 1) * HERO_CARD_SPACING_Y + 44
        );
        const contentTransform = this.ensureTransform(this.heroContent, HERO_LIST_WIDTH - 10, contentHeight);
        contentTransform.setAnchorPoint(0.5, 1);
        this.heroContent.setPosition(0, HERO_LIST_HEIGHT / 2 - 20, 0);
        this.heroContent.setScale(1, 1, 1);

        const layout = this.heroContent.getComponent(Layout);
        if (layout) {
            layout.type = Layout.Type.GRID;
            layout.resizeMode = Layout.ResizeMode.CONTAINER;
            layout.cellSize = new Size(HERO_CARD_WIDTH, HERO_CARD_HEIGHT);
            layout.spacingX = HERO_CARD_SPACING_X;
            layout.spacingY = HERO_CARD_SPACING_Y;
            layout.paddingLeft = 4;
            layout.paddingRight = 4;
            layout.paddingTop = 22;
            layout.paddingBottom = 22;
            layout.constraint = Layout.Constraint.FIXED_COL;
            layout.constraintNum = 3;
        }

        this.bringTabsToFront();
    }

    private forceHeroContentLayout(): void {
        if (!this.heroContent) return;

        this.heroContent.children.forEach((child) => {
            if (!child || !child.isValid) return;
            this.disableWidget(child);
            this.ensureTransform(child, HERO_CARD_WIDTH, HERO_CARD_HEIGHT);
            child.setScale(1, 1, 1);
        });

        const layout = this.heroContent.getComponent(Layout);
        if (layout) {
            layout.updateLayout(true);
        }
        this.bringTabsToFront();
    }

    private scheduleHeroListPostLayout(): void {
        this.scheduleOnce(() => {
            this.forceHeroContentLayout();
            this.resetScrollPosition();
            this.bringTabsToFront();
        }, 0);
    }

    private updateEmptyState(isEmpty: boolean): void {
        const emptyState = this.ensureLayoutNode(this.node, HERO_PANEL_EMPTY_STATE_NODE, 560, 210, new Vec3(0, 26, 0));
        emptyState.active = isEmpty;
        emptyState.setSiblingIndex(35);
        if (!isEmpty) return;

        this.drawPanel(emptyState, 560, 210, new Color(9, 14, 35, 238), new Color(71, 226, 255, 210), 24, 3);
        this.ensureLabel(emptyState, 'EmptyTitle', '守卫档案待同步', 430, 42, 0, 54, 29, new Color(255, 234, 154, 255), true);
        this.ensureLabel(emptyState, 'EmptySub', '补给获取碎片后将在这里列阵', 440, 34, 0, 8, 20, new Color(196, 236, 255, 245));
        this.ensureLabel(emptyState, 'EmptyHint', '属性筛选已就绪', 320, 30, 0, -42, 18, new Color(155, 201, 229, 230));
    }

    private ensureLayoutNode(parent: Node, name: string, width: number, height: number, position: Vec3): Node {
        let node = parent.getChildByName(name);
        if (!node) {
            node = new Node(name);
            node.parent = parent;
        }
        node.active = true;
        this.ensureTransform(node, width, height);
        node.setPosition(position);
        return node;
    }

    private drawPanel(node: Node, width: number, height: number, fill: Color, stroke: Color, radius: number, lineWidth: number): void {
        this.ensureTransform(node, width, height);
        const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
        graphics.clear();
        graphics.fillColor = fill;
        graphics.strokeColor = stroke;
        graphics.lineWidth = lineWidth;
        graphics.roundRect(-width / 2, -height / 2, width, height, radius);
        graphics.fill();
        graphics.stroke();
    }

    private ensureLabel(parent: Node, name: string, text: string, width: number, height: number, x: number, y: number, fontSize: number, color: Color, bold: boolean = false): Label {
        const node = this.ensureLayoutNode(parent, name, width, height, new Vec3(x, y, 0));
        const label = node.getComponent(Label) || node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = Math.round(fontSize * 1.15);
        label.color = color;
        label.isBold = bold;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableOutline = true;
        label.outlineColor = new Color(0, 0, 0, 220);
        label.outlineWidth = bold ? 3 : 2;
        return label;
    }
}
