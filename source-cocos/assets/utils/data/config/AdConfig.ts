/**
 * 广告配置文件，支持每个广告点独立配置最大次数、间隔、奖励类型等
 * 可根据业务需求灵活扩展
 */
export interface IAdConfigItem {
    /** 广告点唯一key */
    key: string;
    /** 单日最大可观看次数（0为无限制） */
    maxPerDay: number;
    /** 总最大可观看次数（0为无限制） */
    maxTotal: number;
    /** 两次观看最小间隔（秒） */
    minInterval: number;
    /** 广告奖励类型（如资源、复活、抽奖等） */
    rewardType: string;
    /** 其他自定义参数 */
    [key: string]: any;
}

/**
 * 广告点配置表
 * key为广告点唯一标识
 */
export const AdConfig: { [key: string]: IAdConfigItem } = {
    talent_get: {
        key: 'talent_get',
        maxPerDay: 0,
        maxTotal: 0,
        minInterval: 30, // 秒
        rewardType: 'talent',
    },
    revive: {
        key: 'revive',
        maxPerDay: 0,
        maxTotal: 0,
        minInterval: 0,
        rewardType: 'revive',
    },
    lottery: {
        key: 'lottery',
        maxPerDay: 5,
        maxTotal: 0,
        minInterval: 60,
        rewardType: 'lottery',
    },
    speed_boost: {
        key: 'speed_boost',
        maxPerDay: 5,
        maxTotal: 0,
        minInterval: 300,
        rewardType: 'speed_boost',
        maxSpeedScale: 3, // 最大加速倍数
    },
    damage_boost: {
        key: 'damage_boost',
        maxPerDay: 5,
        maxTotal: 0,
        minInterval: 300,
        rewardType: 'damage_boost',
    },
    store_coin_free: {
        key: 'store_coin_free',
        maxPerDay: 5,
        maxTotal: 0,
        minInterval: 300,
        rewardType: 'coin',
    },
    store_gem_free: {
        key: 'store_gem_free',
        maxPerDay: 99,
        maxTotal: 0,
        minInterval: 600,
        rewardType: 'gem',
    },
    skill_get_all: {
        key: 'skill_get_all',
        maxPerDay: 0,
        maxTotal: 0,
        minInterval: 0,
        rewardType: 'skill_all',
    },
    daily_gift_claim: {
        key: 'daily_gift_claim',
        maxPerDay: 0,
        minInterval: 0,
        maxTotal: 0,
        rewardType: 'currency',
    },
    shop_goods_ad: {
        key: 'shop_goods_ad',
        maxPerDay: 0, // 没有次数限制
        minInterval: 0, // 无间隔限制
        maxTotal: 0, // 不限制总次数
        rewardType: 'currency',
    }
}; 