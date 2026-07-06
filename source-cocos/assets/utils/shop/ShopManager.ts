// ShopManager.ts
import { _decorator, Button, Color, Component, director, Label, Node, Vec3 } from 'cc';
import { gameBus } from '../signal/GameBus';
import { SIGNAL_TYPES, STORAGE_KEYS } from '../signal/ISignal';
import { loadData, saveData } from '../data/config/manager/DataManager';
import { SHOP_GOODS_LIST, IShopGoods, IGoodsState, ShopGoodsType } from './ShopConfig';
import { CDM, CurrencyType } from '../common/CurrencyManager';
import { EDM } from '../data/env/ConfigManager';
import { AdManager } from '../common/AdManager';
import { HeroFragmentLotteryConfig, ILotteryDrawResult, LTM } from '../../modules/lottery';

const { ccclass } = _decorator;

// 创建返回类型接口
interface IShopResult {
    success: boolean;
    message?: string;
}

@ccclass('ShopManager')
export class ShopManager extends Component {

    private static _instance: ShopManager | null = null;
    private static _isCreating: boolean = false; // 添加创建标志

    // 添加购买状态跟踪
    private purchaseInProgress: Set<number> = new Set();

    public static getInstance(): ShopManager {
        if (!ShopManager._instance && !ShopManager._isCreating) {
            ShopManager._isCreating = true;

            // 尝试在场景中查找现有实例
            const scene = director.getScene();
            if (scene) {
                const node = scene.getChildByName('ShopManager');
                if (node) {
                    ShopManager._instance = node.getComponent(ShopManager);
                    if (ShopManager._instance) {
                        ShopManager._isCreating = false;
                        return ShopManager._instance;
                    }
                }
            }

            // 如果没有找到，创建一个新实例
            const node = new Node('ShopManager');
            ShopManager._instance = node.addComponent(ShopManager);

            // 添加到场景
            if (scene) {
                scene.addChild(node);
                // 设置为常驻节点
                director.addPersistRootNode(node);
            }

            ShopManager._isCreating = false;
        }
        return ShopManager._instance!;
    }

    // 确保实例属性
    public static get instance(): ShopManager {
        return this.getInstance();
    }

    // 商品列表（从配置读取）
    private goodsList: IShopGoods[] = SHOP_GOODS_LIST;

    // 商品状态存储
    private goodsStates: Map<number, IGoodsState> = new Map();

    // onLoad 方法，添加开发环境重置按钮
    onLoad() {
        // 防止重复初始化
        if (ShopManager._instance && ShopManager._instance !== this) {
            console.warn('[ShopManager] 检测到重复实例，销毁当前实例');
            this.node.destroy();
            return;
        }

        ShopManager._instance = this;

        // 确保节点持久化（只执行一次）
        if (this.node && !this.node._persistNode) {
            director.addPersistRootNode(this.node);
        }

        this.initShop();
        this.initLottery();
        this.schedule(this.updateCountdowns, 1);

        // 开发环境下添加重置按钮
        if (EDM.isDev()) {
            this.createDevResetButton();
        }

        console.log('[ShopManager] 初始化完成');
    }

    onDestroy() {
        // 清理静态引用
        if (ShopManager._instance === this) {
            ShopManager._instance = null;
        }
        console.log('[ShopManager] 已销毁');
    }


    // 添加开发环境重置按钮方法
    private createDevResetButton(): void {
        const resetBtn = new Node('DevResetBtn');
        const button = resetBtn.addComponent(Button);
        const label = resetBtn.addComponent(Label);

        label.string = '重置商店';
        label.fontSize = 24;
        label.lineHeight = 24;
        label.color = Color.RED;

        // 设置按钮样式
        resetBtn.setParent(this.node);
        resetBtn.setPosition(new Vec3(200, 300, 0));

        // 按钮点击事件
        button.node.on(Button.EventType.CLICK, () => {
            this.manualReset();
            console.log('[ShopManager] 开发环境：商店已重置');
        });

        console.log('[ShopManager] 开发环境重置按钮已创建');
    }

    /**
     * 初始化商店
     */
    private initShop(): void {
        this.loadGoodsStates();
        this.checkDailyRefresh();
    }

    /**
     * 初始化抽奖系统
     */
    private initLottery(): void {
        HeroFragmentLotteryConfig.registerAllConfigs();
        console.log('[ShopManager] 抽奖系统已初始化');
    }

    /**
     * 加载商品状态
     */
    private loadGoodsStates(): void {
        const savedStates = loadData(STORAGE_KEYS.SHOP_GOODS_STATES);

        if (savedStates) {
            try {
                for (const [id, state] of Object.entries(savedStates)) {
                    this.goodsStates.set(parseInt(id), state as IGoodsState);
                }
            } catch (error) {
                console.error('[ShopManager] 解析商品状态失败:', error);
                this.initializeGoodsStates();
            }
        } else {
            this.initializeGoodsStates();
        }
    }

    /**
     * 初始化商品状态
     */
    private initializeGoodsStates(): void {
        this.goodsList.forEach(goods => {
            this.goodsStates.set(goods.id, {
                id: goods.id,
                freeUsed: false,
                adUsedCount: 0,
                lastAdTime: 0,
                isAvailable: true,
                countdown: 0
            });
        });
        this.saveGoodsStates();
    }

    /**
     * 保存商品状态
     */
    private saveGoodsStates(): void {
        const statesObj: { [key: number]: IGoodsState } = {};
        this.goodsStates.forEach((state, id) => {
            statesObj[id] = state;
        });
        saveData(STORAGE_KEYS.SHOP_GOODS_STATES, JSON.stringify(statesObj));
    }

    /**
     * 检查每日刷新
     */
    private checkDailyRefresh(): void {
        const today = new Date().toDateString();
        const lastRefresh = loadData(STORAGE_KEYS.SHOP_LAST_REFRESH_DATE);

        if (lastRefresh !== today) {
            this.resetDailyData();
            saveData(STORAGE_KEYS.SHOP_LAST_REFRESH_DATE, today);
        }
    }

    /**
     * 重置每日数据
     */
    private resetDailyData(): void {
        this.goodsList.forEach(goods => {
            if (goods.id <= 3) { // 只重置前3个商品
                const state = this.goodsStates.get(goods.id);
                if (state) {
                    state.freeUsed = false;
                    state.adUsedCount = 0;
                    state.lastAdTime = 0;
                    state.isAvailable = true;
                    state.countdown = 0;

                    console.log(`[ShopManager] 重置商品${goods.id}: 免费可用=${!state.freeUsed}, 广告次数=${state.adUsedCount}`);
                }
            }
        });
        this.saveGoodsStates();
        this.emitShopDataUpdated();

        console.log('[ShopManager] 每日数据已重置');
    }

    /**
     * 更新倒计时
     */
    private updateCountdowns(): void {
        let needSave = false;

        this.goodsList.forEach(goods => {
            if (goods.adCooldown && goods.adCooldown > 0) {
                const state = this.goodsStates.get(goods.id);
                if (state && state.countdown > 0) {
                    state.countdown--;
                    if (state.countdown <= 0) {
                        state.countdown = 0;
                        state.isAvailable = true;
                        needSave = true;
                    }
                }
            }
        });

        if (needSave) {
            this.saveGoodsStates();
            this.emitShopDataUpdated();
        }
    }

    /**
     * 获取商品列表
     */
    public getGoodsList(): IShopGoods[] {
        return this.goodsList;
    }

    /**
     * 获取商品状态
     */
    public getGoodsState(id: number): IGoodsState | undefined {
        return this.goodsStates.get(id);
    }

    /**
     * 免费领取商品
     */
    public claimFree(id: number): IShopResult {
        const goods = this.goodsList.find(g => g.id === id);
        const state = this.goodsStates.get(id);

        if (!goods || !state || !goods.freeAvailable) {
            return { success: false, message: '该商品无法免费领取' };
        }

        if (state.freeUsed) {
            return { success: false, message: '今日免费领取已使用' };
        }

        // 使用CurrencyManager增加货币
        const success = CDM.addCurrency(
            goods.currencyType,
            goods.amount,
            `shop_free_claim_${goods.id}`
        );

        if (success) {
            state.freeUsed = true;
            this.saveGoodsStates();

            // 发送领取成功事件
            this.emitGoodsClaimed(id, 'free');

            console.log(`[ShopManager] 免费领取成功: ${goods.name}`);
            return { success: true };
        }

        return { success: false, message: '领取失败' };
    }

    /**
     * 看广告领取商品
     */
    public claimByAd(id: number): IShopResult {
        const goods = this.goodsList.find(g => g.id === id);
        const state = this.goodsStates.get(id);

        if (!goods || !state || !goods.adAvailable) {
            return { success: false, message: '该商品无法通过广告领取' };
        }

        // 检查广告次数
        if (state.adUsedCount >= goods.adMaxCount!) {
            return { success: false, message: '今日广告次数已用完' };
        }

        // 检查冷却时间
        if (state.countdown > 0) {
            return { success: false, message: '广告冷却中' };
        }

        // 立即预扣广告次数
        state.adUsedCount++;
        // 立即设置冷却时间
        if (goods.adCooldown && goods.adCooldown > 0) {
            state.countdown = goods.adCooldown * 60;
            state.isAvailable = false;
        }

        this.saveGoodsStates();
        this.emitShopDataUpdated(); // 立即通知UI更新

        console.log(`[ShopManager] 开始广告，预扣次数，剩余: ${goods.adMaxCount! - state.adUsedCount}`);

        // 使用真实的AdManager展示广告
        const adKey = 'shop_goods_ad';
        const uniqueAdKey = `shop_goods_${id}`;

        AdManager.showAd(
            uniqueAdKey,
            () => {
                // 广告成功回调
                this.onAdSuccess(id);
            },
            (reason) => {
                // 广告失败，恢复次数
                state.adUsedCount--;
                if (goods.adCooldown && goods.adCooldown > 0) {
                    state.countdown = 0;
                    state.isAvailable = true;
                }
                this.saveGoodsStates();
                this.emitShopDataUpdated();
                console.warn(`[ShopManager] 广告失败，已恢复次数: ${reason}`);
            },
            adKey
        );

        return { success: true };
    }

    /**
     * 广告成功回调
     */
    private onAdSuccess(id: number): void {
        const goods = this.goodsList.find(g => g.id === id);
        const state = this.goodsStates.get(id);

        if (!goods || !state) return;

        // 使用CurrencyManager增加货币
        const success = CDM.addCurrency(
            goods.currencyType,
            goods.amount,
            `shop_ad_claim_${goods.id}`
        );

        if (success) {
            // 检查是否是最后一次广告
            const remainingCount = goods.adMaxCount! - state.adUsedCount;

            // 如果是最后一次广告，不设置冷却时间，直接禁用按钮
            if (remainingCount <= 0) {
                state.isAvailable = false;
                state.countdown = 0;
            } else if (goods.adCooldown && goods.adCooldown > 0) {
                // 如果不是最后一次且需要冷却，设置冷却时间
                state.countdown = goods.adCooldown * 60;
                state.isAvailable = false;
            }

            this.saveGoodsStates();

            // 发送领取成功事件
            this.emitGoodsClaimed(id, 'ad');

            console.log(`[ShopManager] 广告领取成功: ${goods.name}, 剩余次数: ${remainingCount - 1}`);

            // 立即更新商店UI
            this.emitShopDataUpdated();
        } else {
            // 如果添加货币失败，回滚广告次数
            state.adUsedCount--;
            if (goods.adCooldown && goods.adCooldown > 0) {
                state.countdown = 0;
                state.isAvailable = true;
            }
            this.saveGoodsStates();
            this.emitShopDataUpdated();
            console.warn(`[ShopManager] 广告领取成功但添加货币失败`);
        }
    }

    /**
     * 购买商品
     */
    public purchase(id: number): IShopResult {
        // 检查是否正在购买中
        if (this.purchaseInProgress.has(id)) {
            return { success: false, message: '正在购买中，请稍后再试' };
        }

        const goods = this.goodsList.find(g => g.id === id);

        if (!goods || !goods.cost) {
            return { success: false, message: '该商品无法购买' };
        }

        // 检查宝石是否足够
        if (!CDM.hasEnoughCurrency(CurrencyType.Gem, goods.cost)) {
            return { success: false, message: '宝石不足，无法购买' };
        }

        // 标记为正在购买
        this.purchaseInProgress.add(id);

        try {
            // 批量操作：扣除宝石 + 增加目标货币
            const operations = [
                {
                    type: CurrencyType.Gem,
                    amount: goods.cost,
                    operation: 'subtract' as const,
                    reason: `shop_purchase_cost_${goods.id}`
                },
                {
                    type: goods.currencyType,
                    amount: goods.amount,
                    operation: 'add' as const,
                    reason: `shop_purchase_reward_${goods.id}`
                }
            ];

            const success = CDM.batchCurrencyOperation(operations);

            if (success) {
                // 发送购买成功事件
                this.emitGoodsPurchased(id);

                console.log(`[ShopManager] 购买成功: ${goods.name}`);
                return { success: true };
            } else {
                return { success: false, message: '购买失败' };
            }
        } catch (error) {
            console.error(`[ShopManager] 购买商品 ${id} 时发生错误:`, error);
            return { success: false, message: '购买过程中出现错误' };
        } finally {
            // 清除购买状态标记
            setTimeout(() => {
                this.purchaseInProgress.delete(id);
            }, 1000);
        }
    }

    /**
     * 抽奖
     */
    public lottery(id: number): IShopResult {
        const goods = this.goodsList.find(g => g.id === id);

        if (!goods || goods.type !== ShopGoodsType.LOTTERY || !goods.lotteryId) {
            return { success: false, message: '该商品无法抽奖' };
        }

        // 检查是否正在抽奖中
        if (this.purchaseInProgress.has(id)) {
            return { success: false, message: '正在抽奖中，请稍后再试' };
        }

        // 检查货币是否足够
        if (!CDM.hasEnoughCurrency(goods.currencyType, goods.cost!)) {
            return { success: false, message: '货币不足，无法抽奖' };
        }

        // 标记为正在抽奖
        this.purchaseInProgress.add(id);

        try {
            // 执行抽奖
            const isMultiDraw = goods.lotteryId.includes('multi') || goods.lotteryId.includes('dev');
            const lotteryResult = LTM.draw(goods.lotteryId, isMultiDraw);

            if (!lotteryResult.success) {
                return { success: false, message: lotteryResult.message || '抽奖失败' };
            }

            // 扣除货币
            const currencyOperation = {
                type: goods.currencyType,
                amount: goods.cost!,
                operation: 'subtract' as const,
                reason: `shop_lottery_cost_${goods.id}`
            };

            const deductSuccess = CDM.batchCurrencyOperation([currencyOperation]);

            if (!deductSuccess) {
                return { success: false, message: '扣除货币失败' };
            }

            // 发送抽奖成功事件
            this.emitLotterySuccess(id, lotteryResult);

            console.log(`[ShopManager] 抽奖成功: ${goods.name}`);
            return { success: true };
        } catch (error) {
            console.error(`[ShopManager] 抽奖商品 ${id} 时发生错误:`, error);
            return { success: false, message: '抽奖过程中出现错误' };
        } finally {
            // 清除抽奖状态标记
            setTimeout(() => {
                this.purchaseInProgress.delete(id);
            }, 1000);
        }
    }

    /**
     * 显示广告（需要替换为实际广告SDK）
     */
    private showAd(successCallback: () => void, failCallback?: () => void): void {
        console.log('[ShopManager] 展示广告...');

        // TODO: 替换为实际广告SDK调用
        // 模拟广告展示
        setTimeout(() => {
            // 模拟80%成功率
            if (Math.random() > 0.2) {
                successCallback();
            } else if (failCallback) {
                failCallback();
            }
        }, 500);
    }

    /**
     * 获取商品剩余广告次数
     */
    public getAdRemainingCount(id: number): number {
        const goods = this.goodsList.find(g => g.id === id);
        const state = this.goodsStates.get(id);

        if (!goods || !state || !goods.adMaxCount) return 0;

        return Math.max(0, goods.adMaxCount - state.adUsedCount);
    }

    /**
     * 格式化时间显示
     */
    public formatTime(seconds: number): string {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * 发送商店数据更新事件
     */
    private emitShopDataUpdated(): void {
        gameBus.emit(SIGNAL_TYPES.SHOP_DATA_UPDATED);
    }

    /**
     * 发送商品领取成功事件
     */
    private emitGoodsClaimed(id: number, claimType: 'free' | 'ad'): void {
        const goods = this.goodsList.find(g => g.id === id);
        if (!goods) return;

        gameBus.emit(SIGNAL_TYPES.SHOP_GOODS_CLAIMED, {
            id,
            claimType,
            currencyType: goods.currencyType,
            amount: goods.amount,
            timestamp: Date.now()
        });
    }

    /**
     * 发送商品购买成功事件
     */
    private emitGoodsPurchased(id: number): void {
        gameBus.emit(SIGNAL_TYPES.SHOP_GOODS_PURCHASED, {
            id,
            timestamp: Date.now()
        });

        gameBus.emit(SIGNAL_TYPES.CURRENCY_CHANGED, {
            id,
            timestamp: Date.now()
        });
    }

    /**
     * 发送抽奖成功事件
     */
    private emitLotterySuccess(id: number, lotteryResult: ILotteryDrawResult): void {
        const goods = this.goodsList.find(g => g.id === id);
        if (!goods) return;

        gameBus.emit(SIGNAL_TYPES.SHOP_LOTTERY_SUCCESS, {
            id,
            lotteryId: goods.lotteryId,
            draws: lotteryResult.draws,
            totalCost: lotteryResult.totalCost,
            pityCounter: lotteryResult.pityCounter,
            timestamp: Date.now()
        });

        gameBus.emit(SIGNAL_TYPES.CURRENCY_CHANGED, {
            id,
            timestamp: Date.now()
        });
    }

    /**
     * 手动重置商店（用于测试）
     */
    public manualReset(): void {
        this.initializeGoodsStates();
        this.emitShopDataUpdated();
        console.log('[ShopManager] 商店数据已重置');
    }
}