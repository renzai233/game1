import { _decorator, Component, Node, Label, Sprite, Button, Prefab, instantiate, Color, Vec3, tween, UITransform, ScrollView, Layout } from 'cc';

import { ILotterySingleDrawResult } from './LotteryTypes';
import { ShopManager } from '../../utils/shop';
import { SIGNAL_TYPES } from '../../utils/signal/ISignal';
import { gameBus } from '../../utils/signal/GameBus';
import { ToastPanel } from '../../utils/common/ToastPanel';
import { APM } from '../../utils/common/AudioPlayManager';
import { EDM } from '../../utils/data/env/ConfigManager';
import { HDM } from '../../utils/data/config/hero/HeroDataManager';
import { CurrencyDataManager, CurrencyType } from '../../utils/common/CurrencyManager';
import { ItemType } from '../material/ItemTypes';
import { Skin1UIPolish } from '../../utils/ui/skin1/Skin1UIPolish';
import { UIManager } from '../../utils/ui/UIManager';
import { UIGroup } from '../../utils/ui/UIBase';
import { popupManager } from '../../script/ui/popup/PopupManager';


const { ccclass, property } = _decorator;

interface ILotteryGoodsUI {
    root: Node;
    icon: Sprite;
    nameLabel: Label;
    descLabel: Label;
    costLabel: Label;
    singleBtn: Button;
    multiBtn: Button;
    singleBtnNode: Node;
    multiBtnNode: Node;
    singleBtnCallback?: () => void;
    multiBtnCallback?: () => void;
}

interface IRewardItemUI {
    root: Node;
    icon: Sprite;
    nameLabel: Label;
    quantityLabel: Label;
    rarityLabel: Label;
}

@ccclass('LotteryUI')
export class LotteryUI extends Component {

    @property(Node)
    private lotteryList: Node = null!;

    @property(Node)
    private rewardPanel: Node = null!;

    @property(Prefab)
    private rewardItemPrefab: Prefab = null!;

    @property(Button)
    private drawSingleBtn: Button = null!;
    @property(Button)
    private drawMultiBtn: Button = null!;

    @property(Node)
    private hideLotteryNode: Node = null!;
    @property(Button)
    private drawHideBtn: Button = null!;

    @property(Node)
    private rewardScrollView: Node = null!;

    @property(Node)
    private rewardContentList: Node = null!;

    private shopManager: ShopManager | null = null;
    private lotteryGoodsUIs: Map<number, ILotteryGoodsUI> = new Map();
    private isInitialized: boolean = false;
    private buttonCooldowns: Map<number, boolean> = new Map();
    private currentRewardItems: IRewardItemUI[] = [];
    private drawHideBtnCallback?: () => void;
    private drawSingleBtnCallback?: () => void;
    private drawMultiBtnCallback?: () => void;

    onLoad(): void {
        this.initializeLotteryUI();
        Skin1UIPolish.applyPanel(this.node);
    }


    private initializeLotteryUI(): void {
        if (this.isInitialized) return;

        console.log('[LotteryUI] 初始化抽奖UI');

        this.shopManager = ShopManager.getInstance();
        if (!this.shopManager) {
            console.error('[LotteryUI] 无法获取ShopManager实例');
            return;
        }

        this.initLotteryGoodsUIs();
        this.setupEventListeners();
        this.setupDrawButtons();

        this.isInitialized = true;
        console.log('[LotteryUI] 初始化完成');
    }

    private initLotteryGoodsUIs(): void {
        const lotteryGoodsIds = [7, 8, 9];

        for (const id of lotteryGoodsIds) {
            const nodeNames = [
                `LotteryGood-${id}`,
                `LotteryGood${id}`,
                `LotteryGood_0${id}`
            ];

            let goodsNode: Node | null = null;
            for (const name of nodeNames) {
                goodsNode = this.lotteryList.getChildByName(name);
                if (goodsNode) break;
            }

            if (!goodsNode) {
                console.warn(`[LotteryUI] 未找到抽奖商品节点: ${id}`);
                continue;
            }

            const goodsUI = this.createLotteryGoodsUI(goodsNode, id);
            if (goodsUI) {
                this.lotteryGoodsUIs.set(id, goodsUI);
                this.setupLotteryGoodsEvents(id, goodsUI);
            }
        }
    }

    private createLotteryGoodsUI(goodsNode: Node, id: number): ILotteryGoodsUI | null {
        try {
            const iconNode = goodsNode.getChildByName('Icon');
            const singleBtnNode = goodsNode.getChildByName('SingleBtn');
            const multiBtnNode = goodsNode.getChildByName('MultiBtn');

            const goodsUI: ILotteryGoodsUI = {
                root: goodsNode,
                icon: iconNode?.getComponent(Sprite) || null!,
                nameLabel: goodsNode.getChildByName('Name')?.getComponent(Label) || null!,
                descLabel: goodsNode.getChildByName('Desc')?.getComponent(Label) || null!,
                costLabel: goodsNode.getChildByName('Cost')?.getComponent(Label) || null!,
                singleBtn: singleBtnNode?.getComponent(Button) || null!,
                multiBtn: multiBtnNode?.getComponent(Button) || null!,
                singleBtnNode: singleBtnNode || new Node(),
                multiBtnNode: multiBtnNode || new Node()
            };

            return goodsUI;
        } catch (error) {
            console.error(`[LotteryUI] 创建抽奖商品 ${id} UI引用失败:`, error);
            return null;
        }
    }

    private setupLotteryGoodsEvents(id: number, goodsUI: ILotteryGoodsUI): void {
        this.buttonCooldowns.set(id, false);

        if (goodsUI.singleBtn) {
            goodsUI.singleBtnCallback = () => {
                if (this.buttonCooldowns.get(id)) return;

                this.playButtonClickEffect(goodsUI.singleBtnNode);
                this.playSound('click');

                this.buttonCooldowns.set(id, true);
                setTimeout(() => {
                    this.buttonCooldowns.set(id, false);
                }, 500);

                this.performLottery(id, false);
            };
            goodsUI.singleBtn.node.on(Button.EventType.CLICK, goodsUI.singleBtnCallback, this);
        }

        if (goodsUI.multiBtn) {
            goodsUI.multiBtnCallback = () => {
                if (this.buttonCooldowns.get(id)) return;

                this.playButtonClickEffect(goodsUI.multiBtnNode);
                this.playSound('click');

                this.buttonCooldowns.set(id, true);
                setTimeout(() => {
                    this.buttonCooldowns.set(id, false);
                }, 500);

                this.performLottery(id, true);
            };
            goodsUI.multiBtn.node.on(Button.EventType.CLICK, goodsUI.multiBtnCallback, this);
        }
    }

    private setupDrawButtons(): void {
        console.log('[LotteryUI] setupDrawButtons 开始设置按钮');

        if (this.hideLotteryNode) {
            this.hideLotteryNode.active = EDM.isDev();
            console.log('[LotteryUI] hideLotteryNode 已设置，开发模式:', EDM.isDev());
        } else {
            console.warn('[LotteryUI] hideLotteryNode 未绑定');
        }

        if (this.drawHideBtn) {
            console.log('[LotteryUI] drawHideBtn 已绑定');
            this.drawHideBtnCallback = () => {
                console.log('[LotteryUI] drawHide按钮被点击');
                this.performHeroFragmentDraw(20, 1, CurrencyType.Gold, 100);
            };
            this.drawHideBtn.node.on(Button.EventType.CLICK, this.drawHideBtnCallback, this);
        } else {
            console.warn('[LotteryUI] drawHideBtn 未绑定');
        }

        if (this.drawSingleBtn) {
            console.log('[LotteryUI] drawSingleBtn 已绑定');
            this.drawSingleBtnCallback = () => {
                console.log('[LotteryUI] drawSingle按钮被点击');
                this.performHeroFragmentDraw(20, 1, CurrencyType.Gem, 100);
            };
            this.drawSingleBtn.node.on(Button.EventType.CLICK, this.drawSingleBtnCallback, this);
        } else {
            console.warn('[LotteryUI] drawSingleBtn 未绑定');
        }

        if (this.drawMultiBtn) {
            console.log('[LotteryUI] drawMultiBtn 已绑定');
            this.drawMultiBtnCallback = () => {
                console.log('[LotteryUI] drawMulti按钮被点击');
                this.performHeroFragmentDraw(5, 20, CurrencyType.Gem, 388);
            };
            this.drawMultiBtn.node.on(Button.EventType.CLICK, this.drawMultiBtnCallback, this);
        } else {
            console.warn('[LotteryUI] drawMultiBtn 未绑定');
        }
    }

    private performHeroFragmentDraw(drawCount: number, fragmentsPerDraw: number, currencyType: CurrencyType, totalCost: number): void {
        try {
            const CDM = CurrencyDataManager.instance();
            console.log(`[LotteryUI] 尝试绘制 ${drawCount} 个英雄碎片，每个碎片 ${fragmentsPerDraw} 个，消耗 ${totalCost} ${currencyType}`);
            
            const currentCurrency = CDM.getCurrency(currencyType) as number;
            
            if (currentCurrency < totalCost) {
                const currencyName = currencyType === CurrencyType.Gold ? '金币' : '宝石';
                this.showToast(`${currencyName}不足！`);
                return;
            }

            CDM.subtractCurrency(currencyType, totalCost, 'hero_fragment_lottery');

            const draws: ILotterySingleDrawResult[] = [];
            const heroConfigs = HDM.getHeroList();
            
            if (heroConfigs.length === 0) {
                this.showToast('英雄数据未加载！');
                return;
            }

            const totalFragments = drawCount * fragmentsPerDraw;
            const selectedHeroes = this.selectRandomHeroes(heroConfigs, drawCount);
            
            const fragmentDistribution = this.distributeFragments(totalFragments, selectedHeroes.length);
            
            for (let i = 0; i < selectedHeroes.length; i++) {
                const hero = selectedHeroes[i];
                const heroId = Number(hero.id);
                const fragmentCount = fragmentDistribution[i];
                
                const draw: ILotterySingleDrawResult = {
                    item: {
                        id: heroId,
                        itemId: `hero_fragment_${heroId}`,
                        name: hero.name,
                        description: '',
                        icon: '',
                        rarity: hero.rarity as any,
                        type: ItemType.HERO_FRAGMENT,
                        heroId: heroId,
                        fragmentsNeeded: 100,
                        quality: undefined,
                        iconAtlas: undefined,
                        maxStack: 9999,
                        sellPrice: 0,
                        buyPrice: 0,
                        isTradable: false,
                        isDestroyable: true,
                        isQuestItem: false,
                        requiredLevel: 1
                    },
                    quantity: fragmentCount,
                    rarity: hero.rarity as any,
                    isGuaranteed: false,
                    poolId: 'hero_fragment_pool'
                };
                
                draws.push(draw);
            }

            const actualTotal = draws.reduce((sum, d) => sum + d.quantity, 0);
            console.log(`[LotteryUI] 预期碎片总数: ${totalFragments}, 实际碎片总数: ${actualTotal}`);

            this.syncHeroFragments(draws);

            gameBus.emit(SIGNAL_TYPES.SHOP_LOTTERY_SUCCESS, {
                draws: draws,
                totalCost: { itemId: currencyType === CurrencyType.Gold ? 200 : 100, quantity: totalCost }
            });

            this.playSound('lottery');
            this.showToast('抽奖成功！');
        } catch (error) {
            console.error('[LotteryUI] performHeroFragmentDraw 错误:', error);
            this.showToast('抽奖失败，请重试！');
        }
    }

    private selectRandomHeroes(heroes: any[], count: number): any[] {
        const shuffled = [...heroes].sort(() => Math.random() - 0.5);
        const selectedCount = Math.min(count, heroes.length);
        return shuffled.slice(0, selectedCount);
    }

    private distributeFragments(total: number, count: number): number[] {
        if (count <= 0) return [];
        if (count === 1) return [total];

        const distribution = new Array(count).fill(0);
        let remaining = total;

        for (let i = 0; i < count - 1; i++) {
            const max = remaining - (count - i - 1);
            const fragmentCount = Math.floor(Math.random() * max) + 1;
            distribution[i] = fragmentCount;
            remaining -= fragmentCount;
        }

        distribution[count - 1] = remaining;

        return distribution;
    }

    private syncHeroFragments(draws: ILotterySingleDrawResult[]): void {
        try {
            const fragmentUpdates: Array<{ heroId: number, updates: { fragment: number } }> = [];

            for (const draw of draws) {
                const heroId = draw.item.id;
                const newFragments = draw.quantity;
                
                const currentFragments = HDM.getHeroFragmentCount(heroId);
                const totalFragments = currentFragments + newFragments;

                console.log(`[LotteryUI] 英雄${heroId}: 当前${currentFragments} + 新增${newFragments} = 总计${totalFragments}`);

                const updates = { fragment: totalFragments };
                fragmentUpdates.push({ heroId, updates });
            }

            HDM.updateHeroesBatch(fragmentUpdates.map(u => ({ heroId: u.heroId, updates: u.updates })));

            console.log(`[LotteryUI] 已同步 ${draws.length} 个英雄碎片到本地缓存`);
        } catch (error) {
            console.error('[LotteryUI] syncHeroFragments 错误:', error);
        }
    }

    private performLottery(id: number, isMulti: boolean): void {
        const result = this.shopManager?.lottery(id);

        if (result?.success) {
            this.playSound('lottery');
            this.showToast('抽奖成功！');
            this.updateLotteryGoodsUI(id);
        } else if (result?.message) {
            this.showToast(result.message);
        }
    }

    private updateLotteryGoodsUI(id: number): void {
        if (!this.shopManager || !this.isInitialized) return;

        const goodsUI = this.lotteryGoodsUIs.get(id);
        if (!goodsUI) return;

        const goodsList = this.shopManager.getGoodsList();
        const goods = goodsList.find(g => g.id === id);

        if (!goods) return;

        if (goodsUI.nameLabel) goodsUI.nameLabel.string = goods.name;
        if (goodsUI.descLabel) goodsUI.descLabel.string = goods.description;

        goodsUI.singleBtnNode.active = (id === 7);
        goodsUI.multiBtnNode.active = (id === 8 || id === 9);
    }

    private setupEventListeners(): void {
        gameBus.on(SIGNAL_TYPES.SHOP_LOTTERY_SUCCESS, this.onLotterySuccess.bind(this));
    }

    private onLotterySuccess(data: any): void {
        try {
            console.log('[LotteryUI] 抽奖成功:', data);

            if (data.draws && data.draws.length > 0) {
                this.showRewardPanel(data.draws);
            }
        } catch (error) {
            console.error('[LotteryUI] onLotterySuccess 错误:', error);
        }
    }

    private showRewardPanel(draws: ILotterySingleDrawResult[]): void {
        try {
            const payloadItems = draws.map(draw => ({
                type: CurrencyType.HeroFragment,
                amount: draw.quantity,
                heroId: draw.item.id,
                name: `${draw.item.name}碎片`
            }));
            
            const payload = {
                items: payloadItems,
                reason: 'hero_fragment_lottery',
                source: 'lottery'
            };

            popupManager.addPopup('reward', () => {
                UIManager.instance.openUI(
                    'ui/popup/reward_received/RewardReceivedPanel',
                    payload,
                    false,
                    UIGroup.Popup,
                    'prefabs'
                ).catch((error) => {
                    console.error('[LotteryUI] openUI failed:', error);
                    popupManager.closeCurrentPopup();
                });
            });
        } catch (error) {
            console.error('[LotteryUI] showRewardPanel 错误:', error);
        }
    }

    private mergeRewards(draws: ILotterySingleDrawResult[]): ILotterySingleDrawResult[] {
        const rewardMap = new Map<number, ILotterySingleDrawResult>();

        for (const draw of draws) {
            const configId = draw.item.id;
            const existing = rewardMap.get(configId);

            if (existing) {
                existing.quantity += draw.quantity;
            } else {
                rewardMap.set(configId, {
                    item: draw.item,
                    quantity: draw.quantity,
                    rarity: draw.rarity,
                    isGuaranteed: draw.isGuaranteed,
                    poolId: draw.poolId
                });
            }
        }

        return Array.from(rewardMap.values());
    }

    private createRewardItem(draw: ILotterySingleDrawResult, index: number): IRewardItemUI | null {
        if (!this.rewardItemPrefab || !this.rewardContentList) return null;

        try {
            const rewardNode = instantiate(this.rewardItemPrefab);
            rewardNode.setParent(this.rewardContentList);

            const rewardItem: IRewardItemUI = {
                root: rewardNode,
                icon: rewardNode.getChildByName('Icon')?.getComponent(Sprite) || null!,
                nameLabel: rewardNode.getChildByName('Name')?.getComponent(Label) || null!,
                quantityLabel: rewardNode.getChildByName('Quantity')?.getComponent(Label) || null!,
                rarityLabel: rewardNode.getChildByName('Rarity')?.getComponent(Label) || null!
            };

            if (rewardItem.nameLabel) rewardItem.nameLabel.string = draw.item.name;
            if (rewardItem.quantityLabel) rewardItem.quantityLabel.string = `x${draw.quantity}`;
            if (rewardItem.rarityLabel) rewardItem.rarityLabel.string = draw.rarity;

            rewardNode.setPosition(new Vec3(0, 0, 0));
            rewardNode.setScale(new Vec3(0, 0, 1));

            return rewardItem;
        } catch (error) {
            console.error('[LotteryUI] 创建奖励物品失败:', error);
            return null;
        }
    }

    private createMergedRewardItem(draw: ILotterySingleDrawResult, index: number): IRewardItemUI | null {
        if (!this.rewardItemPrefab || !this.rewardContentList) return null;

        try {
            const rewardNode = instantiate(this.rewardItemPrefab);
            rewardNode.setParent(this.rewardContentList);

            const rewardItem: IRewardItemUI = {
                root: rewardNode,
                icon: rewardNode.getChildByName('Icon')?.getComponent(Sprite) || null!,
                nameLabel: rewardNode.getChildByName('Name')?.getComponent(Label) || null!,
                quantityLabel: rewardNode.getChildByName('Quantity')?.getComponent(Label) || null!,
                rarityLabel: rewardNode.getChildByName('Rarity')?.getComponent(Label) || null!
            };

            if (rewardItem.nameLabel) rewardItem.nameLabel.string = draw.item.name;
            if (rewardItem.quantityLabel) rewardItem.quantityLabel.string = `x${draw.quantity}`;
            if (rewardItem.rarityLabel) rewardItem.rarityLabel.string = draw.rarity;

            rewardNode.setPosition(new Vec3(0, 0, 0));
            rewardNode.setScale(new Vec3(0, 0, 1));

            return rewardItem;
        } catch (error) {
            console.error('[LotteryUI] 创建合并奖励物品失败:', error);
            return null;
        }
    }

    private clearRewardItems(): void {
        if (!this.rewardContentList) return;

        for (const item of this.currentRewardItems) {
            if (item.root && item.root.isValid) {
                item.root.destroy();
            }
        }

        this.currentRewardItems = [];
    }

    private playSequentialRewardAnimation(): void {
        for (let i = 0; i < this.currentRewardItems.length; i++) {
            const item = this.currentRewardItems[i];
            if (!item.root || !item.root.isValid) continue;

            const delay = i * 0.3;

            tween(item.root)
                .delay(delay)
                .call(() => {
                    this.playSound('reward');
                })
                .to(0.2, { scale: new Vec3(0, 0, 1) })
                .to(0.4, { scale: new Vec3(1.3, 1.3, 1) }, { easing: 'backOut' })
                .to(0.15, { scale: new Vec3(1.0, 1.0, 1) })
                .start();
        }
    }

    private playRewardAnimation(): void {
        for (let i = 0; i < this.currentRewardItems.length; i++) {
            const item = this.currentRewardItems[i];
            if (!item.root || !item.root.isValid) continue;

            const delay = i * 0.15;

            tween(item.root)
                .delay(delay)
                .to(0.3, { scale: new Vec3(1.2, 1.2, 1) }, { easing: 'backOut' })
                .to(0.2, { scale: new Vec3(1, 1, 1) })
                .start();

            this.scheduleOnce(() => {
                this.playSound('reward');
            }, delay);
        }
    }

    private playButtonClickEffect(node: Node): void {
        if (!node || !node.isValid) return;

        const sprite = node.getComponent(Sprite);
        if (sprite) {
            const originalColor = sprite.color.clone();
            sprite.color = new Color(200, 200, 200, 255);

            this.scheduleOnce(() => {
                if (node && node.isValid) {
                    sprite.color = originalColor;
                }
            }, 0.1);
        }
    }

    private playSound(type: string): void {
        const soundMap: { [key: string]: string } = {
            'click': 'audio/ui/click',
            'lottery': 'audio/ui/lottery',
            'reward': 'audio/ui/reward'
        };
        const soundPath = soundMap[type] || 'audio/ui/click';
        APM.playEffect(soundPath);
    }

    private showToast(message: string): void {
        ToastPanel.show(message, 2);
    }

    private cleanup(): void {
        {
            for (const [id, goodsUI] of this.lotteryGoodsUIs) {
                this.removeLotteryGoodsEvents(id, goodsUI);
            }
        }

        if (this.drawHideBtn && this.drawHideBtn.node && this.drawHideBtn.node.isValid && this.drawHideBtnCallback) {
            this.drawHideBtn.node.off(Button.EventType.CLICK, this.drawHideBtnCallback, this);
            this.drawHideBtnCallback = undefined;
        }

        if (this.drawSingleBtn && this.drawSingleBtn.node && this.drawSingleBtn.node.isValid && this.drawSingleBtnCallback) {
            this.drawSingleBtn.node.off(Button.EventType.CLICK, this.drawSingleBtnCallback, this);
            this.drawSingleBtnCallback = undefined;
        }

        if (this.drawMultiBtn && this.drawMultiBtn.node && this.drawMultiBtn.node.isValid && this.drawMultiBtnCallback) {
            this.drawMultiBtn.node.off(Button.EventType.CLICK, this.drawMultiBtnCallback, this);
            this.drawMultiBtnCallback = undefined;
        }

        this.lotteryGoodsUIs.clear();
        this.buttonCooldowns.clear();
        this.clearRewardItems();

        gameBus.off(SIGNAL_TYPES.SHOP_LOTTERY_SUCCESS, this.onLotterySuccess);

        this.isInitialized = false;
    }

    private removeLotteryGoodsEvents(id: number, goodsUI: ILotteryGoodsUI): void {
        try {
            if (goodsUI.singleBtn && goodsUI.singleBtn.node && goodsUI.singleBtn.node.isValid && goodsUI.singleBtnCallback) {
                goodsUI.singleBtn.node.off(Button.EventType.CLICK, goodsUI.singleBtnCallback, this);
            }
            if (goodsUI.multiBtn && goodsUI.multiBtn.node && goodsUI.multiBtn.node.isValid && goodsUI.multiBtnCallback) {
                goodsUI.multiBtn.node.off(Button.EventType.CLICK, goodsUI.multiBtnCallback, this);
            }

            goodsUI.singleBtnCallback = undefined;
            goodsUI.multiBtnCallback = undefined;
        } catch (error) {
            console.warn(`[LotteryUI] 移除抽奖商品 ${id} 事件失败:`, error);
        }
    }
}
