/**
 * 运行时玩家数据类型
 */
import { CurrencyType } from "../../../common/CurrencyManager";
import { IBagItemConfig } from "db://assets/script/bag/BagConfig";


// 用户配置
export interface IUserConfig {
    uid: string; // 用户唯一标识
    userName: string; // 用户名称
    userAvatar: string; // 用户头像
    userPhone?: string; // 用户手机号
    userEmail?: string; // 用户邮箱
    userInviterCode: string; // 用户邀请码
    userInvitedCodes: string[]; // 用户邀请列表
    userPassword?: string; // 用户密码（加密存储）

    // 设置
    soundVolume: number; // 音效音量 0~1
    musicVolume: number; // 音乐音量 0~1
    isMusicOn: boolean; // 音乐开关
    isSoundOn: boolean; // 音效开关
    isVibrationOn: boolean; // 震动开关

    // 第三方数据
    userDouyinId?: string; // 用户抖音ID
    userWeChatId?: string; // 用户微信ID
    userQQId?: string; // 用户QQ ID
}

// 广告统计数据
export interface IAdStats {
    [adId: string]: {
        clickCount: number; // 点击次数
        rewardCount: number; // 奖励次数，也就是看完广告的次数
        clickTimeList: [
            string, // 点击时间
            boolean,  // 是否看完, true表示看完，false表示未看完
            number  // 看了多少秒
        ]; // 广告统计点击时间列表
    }
}

// 玩家运行时数据
export interface IPlayerProgress {
    playerLevel: number; // 玩家等级
    levelIndex: number; // 当前关卡
    latestLevel: number; // 最新关卡
    stars: number[]; // 英雄星级
    heroIds: number[]; // 已有英雄
    lastLoginTime: string; // 上次登录时间
    today: string; // 记录今天日期
    viewScale: number; // 视图缩放
    isAdVip: boolean; // 是否免广告用户
    vipLevel: number; // VIP等级
    adCount: number; // 广告观看次数
    adStats: IAdStats; // 广告统计
}

// 玩家完整数据
export interface IPlayer {
    user: IUserConfig; // 基础数据
    progress: IPlayerProgress; // 运行时数据
    currencies: Map<CurrencyType, any>; // 玩家货币
    bagList: IBagItemConfig[]; // 背包数据
    equipments: number[]; // 已穿装备
    heroes: number[]; // 上阵英雄
    talents: number[]; // 已学天赋
    stocks: number[]; // 仓库库存
}