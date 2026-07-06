import { IHeroConfig } from 'db://assets/utils/data/config/hero/IHeroConfig';

// 结算模式：expected=按期望值计算；simulate=按概率模拟（当前未启用）
export type CalcMode = 'expected' | 'simulate';
// 取整规则：floor_with_chance=向下取整+小数概率补发；floor=向下；ceil=向上；round=四舍五入
export type CalcRounding = 'floor_with_chance' | 'floor' | 'ceil' | 'round';

// 离线奖励全局配置（来自 offline_rewards.json 第0项）
export interface OfflineRewardConfig {
    maxHoursPerDay: number; // 最大累计小时数（封顶）
    fullRateHours: number; // 全额收益时长（小时）
    tailHours: number; // 递减阶段时长（小时）
    tailMultiplier: number; // 递减阶段倍率（如0.5表示后4小时减半）
    minClaimIntervalSeconds: number; // 领取冷却（最小间隔秒）
    maxQuickPatrolPerDay: number; // 每日快速巡逻上限
    efficiency: number; // 全局效率倍率（如0.02）
    allowedItemTypes: string[]; // 允许结算的掉落类型
    calcMode: CalcMode; // 结算模式
    calcRounding: CalcRounding; // 取整规则
    rarityWhitelist: string[]; // 允许的稀有度集合（C/R/L/SSR）
    rarityFold: Record<string, string>; // 稀有度折叠映射（如UC->C）
    fallbackOrder: string[]; // 稀有度降级顺序
}

// 单个英雄碎片奖励条目
export interface OfflineRewardFragment {
    heroId: number; // 英雄ID
    amount: number; // 碎片数量
}

// 待领取的离线奖励快照
export interface OfflineRewardPending {
    generatedAt: number; // 生成时间戳（ms）
    durationSeconds: number; // 原始累计秒数（封顶后）
    effectiveSeconds: number; // 递减规则后的有效秒数
    levelIndex: number; // 最大关卡索引
    levelId: number; // 关卡ID（用于追溯）
    gold: number; // 结算金币
    totalFragments: number; // 结算碎片总数
    fragments: OfflineRewardFragment[]; // 碎片分配明细
}

// 本地持久化状态（记录上次领取与待领取）
export interface OfflineRewardState {
    lastClaimTime: number; // 上次领取时间戳（ms）
    pending?: OfflineRewardPending; // 待领取奖励
}

// “每小时固定收益”表的一行
export interface OfflineRewardRateEntry {
    levelIndex: number; // 关卡索引
    goldPerHour: number; // 每小时金币
    fragmentPerHour: number; // 每小时碎片
}

// 引擎输入（纯计算所需的所有数据）
export interface OfflineRewardInput {
    config: OfflineRewardConfig; // 全局配置
    lastClaimTime: number; // 上次领取时间
    nowMs: number; // 当前时间
    levelIndex: number; // 最大关卡索引
    levelId: number; // 关卡ID
    rateEntry: OfflineRewardRateEntry; // 每小时收益表项
    heroes: IHeroConfig[]; // 可用英雄列表
    rarityWeights: Map<string, number>; // 稀有度权重（用于碎片随机）
    rng?: () => number; // 随机数源（便于测试）
}

// 默认配置（当配置文件缺失时兜底）
export const DEFAULT_OFFLINE_CONFIG: OfflineRewardConfig = {
    maxHoursPerDay: 12,
    fullRateHours: 8,
    tailHours: 4,
    tailMultiplier: 0.5,
    minClaimIntervalSeconds: 600,
    maxQuickPatrolPerDay: 5,
    efficiency: 0.02,
    allowedItemTypes: ['gold', 'hero_fragment'],
    calcMode: 'expected',
    calcRounding: 'floor_with_chance',
    rarityWhitelist: ['C', 'R', 'L', 'SSR'],
    rarityFold: { UC: 'C', SR: 'R', M: 'L' },
    fallbackOrder: ['L', 'SSR', 'R', 'C']
};
