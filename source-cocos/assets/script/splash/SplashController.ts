import { _decorator, Component, Node, ProgressBar, view, UITransform, director, Label, AssetManager } from 'cc';
import { assetManager } from 'cc';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';
import { BAG_TAB_TYPE } from '../bag/BagConfig';
import { CDM, CurrencyType } from 'db://assets/utils/common/CurrencyManager';
import { PDM } from '../../utils/data/config/player/PlayerDataManager';
import { MDM } from '../../utils/data/config/monster/MonsterDataManager';
import { HDM } from '../../utils/data/config/hero/HeroDataManager';
import { SDM } from '../../utils/data/config/skill/SkillDataManager';
import { LDM } from '../../modules/level/config/LevelDataManager';
import { captureLaunchContext, notifySceneReady, startGameSdk } from '../shared/sdk';
import { Skin1UIPolish } from '../../utils/ui/skin1/Skin1UIPolish';
const { ccclass, property } = _decorator;

/**
 * SplashController 启动/加载界面控制器
 * 负责游戏启动时的资源预加载、进度条显示、跳转到主场景（Home）
 */
@ccclass('SplashController')
export class SplashController extends Component {
    @property(Node)
    progressBarNode: Node; // 进度条节点
    @property(Label)
    gameName: Label; // 游戏名称

    private readonly minSplashVisibleMs = 3500;
    private readonly resourcePreloadTimeoutMs = 30000;
    private readonly runtimeBundleNames = ['resources', 'configs', 'prefabs', 'res'];

    /**
     * 生命周期方法，场景加载后自动调用
     * 负责初始化启动流程
     */
    start() {
        // localStorage.clear();
        void startGameSdk();
        captureLaunchContext();
        this.init();
    }

    /**
     * 初始化方法
     * 主要负责基础数据初始化和资源加载
     */
    async init() {
        const visibleStartedAt = Date.now();
        if (this.gameName) this.gameName.string = '';
        this.initUI();
        this.setProgress(0);

        try {
            await this.animateProgressTo(0.12, 250);
            await this.initDataManagers();
            await this.animateProgressTo(0.45, 350);
            await this.loadResources((progress) => {
                this.setProgress(0.45 + progress * 0.45);
            });
            await this.animateProgressTo(0.9, 250);
        } catch (error) {
            if (EDM.isDev()) console.warn('[SplashController] 启动加载流程异常，继续进入主页:', error);
        }

        await this.waitForMinimumVisibleTime(visibleStartedAt);
        await this.animateProgressTo(1, 500);

        // Web Demo 必须先进入主页，由玩家点击开始后再进入关卡。
        director.loadScene('Home', () => {
            notifySceneReady('Home');
        })
    }

    private setProgress(value: number): void {
        const progressBar = this.progressBarNode?.getComponent(ProgressBar);
        if (!progressBar) return;
        progressBar.progress = Math.max(0, Math.min(1, value));
    }

    private getProgress(): number {
        return this.progressBarNode?.getComponent(ProgressBar)?.progress ?? 0;
    }

    private animateProgressTo(target: number, durationMs: number): Promise<void> {
        const from = this.getProgress();
        const to = Math.max(0, Math.min(1, target));
        const duration = Math.max(1, durationMs);

        return new Promise((resolve) => {
            const startedAt = Date.now();
            const tick = () => {
                const ratio = Math.min(1, (Date.now() - startedAt) / duration);
                this.setProgress(from + (to - from) * ratio);
                if (ratio >= 1) {
                    resolve();
                    return;
                }
                setTimeout(tick, 16);
            };
            tick();
        });
    }

    private waitForMinimumVisibleTime(visibleStartedAt: number): Promise<void> {
        const elapsed = Date.now() - visibleStartedAt;
        const remaining = this.minSplashVisibleMs - elapsed;
        if (remaining <= 0) return Promise.resolve();
        return new Promise((resolve) => setTimeout(resolve, remaining));
    }

    async initDataManagers() {
        if (EDM.isDev()) console.log('[SplashController] 开始初始化数据管理器...')

        try {
            // 任务1：初始化配置系统
            await this.updateProgress('初始化配置系统');
            await EDM.init();

            // 任务2：初始化单位数据管理器
            await this.updateProgress('加载游戏配置');
            await MDM.initialize() // 初始化怪物资源数据管理器
            await HDM.initialize() // 初始化英雄运行数据管理器
            await SDM.initialize() // 初始化技能数据管理器

            // 任务3：初始化玩家数据管理器
            await this.updateProgress('初始化玩家数据');
            await PDM.initialize();

            // 任务3：初始化关卡数据管理器
            await this.updateProgress('初始化关卡数据');
            await LDM.initialize();

            // 任务7：初始化玩家物资
            await CDM.init();


            // 初始化背包数据
            this.initBagData();

            if (EDM.isDev()) console.log('[SplashController] 所有数据管理器初始化完成')
        } catch (error) {
            if (EDM.isDev()) console.error('[SplashController] 数据管理器初始化失败:', error)
            // 即使初始化失败，也让游戏继续
        }
    }

    private updateProgress(taskName: string): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(() => {
                if (EDM.isDev()) console.log(`[SplashController] ${taskName}完成`)
                resolve()
            }, 80) // 很小的延迟，让进度更新更平滑
        })
    }

    /**
     * 初始化背包数据
     */
    private initBagData(): void {
        if (EDM.isDev()) if (EDM.isDev()) console.log('[SplashController] 开始初始化背包数据...');
        const bagList = PDM.getBagList();
        if (EDM.isDev()) if (EDM.isDev()) console.log('[SplashController] 当前背包状态:', {
            coin: CDM.getCoin(),
            gem: CDM.getGem(),
            stamina: CDM.getStamina(),
            bagListLength: bagList?.length || 0
        });

        const newBagList: any[] = [];

        // 添加金币物品
        const coinItem = {
            id: 'coin01',
            name: "晶币",
            desc: "晶核防线基础货币",
            icon: 'textures/icon/res/coin01/spriteFrame',
            ownNum: CDM.getCoin(),
            resType: CurrencyType.Gold,
            tabType: BAG_TAB_TYPE.CURRENCY,
        };
        newBagList.push(coinItem);
        if (EDM.isDev()) if (EDM.isDev()) console.log('[SplashController] 添加金币物品:', coinItem);

        // 添加宝石物品
        const gemItem = {
            id: 'gem',
            name: "棱钻",
            desc: "晶核防线高级货币",
            icon: 'textures/icon/res/gem/spriteFrame',
            ownNum: CDM.getGem(),
            resType: CurrencyType.Gem,
            tabType: BAG_TAB_TYPE.CURRENCY,
        };
        newBagList.push(gemItem);
        if (EDM?.isDev()) if (EDM.isDev()) console.log('[SplashController] 添加宝石物品:', gemItem);

        // 添加英雄碎片物品
        const fragmentItem = {
            id: '1',
            name: "晶核碎片",
            desc: "用于守卫升级和升星",
            icon: 'textures/hero/default/portrait/spriteFrame',
            ownNum: 10,
            resType: CurrencyType.HeroFragment,
            tabType: BAG_TAB_TYPE.FRAGMENT,
        };
        newBagList.push(fragmentItem);
        if (EDM?.isDev()) if (EDM.isDev()) console.log('[SplashController] 添加英雄碎片物品:', fragmentItem);

        // 添加体力物品
        const staminaItem = {
            id: 'stamina',
            name: "能量",
            desc: "晶核防线行动力",
            icon: 'textures/icon/res/stamina/spriteFrame',
            ownNum: CDM.getStamina(),
            resType: CurrencyType.Stamina,
            tabType: BAG_TAB_TYPE.CURRENCY,
        };
        newBagList.push(staminaItem);
        if (EDM?.isDev()) if (EDM.isDev()) console.log('[SplashController] 添加体力物品:', staminaItem);

        PDM.updateBagList(newBagList);
        if (EDM?.isDev()) if (EDM.isDev()) console.log('[SplashController] 背包数据初始化完成，共', newBagList.length, '个物品: ', newBagList);
    }

    /**
     * 初始化视图大小
     */
    initUI() {
        EDM.config.viewWidth = view.getVisibleSize().width;
        EDM.config.viewHeight = view.getVisibleSize().height;
        this.node.getComponent(UITransform).setContentSize(EDM.config.viewWidth, EDM.config.viewHeight);
        Skin1UIPolish.applySplash(this.node);
    }

    /**
     * 资源预加载方法
     * 预加载运行时主要 bundle 下的全部资源，并更新进度条。
     * 预加载完成后自动跳转到 Home 场景
     */
    private async loadResources(onProgress?: (progress: number) => void) {
        const bundleNames = this.runtimeBundleNames;
        for (let index = 0; index < bundleNames.length; index++) {
            const bundleName = bundleNames[index];
            await this.preloadBundleRoot(bundleName, (bundleProgress) => {
                onProgress?.((index + bundleProgress) / bundleNames.length);
            });
        }
        onProgress?.(1);
    }

    private preloadBundleRoot(bundleName: string, onProgress?: (progress: number) => void): Promise<void> {
        return new Promise<void>((resolve) => {
            let settled = false;
            let timeoutId: ReturnType<typeof setTimeout> | null = null;

            const finish = (err?: Error | null) => {
                if (settled) return;
                settled = true;
                if (timeoutId) clearTimeout(timeoutId);
                if (err && EDM.isDev()) console.warn(`[SplashController] ${bundleName} bundle 预加载异常，继续启动:`, err);
                if (EDM.isDev()) console.log(`[SplashController] ${bundleName} bundle 预加载结束`);
                onProgress?.(1);
                resolve();
            };

            timeoutId = setTimeout(() => {
                finish(new Error(`${bundleName} bundle preload timeout ${this.resourcePreloadTimeoutMs}ms`));
            }, this.resourcePreloadTimeoutMs);

            this.getBundle(bundleName, (bundle, err) => {
                if (err || !bundle) {
                    finish(err || new Error(`${bundleName} bundle not found`));
                    return;
                }

                const bundleAny = bundle as unknown as {
                    preloadDir?: (
                        path: string,
                        onProgress: (finished: number, total: number) => void,
                        onComplete: (error: Error | null) => void,
                    ) => void;
                };

                if (typeof bundleAny.preloadDir !== 'function') {
                    finish(null);
                    return;
                }

                bundleAny.preloadDir(
                    '',
                    (finished, total) => {
                        const progress = total > 0 ? finished / total : 1;
                        onProgress?.(Math.max(0, Math.min(1, progress)));
                        if (EDM.isDev()) console.log(`[SplashController] 预加载 ${bundleName}: ${finished}/${total}`);
                    },
                    (preloadErr) => {
                        finish(preloadErr);
                    },
                );
            });
        });
    }

    private getBundle(bundleName: string, callback: (bundle: AssetManager.Bundle | null, err?: Error | null) => void): void {
        const existing = assetManager.bundles.get(bundleName);
        if (existing) {
            callback(existing);
            return;
        }

        assetManager.loadBundle(bundleName, (err, bundle) => {
            callback(bundle || null, err || null);
        });
    }
}
