import { _decorator, Component, director, instantiate, Label, Node, Prefab, ProgressBar, UITransform, tween } from 'cc';
import { onContinue, onPause } from '../../utils/utils';
import { RES_ITEM_LIST } from '../../utils/data/dict/base/ResItemList';
import { CDM, CurrencyType } from '../../utils/common/CurrencyManager';
import { AdManager } from '../../utils/common/AdManager';
import { EDM } from '../../utils/data/env/ConfigManager';
import { ItemController } from './ItemController';
import { WallController } from '../../script/core/prefab/WallController';
import { GAME_PAUSE_REASONS } from '../../utils/signal/GameBus';
import { Skin1UIPolish } from '../../utils/ui/skin1/Skin1UIPolish';
const { ccclass, property } = _decorator;

@ccclass('LosePanelController')
export class LosePanelController extends Component {
    @property(Prefab)
    itemPrefab: Prefab; // 物品预制体
    @property(Prefab)
    messagePrefab: Prefab; // message预制体

    @property(Node)
    itemBoxNode: Node; // 物品box节点

    _battleRewards: any = {}; // 战斗奖励数据
    _mergedRewards: any = {}; // 合并后的奖励数据

    // 货币类型到item_id的映射
    private readonly CURRENCY_ITEM_MAP = {
        coin: 0,        // 金币
        gem: 1,         // 宝石
        stamina: 2,     // 体力
        heroFragment: 3 // 英雄碎片
    };

    // 配置：哪些资源类型应该在战斗奖励中显示
    private readonly BATTLE_REWARD_TYPES = {
        coin: true,        // 金币显示
        gem: true,         // 宝石显示
        heroFragment: true, // 英雄碎片显示
        stamina: false     // 体力不显示在战斗奖励中
    };

    start() { }

    init(battleRewards?: any) {
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
                console.log('[LosePanelController] 已禁用ItemBox的Layout组件');
            } else {
                console.warn('[LosePanelController] 未找到ItemBox的Layout组件');
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
                console.log('[LosePanelController] 已修复ItemBox容器尺寸:', transform.contentSize, '预估行数:', estimatedRows);
            }

            // 检查父节点是否有约束
            const parentNode = this.itemBoxNode.parent;
            if (parentNode) {
                const parentTransform = parentNode.getComponent(UITransform);
                const parentLayout = parentNode.getComponent('Layout') as any;
                const parentWidget = parentNode.getComponent('Widget') as any;

                if (parentTransform) {
                    console.log('[LosePanelController] 父节点尺寸:', parentTransform.contentSize);
                }

                if (parentLayout && parentLayout.enabled) {
                    console.warn('[LosePanelController] 父节点有Layout组件，可能影响布局');
                    // 禁用父节点的Layout组件
                    parentLayout.enabled = false;
                    if (parentLayout.updateLayout) {
                        parentLayout.updateLayout();
                    }
                    console.log('[LosePanelController] 已禁用父节点的Layout组件');
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
            console.error('[LosePanelController] itemBoxNode为空');
        }

        // 获取战斗过程中的经济奖励
        if (battleRewards) {
            // 如果直接传入了战斗奖励数据，直接使用
            this._battleRewards = battleRewards;
        } else {
            // 否则尝试从GameController获取
            this.getBattleRewards();
        }

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
                const economyStatus = {
                    currencies: {
                        coin: CDM.getCurrency(CurrencyType.Gold) || 0,
                        gem: CDM.getCurrency(CurrencyType.Gem) || 0,
                        heroFragment: CDM.getCurrency(CurrencyType.HeroFragment) || 0,
                        stamina: CDM.getCurrency(CurrencyType.Stamina) || 0
                    }
                };
                this._battleRewards = economyStatus.currencies;
            }
        } catch (error) {
            console.error('[LosePanelController] 获取战斗奖励失败:', error);
            this._battleRewards = {
                coin: 0,
                gem: 0,
                heroFragment: 0,
                stamina: 0
            };
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

        // 失败时只显示战斗奖励（没有关卡奖励）
        const battleRewardTypes = Object.keys(this.BATTLE_REWARD_TYPES);
        for (const currencyType of battleRewardTypes) {
            const shouldShow = this.BATTLE_REWARD_TYPES[currencyType];
            if (shouldShow && this._battleRewards[currencyType] > 0) {
                this._mergedRewards[currencyType] += this._battleRewards[currencyType];
            }
        }
    }

    /**
     * 渲染所有奖励
     */
    private renderRewards(): void {
        // 清空现有奖励显示
        if (this.itemBoxNode) {
            this.itemBoxNode.removeAllChildren();
        }

        // 渲染合并后的奖励
        this.renderMergedRewards();
        if (this.itemBoxNode) Skin1UIPolish.refreshDynamicContent(this.itemBoxNode);

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
                    console.log(`[LosePanelController] 强制更新位置: index=${index}, row=${row}, col=${col}, x=${x}, y=${y}`);
                });
                Skin1UIPolish.refreshDynamicContent(this.itemBoxNode);
            }
        }, 0.1);
    }

    /**
     * 渲染合并后的奖励
     */
    private renderMergedRewards(): void {
        if (!this.itemBoxNode) return;

        // 按优先级显示奖励：金币、钻石、宝石、英雄碎片、体力
        const displayOrder = ['coin', 'gem', 'heroFragment', 'stamina'];

        // 记录已渲染的奖励类型，避免重复
        const renderedRewards = new Set();
        let itemIndex = 0;

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
                    console.warn(`[LosePanelController] 未找到item_id为${itemId}的物品配置`);
                }
            }
        }
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
        console.log(`[LosePanelController] 设置物品位置: index=${index}, row=${row}, col=${col}, x=${x}, y=${y}, availableWidth=${availableWidth}, actualWidth=${actualWidth}`);
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

    /**
     * 复活按钮点击处理
     * 观看广告后恢复城墙全部血量并继续游戏
     */
    onRevive(): void {
        const adKey = 'revive';
        const uniqueAdKey = adKey; // 复活广告使用统一的key

        console.log('[LosePanelController] 点击复活按钮，准备播放广告');

        // 使用 AdManager 播放广告
        AdManager.showAd(
            uniqueAdKey,
            () => {
                // 广告观看成功
                console.log('[LosePanelController] 广告观看成功，开始恢复血量');
                this.handleReviveSuccess();
            },
            (reason) => {
                // 广告观看失败或未完成
                console.log('[LosePanelController] 广告观看失败或未完成:', reason);
                // 广告未看完则什么都不生效，不需要做任何处理
            },
            adKey
        );
    }

    /**
     * 处理复活成功逻辑
     * 恢复城墙全部血量，继续游戏，关闭面板
     */
    private handleReviveSuccess(): void {
        // 获取 GameController
        let gameController = null;

        // 方法1: 通过场景获取
        if (this.node.scene) {
            gameController = this.node.scene.getComponentInChildren('GameController') as any;
        }

        // 方法2: 如果方法1失败，尝试通过节点查找
        if (!gameController && this.node) {
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

        if (!gameController) {
            console.error('[LosePanelController] 无法找到 GameController，无法恢复血量');
            return;
        }

        // 获取 WallController
        let wallController: WallController = null;
        if (gameController.wallNode) {
            wallController = gameController.wallNode.getComponent(WallController);
        }

        if (!wallController) {
            console.error('[LosePanelController] 无法找到 WallController，无法恢复血量');
            return;
        }

        // 恢复城墙全部血量
        wallController.restoreFullHp();
        console.log('[LosePanelController] 城墙血量已恢复');

        // 继续游戏
        onContinue(GAME_PAUSE_REASONS.RESULT_PANEL);

        // 关闭面板
        this.node.destroy();
        console.log('[LosePanelController] 复活成功，游戏继续');
    }

    // 确定
    onSure() {
        CDM.addCurrency(CurrencyType.Gold, this._mergedRewards.coin, "战斗获取金币");
        CDM.addCurrency(CurrencyType.Gem, this._mergedRewards.gem, "战斗获取宝石");

        // 继续
        onContinue(GAME_PAUSE_REASONS.RESULT_PANEL);

        director.loadScene('Home');
    }

    update(deltaTime: number) { }
}
