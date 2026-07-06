import { CurrencyType } from "db://assets/utils/common/CurrencyManager";

/**
 * 签到礼包原始模型
 */
export interface SignInTaskDTO {
  // ID
  id: number;
  // 图标路径
  icon: string;
  // 奖励
  rewards: SignInTaskReward[];
}

/**
 * 礼包奖励
 */
export interface SignInTaskReward {
  // 奖励货币类型
  type: CurrencyType;
  // 奖励货币数量
  amount: number;
  // 英雄ID（对应奖励货币类型为英雄卡片）
  heroId?: number;
}

/**
 * 签到礼包运行时状态
 */
export interface SignInTaskRS {
  claimed: boolean;
}

/**
 * 签到礼包
 */
export type SignInTask = SignInTaskDTO & SignInTaskRS;
