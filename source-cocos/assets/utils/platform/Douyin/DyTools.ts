// DyTools.ts
import { Singleton } from '../../common/Singleton';
import { getRandomSidebarReward, grantSidebarReward } from './SidebarRewardConfig';
import type { PlatformLaunchOptions } from '../../../mini-game-sdk/src';
import {
    checkSidebar,
    getPlatformLaunchOptions,
    onPlatformShow,
    openSidebar,
    parseSidebarLaunch,
} from '../../../script/shared/sdk';

// 1. 定义抖音小游戏环境下的类型
declare global {
    interface Window {
        tt?: {
            onShow: (callback: (res: DouyinLaunchOptions) => void) => void;
            onFeedStatusChange?: (callback: (res: any) => void) => void;
            navigateToScene: (options: { scene: string; success?: () => void; fail?: (err: any) => void }) => void;
            checkScene?: (options: { scene: string; success?: (res: any) => void; fail?: (res: any) => void }) => void;
            createRewVideoAd?: (options: { adUnitId: string }) => any;
            createRewardedVideoAd?: (options: { adUnitId: string }) => any;
            shareAppMessage: (options: any) => void;
            shareToFriend: (options: any) => void;
            getUserInfo: (options: any) => void;
            getLaunchOptionsSync: () => any;
            canIUse?: (api: string) => boolean;
            reportScene?: (options: { sceneId: number; success?: () => void; fail?: (err: any) => void }) => void;
        };
    }
}

// 定义启动参数的类型
export interface DouyinLaunchOptions {
    query?: Record<string, any>;
    refererInfo?: any;
    scene?: string;
    launch_from?: string; // 关键字段：判断启动来源
    location?: string;    // 关键字段：判断具体位置，'sidebar_card' 表示侧边栏
}

// 侧边栏复访奖励数据结构
export interface ISidebarRewardData {
    lastRewardTime: number;    // 上次领取奖励时间戳
    today: string;             // 记录今天日期字符串
    totalRewardCount: number;  // 总领取次数
    todayRewardCount: number;  // 今日领取次数
    maxDailyReward: number;    // 每日最大领取次数（默认1次）
    pendingRewardClaim: boolean; // 已从侧边栏进入，等待手动领取
}

// 侧边栏复访事件类型
export enum SidebarEventType {
    REWARD_AVAILABLE = 'reward-available',      // 奖励可领取
    REWARD_GRANTED = 'reward-granted',         // 奖励已发放
    NAVIGATE_TO_SIDEBAR = 'navigate-to-sidebar', // 跳转侧边栏
    SIDEBAR_REVISIT = 'sidebar-revisit'        // 侧边栏复访
}

// 按钮文案枚举
export enum DyBtnName {
    ENTER_SIDEBAR = '进入侧边栏',
    CLAIMED = '已领取',
    REWARD = '领取奖励',
}

class DyTools extends Singleton {
    private _initialized = false;

    // 是否从侧边栏进入
    private _isFromSidebar: boolean = false;
    
    // 侧边栏复访奖励数据
    private _sidebarRewardData: ISidebarRewardData = {
        lastRewardTime: 0,
        today: '',
        totalRewardCount: 0,
        todayRewardCount: 0,
        maxDailyReward: 1,
        pendingRewardClaim: false
    };

    // 事件回调列表
    private _eventCallbacks: Map<SidebarEventType, Function[]> = new Map();
    private _unsubscribeOnShow: (() => void) | null = null;

    public onLoad(): void {
        this.ensureInitialized();
    }

    private ensureInitialized(): void {
        if (this._initialized) {
            return;
        }

        this.loadSidebarRewardData();
        this.initDouyinEvents();
        this._initialized = true;
    }

    /**
     * 初始化抖音事件监听
     */
    private initDouyinEvents() {
        const launchOptionsResult = getPlatformLaunchOptions();
        if (launchOptionsResult.ok && launchOptionsResult.value) {
            this.handleLaunchOptions(launchOptionsResult.value);
        }

        if (this._unsubscribeOnShow) {
            return;
        }

        this._unsubscribeOnShow = onPlatformShow((options) => {
            this.handleLaunchOptions(options);
        });
    }

    private handleLaunchOptions(options: PlatformLaunchOptions): void {
        const sidebarLaunch = parseSidebarLaunch(options);
        this._isFromSidebar = sidebarLaunch.fromSidebarCard;

        if (this._isFromSidebar) {
            console.log('用户从侧边栏复访进入');
            this.handleSidebarRevisit();
        } else {
            console.log('用户从其他方式进入');
        }
    }

    /**
     * 处理侧边栏复访逻辑
     */
    private handleSidebarRevisit() {
        this.refreshDailyRewardState();
        if (this.hasDailyRewardQuota()) {
            if (!this._sidebarRewardData.pendingRewardClaim) {
                this._sidebarRewardData.pendingRewardClaim = true;
                this.saveSidebarRewardData();
            }

            this.emitEvent(SidebarEventType.REWARD_AVAILABLE);
        }
        
        // 触发侧边栏复访事件
        this.emitEvent(SidebarEventType.SIDEBAR_REVISIT);
    }

    /**
     * 发放侧边栏复访奖励
     */
    public grantSidebarReward(): boolean {
        this.ensureInitialized();
        if (!this.canClaimSidebarReward()) {
            console.log('当前无法领取侧边栏复访奖励');
            return false;
        }

        // 获取随机奖励配置
        const rewardConfig = getRandomSidebarReward();
        
        // 发放具体奖励
        const rewardSuccess = grantSidebarReward(rewardConfig);
        if (!rewardSuccess) {
            console.log('发放具体奖励失败');
            return false;
        }

        // 更新奖励数据
        const now = Date.now();
        const today = new Date().toDateString();
        
        this._sidebarRewardData.lastRewardTime = now;
        this._sidebarRewardData.today = today;
        this._sidebarRewardData.totalRewardCount++;
        this._sidebarRewardData.todayRewardCount++;
        this._sidebarRewardData.pendingRewardClaim = false;

        // 保存数据
        this.saveSidebarRewardData();

        // 触发奖励发放事件，传递奖励信息
        this.emitEvent(SidebarEventType.REWARD_GRANTED, rewardConfig);

        console.log('侧边栏复访奖励发放成功:', rewardConfig.desc);
        return true;
    }

    /**
     * 检查是否可以领取侧边栏复访奖励
     */
    public canClaimSidebarReward(): boolean {
        this.ensureInitialized();
        this.refreshDailyRewardState();
        return this._sidebarRewardData.pendingRewardClaim && this.hasDailyRewardQuota();
    }

    /**
     * 获取侧边栏复访奖励状态信息
     */
    public getSidebarRewardStatus(): {
        canClaim: boolean;
        todayCount: number;
        maxDaily: number;
        lastRewardTime: number;
    } {
        this.ensureInitialized();
        return {
            canClaim: this.canClaimSidebarReward(),
            todayCount: this._sidebarRewardData.todayRewardCount,
            maxDaily: this._sidebarRewardData.maxDailyReward,
            lastRewardTime: this._sidebarRewardData.lastRewardTime
        };
    }

    /**
     * 获取是否从侧边栏进入
     */
    public get isFromSidebar(): boolean {
        this.ensureInitialized();
        return this._isFromSidebar;
    }

    /**
     * 跳转到侧边栏场景:cite[4]
     */
    public navigateToSidebar(): void {
        this.ensureInitialized();
        void openSidebar().then((result) => {
            if (result.ok) {
                console.log("跳转到侧边栏成功");
            } else {
                const failure = result as { readonly message?: string; readonly reason: string; readonly raw?: unknown };
                console.error("跳转到侧边栏失败", failure.message || failure.reason, failure.raw);
            }
        });
    }

    /**
     * 检查侧边栏场景是否可用:cite[4]
     */
    public checkSidebarSceneAvailable(callback: (available: boolean) => void): void {
        this.ensureInitialized();
        void checkSidebar().then((result) => {
            callback(result.ok && result.value.available === true);
        });
    }

    /**
     * 添加事件监听
     */
    public addEventListener(eventType: SidebarEventType, callback: Function): void {
        this.ensureInitialized();
        if (!this._eventCallbacks.has(eventType)) {
            this._eventCallbacks.set(eventType, []);
        }
        this._eventCallbacks.get(eventType)!.push(callback);
    }

    /**
     * 移除事件监听
     */
    public removeEventListener(eventType: SidebarEventType, callback: Function): void {
        this.ensureInitialized();
        const callbacks = this._eventCallbacks.get(eventType);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * 触发事件
     */
    private emitEvent(eventType: SidebarEventType, data?: any): void {
        const callbacks = this._eventCallbacks.get(eventType);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`事件回调执行失败: ${eventType}`, error);
                }
            });
        }
    }

    /**
     * 加载侧边栏奖励数据
     */
    private loadSidebarRewardData(): void {
        try {
            const savedData = localStorage.getItem('sidebar_reward_data');
            if (savedData) {
                const parsed = JSON.parse(savedData);
                this._sidebarRewardData = { ...this._sidebarRewardData, ...parsed };
            }
        } catch (error) {
            console.warn('加载侧边栏奖励数据失败', error);
        }
    }

    /**
     * 保存侧边栏奖励数据
     */
    private saveSidebarRewardData(): void {
        try {
            localStorage.setItem('sidebar_reward_data', JSON.stringify(this._sidebarRewardData));
        } catch (error) {
            console.warn('保存侧边栏奖励数据失败', error);
        }
    }

    /**
     * 重置侧边栏奖励数据（用于测试或重置）
     */
    public resetSidebarRewardData(): void {
        this.ensureInitialized();
        this._sidebarRewardData = {
            lastRewardTime: 0,
            today: new Date().toDateString(),
            totalRewardCount: 0,
            todayRewardCount: 0,
            maxDailyReward: 1,
            pendingRewardClaim: false
        };
        this.saveSidebarRewardData();
    }

    private refreshDailyRewardState(): void {
        const today = new Date().toDateString();
        if (this._sidebarRewardData.today === today) {
            return;
        }

        this._sidebarRewardData.today = today;
        this._sidebarRewardData.todayRewardCount = 0;
        this._sidebarRewardData.pendingRewardClaim = false;
        this.saveSidebarRewardData();
    }

    private hasDailyRewardQuota(): boolean {
        return this._sidebarRewardData.todayRewardCount < this._sidebarRewardData.maxDailyReward;
    }
}

export const DYT = DyTools.instance(); 
