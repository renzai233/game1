import { AdConfig, IAdConfigItem } from '../data/config/AdConfig';
import { Node, instantiate, Label, Button, Sprite, Color, UITransform, Prefab } from 'cc';
import { loadAsset } from '../utils';
import { EDM } from '../data/env/ConfigManager';
import { Platform } from '../data/env/GameConfig.type';
import { PDM } from '../data/config/player/PlayerDataManager';
import type { CapabilityFailureReason } from '../../mini-game-sdk/src';
import { canShowRewardedVideo, showRewardedVideo } from '../../script/shared/sdk';

/**
 * 广告统计数据结构
 * 微信文档开发广告：https://developers.weixin.qq.com/minigame/dev/guide/open-ability/ad/ad.html
 * 抖音开放平台开发文档-广告：https://partner.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/open-ability/ad/incentive-ads
 */
interface IAdStatsItem {
    totalCount: number;      // 总次数
    todayCount: number;      // 今日次数
    lastWatchTime: number;   // 最后一次观看时间戳
    today: string;           // 今日日期字符串
}

/**
 * @deprecated Temporary legacy compatibility shim.
 *
 * Keep this file only as the current `showAd` / `canShowAd` call surface until
 * mini-game-sdk exposes the high-level rewarded ads / reward module. New code
 * should not expand this class; platform playback already delegates to SDK.
 */
export class AdManager {
    /** 初始化广告统计数据 */
    static init() {
        const localStats = loadAdStats();
        PDM.updateAdStats(localStats || {});
    }

    /** 获取某广告点的统计数据 */
    static getAdStats(adKey: string): IAdStatsItem {
        return loadAdStats();
    }

    /**
     * 通用广告奖励发放方法
     * @param adKey 广告点key
     * @param itemData 当前资源项数据
     */
    static grantAdReward(adKey: string, itemData: any) {
        // 根据adKey和itemData发放奖励，支持多种类型
        const config = AdConfig[adKey];
        if (!config) return;
        switch (config.rewardType) {
            case 'talent':
                // 天赋奖励示例：提升星级或加速等
                if (itemData && typeof itemData.star === 'number' && itemData.star < itemData.maxStar) {
                    itemData.star++;
                }
                break;
            case 'revive':
                // 复活奖励逻辑
                // ...
                break;
            case 'lottery':
                // 抽奖奖励逻辑
                // ...
                break;
            default:
                // 其他类型奖励
                break;
        }
    }

    /**
     * 创建广告按钮节点（抽象方法，便于复用）
     */
    static createAdButton(adKey: string, uniqueAdKey: string, itemData: any, onReward: (itemData?: any) => void, options?: { label?: string, onActiveChange?: (active: boolean) => void, width?: number }) {
        return new Promise<Node>((resolve) => {
            loadAsset('prefab/ui/BaseBtn', (prefab: Prefab) => {
                const btnNode = instantiate(prefab);
                btnNode.name = 'BaseBtn';
                // 阻止事件冒泡，防止穿透
                btnNode.on(Node.EventType.TOUCH_START, (e) => { if (e.stopPropagationImmediate) e.stopPropagationImmediate(); e.propagationStopped = true; }, btnNode);
                btnNode.on(Node.EventType.TOUCH_END, (e) => { if (e.stopPropagationImmediate) e.stopPropagationImmediate(); e.propagationStopped = true; }, btnNode);
                btnNode.on(Node.EventType.TOUCH_CANCEL, (e) => { if (e.stopPropagationImmediate) e.stopPropagationImmediate(); e.propagationStopped = true; }, btnNode);
                // 设置宽度
                if (options?.width) {
                    btnNode.getComponent(UITransform).width = options.width;
                }
                // 状态刷新逻辑
                const updateBtn = () => {
                    const stats = this.getAdStats(uniqueAdKey);
                    const config = AdConfig[adKey];
                    const check = this.canShowAd(uniqueAdKey, adKey);
                    const labelNode = btnNode.getChildByName('Layout').getChildByName('Label');
                    let labelComp = labelNode && labelNode.getComponent(Label);
                    let left = config.maxPerDay > 0 ? Math.max(0, config.maxPerDay - stats.todayCount) : '∞';
                    // 判断间隔
                    const now = Date.now();
                    let intervalLeft = 0;
                    if (config.minInterval > 0 && stats.lastWatchTime > 0) {
                        intervalLeft = Math.max(0, config.minInterval - Math.floor((now - stats.lastWatchTime) / 1000));
                    }
                    if (config.maxPerDay === 0) {
                        // 不限制次数
                        if (labelComp) labelComp.string = options?.label || '免费领取';
                    } else if (!check.can && intervalLeft > 0) {
                        // 显示倒计时
                        if (labelComp) labelComp.string = `等待${intervalLeft}s`;
                    } else {
                        // 显示剩余次数
                        if (labelComp) labelComp.string = `免费获取次数：${left}`;
                    }
                    // 按钮状态
                    const btnComp = btnNode.getComponent(Button);
                    if (btnComp) btnComp.interactable = check.can;
                    btnNode.getChildByName('Bg').getComponent(Sprite).color = check.can ? Color.WHITE : Color.GRAY;
                    // 通知业务层其它按钮状态
                    if (options?.onActiveChange) options.onActiveChange(check.can);
                };
                // 定时刷新
                let timer = setInterval(updateBtn, 1000);
                // 初始刷新
                updateBtn();
                // 点击事件
                btnNode.on(Button.EventType.CLICK, () => {
                    this.showAd(uniqueAdKey, () => {
                        this.grantAdReward(adKey, itemData);
                        onReward && onReward(itemData);
                        updateBtn();
                    }, (reason) => {
                        // 可选：弹窗提示
                    }, adKey);
                });
                // 销毁时清理定时器
                btnNode.on(Node.EventType.NODE_DESTROYED, () => {
                    clearInterval(timer);
                });
                resolve(btnNode);
            }, Prefab);
        });
    }

    /**
     * mode: 'row'（并排自适应宽度） | 'replace'（只显示一个按钮并替换原有按钮）
     * row模式：自动计算宽度并排显示
     * replace模式：只显示一个广告按钮，隐藏其它同级按钮
     */
    static async attachAdButton(parentNode: Node, adKey: string, onReward?: (itemData?: any) => void, options?: { itemKey?: string, label?: string, itemData?: any, onActiveChange?: (active: boolean) => void, mode?: 'row' | 'replace' }) {
        const itemKey = options?.itemKey || '';
        const itemData = options?.itemData;
        const onActiveChange = options?.onActiveChange;
        const mode = options?.mode || 'row';
        const uniqueAdKey = itemKey ? `${adKey}_${itemKey}` : adKey;
        if (mode === 'replace') {
            // 替换模式：只显示一个广告按钮，隐藏其它同级按钮
            // 隐藏其它按钮
            parentNode.children.forEach(child => {
                if (child.name !== 'BaseBtn') child.active = false;
            });
            // 移除已有广告按钮
            parentNode.children.filter(child => child.name === 'BaseBtn').forEach(child => child.destroy());
            // 创建并添加广告按钮
            const btnNode = await this.createAdButton(adKey, uniqueAdKey, itemData, onReward, { label: options?.label, onActiveChange });
            parentNode.addChild(btnNode);
            btnNode.setPosition(0, 0);
        } else {
            // 并排模式：自动计算宽度
            // 统计同级广告按钮数量
            const adBtnCount = parentNode.children.filter(child => child.name === 'BaseBtn').length + 1;
            const panelWidth = parentNode.getComponent(UITransform)?.width || 400;
            const btnWidth = Math.min(160, Math.floor(panelWidth / adBtnCount) - 10);
            // 创建并添加广告按钮
            const btnNode = await this.createAdButton(adKey, uniqueAdKey, itemData, onReward, { label: options?.label, onActiveChange, width: btnWidth });
            parentNode.addChild(btnNode);
            // 重新布局所有广告按钮
            const btns = parentNode.children.filter(n => n.name === 'BaseBtn');
            btns.forEach((btn, idx) => {
                btn.getComponent(UITransform).width = btnWidth;
                btn.setPosition(-panelWidth / 2 + btnWidth / 2 + idx * (btnWidth + 10), 0);
            });
        }
    }

    /**
     * 支持传入原始adKey用于查找配置
     */
    static canShowAd(uniqueAdKey: string, adKey?: string): { can: boolean; reason?: string } {
        const config: IAdConfigItem = AdConfig[adKey || uniqueAdKey];
        if (!config) return { can: false, reason: '广告配置不存在' };
        const stats = this.getAdStats(uniqueAdKey);
        // 判断总次数
        if (config.maxTotal > 0 && stats.totalCount >= config.maxTotal) {
            return { can: false, reason: '已达最大总次数' };
        }
        // 判断今日次数
        if (config.maxPerDay > 0 && stats.todayCount >= config.maxPerDay) {
            return { can: false, reason: '今日次数已用完' };
        }
        // 判断间隔
        const now = Date.now();
        if (config.minInterval > 0 && stats.lastWatchTime > 0 && now - stats.lastWatchTime < config.minInterval * 1000) {
            return { can: false, reason: '距离上次观看间隔不足' };
        }
        return { can: true };
    }

    /**
     * 平台广告调用（微信/抖音）
     */
    private static playPlatformAd(adKey: string, onSuccess: () => void, onFail?: (reason: string) => void) {
        const { adPlatform, adUnitId } = EDM.config;
        console.log('[AdManager][playPlatformAd]', adKey, adPlatform, adUnitId);

        if (adPlatform !== Platform.WX && adPlatform !== Platform.DOUYIN) {
            console.log('[AdManager][playPlatformAd]', adKey);
            this.simulateAd(adKey, onSuccess, onFail);
            return;
        }

        if (!canShowRewardedVideo()) {
            this.simulateAd(adKey, onSuccess, onFail);
            return;
        }

        void showRewardedVideo()
            .then((result) => {
                if (result.ok === false) {
                    onFail && onFail(this.mapRewardedFailure(result.reason));
                    return;
                }

                if (result.value.completed) {
                    onSuccess && onSuccess();
                } else {
                    onFail && onFail(this.mapRewardedFailure('closed'));
                }
            })
            .catch((error) => {
                if (EDM.isDev()) console.error('[AdManager][playPlatformAd] SDK广告播放异常', error);
                onFail && onFail('广告播放失败');
            });
    }

    private static mapRewardedFailure(reason: CapabilityFailureReason | 'closed'): string {
        switch (reason) {
            case 'closed':
            case 'user_cancelled':
                return '未完整观看广告';
            case 'timeout':
                return '广告播放超时';
            case 'busy':
                return '广告正在播放中';
            case 'not_configured':
                return '广告配置不存在';
            case 'unsupported':
            case 'unavailable':
                return '广告暂不可用';
            default:
                return '广告播放失败';
        }
    }

    /**
     * 支持传入原始adKey用于查找配置
     */
    static showAd(uniqueAdKey: string, onSuccess: () => void, onFail?: (reason: string) => void, adKey?: string) {
        if (!EDM.config.enableAd) {
            onFail && onFail('广告功能未开启');
            return;
        }
        const check = this.canShowAd(uniqueAdKey, adKey);
        if (!check.can) {
            onFail && onFail(check.reason || '不可观看广告');
            return;
        }
        // 平台广告调用
        this.playPlatformAd(uniqueAdKey, () => {
            this.recordAdWatch(uniqueAdKey);
            onSuccess && onSuccess();
        }, onFail);
    }

    /**
     * 模拟广告播放（实际项目中替换为真实广告SDK调用）
     */
    private static simulateAd(adKey: string, onSuccess: () => void, onFail?: (reason: string) => void) {
        // 模拟异步广告
        setTimeout(() => {
            const isSuccess = Math.random() > 0.1; // 90%成功
            if (isSuccess) {
                onSuccess && onSuccess();
            } else {
                onFail && onFail('广告播放失败');
            }
        }, 1000);
    }

    /** 记录广告观看 */
    static recordAdWatch(adKey: string) {
        const stats = this.getAdStats(adKey);
        stats.totalCount++;
        stats.todayCount++;
        stats.lastWatchTime = Date.now();
        stats.today = new Date().toDateString();
        saveAdStats(stats);
    }
}


/**
 * 保存广告统计数据到本地
 * @param adStats 广告统计数据对象
 */
export function saveAdStats(adStats: any) {
    try {
        localStorage.setItem('ad_stats', JSON.stringify(adStats));
    } catch (e) {
        console.warn('保存广告统计数据失败', e);
    }
}

/**
 * 从本地加载广告统计数据
 */
export function loadAdStats(): any {
    try {
        const str = localStorage.getItem('ad_stats');
        if (str) return JSON.parse(str);
    } catch (e) {
        console.warn('加载广告统计数据失败', e);
    }
    return {};
}

// 启动时自动初始化
AdManager.init();
