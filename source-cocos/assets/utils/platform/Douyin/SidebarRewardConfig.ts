/**
 * 侧边栏复访奖励配置
 * 用于管理抖音侧边栏复访能力的奖励内容
 */

import { CDM, CurrencyType } from "../../common/CurrencyManager";
import { gameBus } from "../../signal/GameBus";
import { SIGNAL_TYPES } from "../../signal/ISignal";

// 奖励配置接口
export interface IRewardConfig {
    type: CurrencyType;        // 奖励类型
    amount: number;          // 奖励数量
    desc: string;            // 奖励描述
    icon?: string;           // 奖励图标路径
    heroId?: number;         // 英雄ID（当奖励为指定英雄碎片时使用）
}

// 侧边栏复访奖励配置
export const SidebarRewardConfig: IRewardConfig[] = [
    {
        type: CurrencyType.Gold,
        amount: 100,
        desc: "晶币 x100",
        icon: 'textures/icon/res/coin/spriteFrame'
    },
    {
        type: CurrencyType.Gem,
        amount: 10,
        desc: "棱钻 x10",
        icon: 'textures/icon/res/gem/spriteFrame'
    },
    {
        type: CurrencyType.Stamina,
        amount: 20,
        desc: "能量 x20",
        icon: 'textures/icon/res/stamina/spriteFrame'
    },
    {
        type: CurrencyType.HeroFragment,
        amount: 5,
        desc: "晶核碎片 x5",
        icon: 'textures/ui/popup/fragment/spriteFrame'
    }
];

// 获取随机奖励配置
export function getRandomSidebarReward(): IRewardConfig {
    const randomIndex = Math.floor(Math.random() * SidebarRewardConfig.length);
    return SidebarRewardConfig[randomIndex];
}

// 根据类型获取奖励配置
export function getRewardConfigByType(type: CurrencyType): IRewardConfig {
    return SidebarRewardConfig.find(config => config.type === type) || SidebarRewardConfig[0];
}

// 奖励发放逻辑
export function grantSidebarReward(rewardConfig: IRewardConfig): boolean {
    try {
        const reason = `douyin_sidebar_reward:${new Date().toDateString()}`;
        const success = rewardConfig.type === CurrencyType.HeroFragment && rewardConfig.heroId != null
            ? CDM.rewardHeroFragment(rewardConfig.heroId, rewardConfig.amount, reason)
            : CDM.addCurrency(rewardConfig.type, rewardConfig.amount, reason);

        if (!success) {
            console.error('[SidebarReward] 发放失败:', rewardConfig);
            return false;
        }

        gameBus.emit(SIGNAL_TYPES.REWARD_RECEIVED, {
            items: [{
                type: rewardConfig.type,
                amount: rewardConfig.amount,
                heroId: rewardConfig.heroId,
                iconPath: rewardConfig.type === CurrencyType.HeroFragment && rewardConfig.heroId == null
                    ? 'textures/ui/popup/fragment/spriteFrame'
                    : undefined,
            }],
            reason,
            source: 'douyin_sidebar',
        });

        console.log(`发放侧边栏复访奖励: ${rewardConfig.desc}`);
        return true;
    } catch (error) {
        console.error('发放侧边栏复访奖励失败:', error);
        return false;
    }
}
