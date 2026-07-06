import { CurrencyType } from "db://assets/utils/common/CurrencyManager";

/**
 * 每日礼包原始模型
 */
export interface DailyTaskDTO {
  // ID
  id: number;
  // 图标路径
  icon: string;
  // 奖励
  rewards: DailyTaskReward[];
  /**
   * 领取设定
   *  - 数组里有多少项，就能领几次奖励；
   *  - 每项用不同数值代表不同的领取条件；
   */
  claims: ClaimType[];
}

/**
 * 领取条件
 *  0: 免费
 *  1: 看广告
 */
export type ClaimType = 0 | 1;

/**
 * 礼包奖励
 */
export interface DailyTaskReward {
  // 奖励货币类型
  type: CurrencyType;
  // 奖励货币数量
  amount: number;
  // 英雄ID（对应奖励货币类型为英雄卡片）
  heroId?: number;
}

/**
 * 每日礼包运行时状态
 */
export interface DailyTaskRS {
  locked: boolean;
  claimed: boolean[];
}

/**
 * 每日礼包
 */
export type DailyTask = DailyTaskDTO & DailyTaskRS;
