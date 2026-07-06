import { _decorator, Component, director, instantiate, Node, Prefab, UITransform } from 'cc';
import { ItemController } from './ItemController';
import { onPause } from '../../utils/utils';
import { LDM } from '../../modules/level/config/LevelDataManager';
import { RES_ITEM_LIST } from '../../utils/data/dict/base/ResItemList';
import { CDM, CurrencyType } from '../../utils/common/CurrencyManager';
import { EDM } from '../../utils/data/env/ConfigManager';
import { PDM } from '../../utils/data/config/player/PlayerDataManager';
import { HDM } from '../../utils/data/config/hero/HeroDataManager';
import { resetGameData } from '../../utils/data/config/manager/GameDataManager';
import { GAME_PAUSE_REASONS } from '../../utils/signal/GameBus';
import { Skin1UIPolish } from '../../utils/ui/skin1/Skin1UIPolish';
const { ccclass, property } = _decorator;

@ccclass('VictoryPanelController')
export class VictoryPanelController extends Component {
    @property(Prefab)
    itemPrefab: Prefab; // 物品预制体
    @property(Prefab)
    messagePrefab: Prefab; // message预制体

    @property(Node)
    itemBoxNode: Node; // 物品box节点

    _data: [] = []; // 资源数据
    _battleRewards: any = {}; // 战斗奖励数据
    _mergedRewards: any = {}; // 合并后的奖励数据
    _heroFragmentRewards: any[] = []; // 英雄碎片奖励数据

    // 货币类型到item_id的映射
    private readonly CURRENCY_ITEM_MAP = {
        coin: 0,        // 金币 (RES_ITEM_LIST id=0)
        gem: 3,         // 宝石 (RES_ITEM_LIST id=3)
        stamina: 2,     // 体力 (RES_ITEM_LIST id=2)
        heroFragment: 4 // 英雄碎片 (RES_ITEM_LIST id=4)
    };

    // 配置：哪些资源类型应该在战斗奖励中显示
    private readonly BATTLE_REWARD_TYPES = {
        coin: true,        // 金币显示
        gem: true,         // 宝石显示
        heroFragment: true, // 英雄碎片显示
        stamina: false     // 体力不显示在战斗奖励中
    };

    init(data, battleRewards?: any) {
        this._data = JSON.parse(JSON.stringify(data));

        // 暂停游戏
        onPause(GAME_PAUSE_REASONS.RESULT_PANEL);

        // 设置缩放
        this.node.getChildByName('Bg')?.getComponent(UITransform)?.setContentSize(EDM.config.viewWidth, EDM.config.viewHeight);
        Skin1UIPolish.applyPanel(this.node);

        // 禁用ItemBox的Layout组件，使用我们的自定义布局
        if (this.itemBoxNode) {
            const layout = this.itemBoxNode.getComponent('Layout') as any;
            if (layout) {
                layout.enabled = false;
                // 强制更新布局，确保禁用生效
                if (layout.updateLayout) {
                    layout.updateLayout();
                }
                console.log('[VictoryPanelController] 已禁用ItemBox的Layout组件');
            } else {
                console.warn('[VictoryPanelController] 未找到ItemBox的Layout组件');
            }

            // 修复ItemBox的容器尺寸问题
            const transform = this.itemBoxNode.getComponent(UITransform);
            if (transform) {
                // 设置正确的容器尺寸，确保有足够空间显示5个物品
                // 计算需要的高度：每行80px物品+15px间距，预留多行空间
                const itemHeight = 80;
                const spacing = 15;
                const rowHeight = itemHeight + spacing;
                const estimatedRows = Math.ceil(10 / 5); // 预估最多10个物品，每行5个
                const neededHeight = rowHeight * estimatedRows + 50; // 额外50px缓冲

                transform.setContentSize(450, neededHeight); // 增加高度以容纳多行
                console.log('[VictoryPanelController] 已修复ItemBox容器尺寸:', transform.contentSize, '预估行数:', estimatedRows);
            }

            // 检查父节点是否有约束
            const parentNode = this.itemBoxNode.parent;
            if (parentNode) {
                const parentTransform = parentNode.getComponent(UITransform);
                const parentLayout = parentNode.getComponent('Layout') as any;
                const parentWidget = parentNode.getComponent('Widget') as any;

                if (parentTransform) {
                    console.log('[VictoryPanelController] 父节点尺寸:', parentTransform.contentSize);
                }

                if (parentLayout && parentLayout.enabled) {
                    console.warn('[VictoryPanelController] 父节点有Layout组件，可能影响布局');
                    // 禁用父节点的Layout组件
                    parentLayout.enabled = false;
                    if (parentLayout.updateLayout) {
                        parentLayout.updateLayout();
                    }
                    console.log('[VictoryPanelController] 已禁用父节点的Layout组件');
                }

                if (parentWidget && parentWidget.enabled) {
                    console.warn('[VictoryPanelController] 父节点有Widget组件，可能影响布局');
                    // 可以选择禁用Widget组件
                    // parentWidget.enabled = false;
                }

                // 检查父节点的父节点
                const grandParentNode = parentNode.parent;
                if (grandParentNode) {
                    const grandParentTransform = grandParentNode.getComponent(UITransform);
                    const grandParentLayout = grandParentNode.getComponent('Layout') as any;
                    const grandParentWidget = grandParentNode.getComponent('Widget') as any;

                    if (grandParentTransform) {
                        console.log('[VictoryPanelController] 祖父节点尺寸:', grandParentTransform.contentSize);
                    }

                    if (grandParentLayout && grandParentLayout.enabled) {
                        console.warn('[VictoryPanelController] 祖父节点有Layout组件，可能影响布局');
                        grandParentLayout.enabled = false;
                        if (grandParentLayout.updateLayout) {
                            grandParentLayout.updateLayout();
                        }
                        console.log('[VictoryPanelController] 已禁用祖父节点的Layout组件');
                    }

                    if (grandParentWidget && grandParentWidget.enabled) {
                        console.warn('[VictoryPanelController] 祖父节点有Widget组件，可能影响布局');
                    }
                }
            }
        } else {
            console.error('[VictoryPanelController] itemBoxNode为空');
        }

        // 获取战斗过程中的经济奖励
        if (battleRewards) {
            // 如果直接传入了战斗奖励数据，直接使用
            this._battleRewards = battleRewards;
        } else {
            // 否则尝试从GameController获取
            this.getBattleRewards();
        }

        // 处理英雄碎片奖励
        this.processHeroFragmentRewards();

        // 合并所有奖励
        this.mergeRewards();

        // 渲染奖励item
        this.renderRewards();

        // 测试布局是否正常工作
        this.testLayout();
    }

    /**
     * 测试布局是否正常工作
     */
    private testLayout(): void {
        console.log('[VictoryPanelController] 开始测试布局...');

        if (this.itemBoxNode) {
            const transform = this.itemBoxNode.getComponent(UITransform);
            console.log('[VictoryPanelController] ItemBox尺寸:', transform ? transform.contentSize : '无UITransform');

            const layout = this.itemBoxNode.getComponent('Layout') as any;
            console.log('[VictoryPanelController] Layout组件状态:', layout ? (layout.enabled ? '启用' : '禁用') : '无Layout组件');

            const childCount = this.itemBoxNode.children.length;
            console.log('[VictoryPanelController] 子节点数量:', childCount);

            // 检查每个子节点的位置
            this.itemBoxNode.children.forEach((child, index) => {
                console.log(`[VictoryPanelController] 子节点${index}位置:`, child.position);
            });
        }
    }

    /**
     * 获取战斗过程中的经济奖励
     */
    private getBattleRewards(): void {
        try {
            // 从GameController获取战斗过程中的货币奖励（差值计算）
            let gameController = null;

            // 方法1: 通过场景获取
            if (this.node.scene) {
                gameController = this.node.scene.getComponentInChildren('GameController') as any;
            }

            // 方法2: 如果方法1失败，尝试通过节点查找
            if (!gameController && this.node) {
                // 从当前节点向上查找GameController
                let parent = this.node.parent;
                while (parent && !gameController) {
                    gameController = parent.getComponent('GameController') as any;
                    parent = parent.parent;
                }
            }

            // 方法3: 如果方法2失败，尝试通过场景根节点查找
            if (!gameController && this.node.scene) {
                const sceneRoot = this.node.scene.getChildByName('Canvas') || this.node.scene.getChildByName('Main Camera');
                if (sceneRoot) {
                    gameController = sceneRoot.getComponentInChildren('GameController') as any;
                }
            }

            if (gameController && typeof gameController.getBattleCurrencyRewards === 'function') {
                this._battleRewards = gameController.getBattleCurrencyRewards();
            } else {
                // 降级方案：从经济系统获取当前货币状态
                // 使用CurrencyManager获取经济状态
                const economyStatus = {
                    currencies: {
                        coin: CDM.getCurrency(CurrencyType.Gold),
                        gem: CDM.getCurrency(CurrencyType.Gem),
                        heroFragment: CDM.getCurrency(CurrencyType.HeroFragment),
                        stamina: CDM.getCurrency(CurrencyType.Stamina)
                    }
                };
                this._battleRewards = {
                    coin: economyStatus.currencies.coin || 0,
                    gem: economyStatus.currencies.gem || 0,
                    heroFragment: economyStatus.currencies.heroFragment || 0,
                    stamina: economyStatus.currencies.stamina || 0
                };
            }

        } catch (error) {
            console.error('[VictoryPanelController] 获取战斗奖励失败:', error);
            this._battleRewards = {
                coin: 0,
                gem: 0,
                heroFragment: 0,
                stamina: 0
            };
        }
    }

    /**
     * 处理英雄碎片奖励
     */
    private processHeroFragmentRewards(): void {
        this._heroFragmentRewards = [];

        // 获取已拥有的英雄列表
        const ownedHeroes = HDM.getHeroList() || [];
        if (ownedHeroes.length === 0) return;

        // 计算英雄碎片奖励数量
        const heroFragmentAmount = this._battleRewards.heroFragment || 0;
        if (heroFragmentAmount <= 0) return;

        // 随机选择英雄碎片
        for (let i = 0; i < heroFragmentAmount; i++) {
            const randomHero = ownedHeroes[Math.floor(Math.random() * ownedHeroes.length)];
            if (randomHero) {
                this._heroFragmentRewards.push({
                    heroId: randomHero.id,
                    heroName: randomHero.name,
                    heroUrl: randomHero.url, // 使用url而不是name
                    amount: 1
                });
            }
        }
    }

    /**
     * 合并所有奖励
     */
    private mergeRewards(): void {
        // 初始化合并后的奖励
        this._mergedRewards = {
            coin: 0,
            gem: 0,
            heroFragment: 0,
            stamina: 0
        };

        // 1. 添加关卡配置的奖励
        this._data.forEach((v, index) => {
            const itemId = v['item_id'];
            const amount = v['number'];

            // 根据item_id映射到货币类型
            const currencyTypes = Object.keys(this.CURRENCY_ITEM_MAP);
            for (const currencyType of currencyTypes) {
                const id = this.CURRENCY_ITEM_MAP[currencyType];
                if (id === itemId) {
                    this._mergedRewards[currencyType] += amount;
                    break;
                }
            }
        });

        // 2. 添加战斗奖励（只添加配置中允许显示的）
        const battleRewardTypes = Object.keys(this.BATTLE_REWARD_TYPES);
        for (const currencyType of battleRewardTypes) {
            const shouldShow = this.BATTLE_REWARD_TYPES[currencyType];
            if (shouldShow && this._battleRewards[currencyType] > 0) {
                this._mergedRewards[currencyType] += this._battleRewards[currencyType];
            }
        }

        // 3. 添加体力奖励：随机3-6点体力
        const randomStaminaReward = 3 + Math.floor(Math.random() * 4); // 3-6点随机
        this._mergedRewards.stamina += randomStaminaReward;
        console.log(`[VictoryPanelController] 胜利奖励体力: +${randomStaminaReward}`);

    }

    /**
     * 渲染所有奖励
     */
    private renderRewards(): void {
        // 清空现有奖励显示
        this.itemBoxNode.removeAllChildren();

        // 渲染合并后的奖励
        this.renderMergedRewards();
        Skin1UIPolish.refreshDynamicContent(this.itemBoxNode);

        // 强制刷新布局
        this.scheduleOnce(() => {
            if (this.itemBoxNode) {
                // 强制更新所有子节点的位置
                this.itemBoxNode.children.forEach((child, index) => {
                    const row = Math.floor(index / 5);
                    const col = index % 5;

                    const itemWidth = 80;
                    const itemHeight = 80;
                    const spacing = 15;

                    // 重新计算位置
                    const totalItemWidth = itemWidth * 5 + spacing * 4;
                    const startX = -totalItemWidth / 2;
                    const x = startX + col * (itemWidth + spacing) + itemWidth / 2;
                    const y = -row * (itemHeight + spacing) - itemHeight / 2;

                    child.setPosition(x, y, 0);
                    console.log(`[VictoryPanelController] 强制更新位置: index=${index}, row=${row}, col=${col}, x=${x}, y=${y}`);
                });
                Skin1UIPolish.refreshDynamicContent(this.itemBoxNode);
            }
        }, 0.1);
    }

    /**
     * 渲染合并后的奖励
     */
    private renderMergedRewards(): void {
        // 按优先级显示奖励：金币、钻石、宝石、体力
        const displayOrder = ['coin', 'gem', 'stamina'];

        // 记录已渲染的奖励类型，避免重复
        const renderedRewards = new Set();
        let itemIndex = 0;

        // 渲染普通货币奖励
        for (const currencyType of displayOrder) {
            const amount = this._mergedRewards[currencyType];
            if (amount > 0 && !renderedRewards.has(currencyType)) {
                const itemId = this.CURRENCY_ITEM_MAP[currencyType];
                const item = RES_ITEM_LIST.find((b) => b.id === itemId);

                if (item) {
                    // 创建物品数据的副本，避免修改原始数据
                    const itemData = JSON.parse(JSON.stringify(item));
                    itemData['number'] = amount;

                    let itemPrefab = instantiate(this.itemPrefab);
                    itemPrefab.getComponent(ItemController).init(itemData);
                    this.itemBoxNode.addChild(itemPrefab);

                    // 设置位置（每行5个）
                    this.setItemPosition(itemPrefab, itemIndex);

                    // 添加动画效果
                    this.addRewardAnimation(itemPrefab, itemIndex);

                    // 标记为已渲染
                    renderedRewards.add(currencyType);
                    itemIndex++;
                } else {
                    console.warn(`[VictoryPanelController] 未找到item_id为${itemId}的物品配置`);
                }
            }
        }

        // 渲染英雄碎片奖励
        this.renderHeroFragmentRewards(itemIndex);
    }

    /**
     * 设置奖励物品位置
     */
    private setItemPosition(itemNode: Node, index: number): void {
        const itemsPerRow = 5;
        const itemWidth = 80; // 物品宽度
        const itemHeight = 80; // 物品高度
        const spacing = 15; // 间距，增加间距确保不挤在一起

        const row = Math.floor(index / itemsPerRow);
        const col = index % itemsPerRow;

        // 计算每行的总宽度
        const rowWidth = itemWidth * itemsPerRow + spacing * (itemsPerRow - 1);
        const startX = -rowWidth / 2;

        // 获取父节点的实际可用空间
        let availableWidth = 450; // 默认宽度
        if (this.itemBoxNode && this.itemBoxNode.parent) {
            const parentTransform = this.itemBoxNode.parent.getComponent(UITransform);
            if (parentTransform) {
                availableWidth = parentTransform.contentSize.width * 0.8; // 使用父节点80%的宽度
            }
        }

        // 计算每行的总宽度，确保不超过可用空间
        const totalItemWidth = itemWidth * itemsPerRow + spacing * (itemsPerRow - 1);
        const actualWidth = Math.min(totalItemWidth, availableWidth);
        const actualStartX = -actualWidth / 2;

        // 计算每个物品的位置
        const x = actualStartX + col * (itemWidth + spacing) + itemWidth / 2;
        const y = -row * (itemHeight + spacing) - itemHeight / 2;

        itemNode.setPosition(x, y, 0);

        // 调试信息
        console.log(`[VictoryPanelController] 设置物品位置: index=${index}, row=${row}, col=${col}, x=${x}, y=${y}, availableWidth=${availableWidth}, actualWidth=${actualWidth}`);
    }

    // 确定
    onSure() {
        const latestLevel = PDM.getLatestLevel();
        const currentLevelIndex = PDM.getCurrentLevel();
        const isClearingLatestLevel = latestLevel === currentLevelIndex;
        const hasNextLevel = currentLevelIndex < LDM.getLevelCount() - 1;

        if (isClearingLatestLevel && hasNextLevel) {
            const nextLevel = currentLevelIndex + 1;
            PDM.setLatestLevel(nextLevel);
            PDM.setCurrentLevel(nextLevel);
        } else {
            PDM.setCurrentLevel(currentLevelIndex);
        }

        // 处理合并后的奖励 - 通过CurrencyManager 已经在GameController中处理过了
        try {
            // if (this._mergedRewards.coin > 0) {
            //     CDM.addCurrency(CurrencyType.Gold, this._mergedRewards.coin, 'victory_reward');
            //     console.log(`[VictoryPanelController] 添加金币奖励: ${this._mergedRewards.coin}`);
            // }
            // if (this._mergedRewards.gem > 0) {
            //     CDM.addCurrency(CurrencyType.Gem, this._mergedRewards.gem, 'victory_reward');
            //     console.log(`[VictoryPanelController] 添加宝石奖励: ${this._mergedRewards.gem}`);
            // }
            // if (this._mergedRewards.stamina > 0) {
            //     CDM.addCurrency(CurrencyType.Stamina, this._mergedRewards.stamina, 'victory_reward');
            //     console.log(`[VictoryPanelController] 添加体力奖励: ${this._mergedRewards.stamina}`);
            // }
        } catch (error) {
            console.error('[VictoryPanelController] 保存经济奖励失败:', error);
        }

        // 保存数据 - CurrencyManager会自动处理持久化
        console.log('[VictoryPanelController] 奖励已通过CurrencyManager保存');

        // 重置
        resetGameData();

        this.scheduleOnce(() => {
            director.loadScene('Home');
        });
    }

    update(deltaTime: number) { }

    /**
     * 渲染英雄碎片奖励
     */
    private renderHeroFragmentRewards(startIndex: number): void {
        if (this._heroFragmentRewards.length === 0) return;

        // 按英雄ID分组
        const heroFragmentGroups = {};
        this._heroFragmentRewards.forEach(fragment => {
            if (!heroFragmentGroups[fragment.heroId]) {
                heroFragmentGroups[fragment.heroId] = {
                    heroId: fragment.heroId,
                    heroName: fragment.heroName,
                    heroUrl: fragment.heroUrl, // 使用url而不是name
                    amount: 0
                };
            }
            heroFragmentGroups[fragment.heroId].amount += fragment.amount;
        });

        // 渲染每个英雄的碎片
        let itemIndex = startIndex;
        Object.keys(heroFragmentGroups).forEach((heroId) => {
            const group = heroFragmentGroups[heroId];
            const item = RES_ITEM_LIST.find((b) => b.id === this.CURRENCY_ITEM_MAP.heroFragment);
            if (item) {
                const itemData = JSON.parse(JSON.stringify(item));
                itemData['number'] = group.amount;
                itemData['heroId'] = group.heroId;
                itemData['heroName'] = group.heroName;
                itemData['heroUrl'] = group.heroUrl; // 使用url而不是name

                let itemPrefab = instantiate(this.itemPrefab);
                itemPrefab.getComponent(ItemController).init(itemData);
                this.itemBoxNode.addChild(itemPrefab);

                // 设置位置（每行5个）
                this.setItemPosition(itemPrefab, itemIndex);

                // 添加动画效果
                this.addRewardAnimation(itemPrefab, itemIndex);

                itemIndex++;
            }
        });
    }

    /**
     * 添加奖励动画效果
     */
    private addRewardAnimation(itemNode: Node, index: number): void {
        // 初始状态：缩小到0
        itemNode.setScale(0, 0, 1);

        // 延迟显示，每个奖励间隔0.2秒，让动画更明显
        this.scheduleOnce(() => {
            // 第一步：快速放大到1.4倍
            itemNode.setScale(1.4, 1.4, 1);

            // 第二步：快速缩小到0.8倍
            this.scheduleOnce(() => {
                itemNode.setScale(0.8, 0.8, 1);

                // 第三步：缓慢回到正常大小
                this.scheduleOnce(() => {
                    itemNode.setScale(1, 1, 1);
                }, 0.1);
            }, 0.1);
        }, index * 0.2);
    }
}
