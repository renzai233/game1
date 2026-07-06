import { gameBus, GamePauseReason } from '../signal/GameBus';

/**
 * 游戏状态管理工具函数
 */

/**
 * 暂停游戏
 */
export const onPause = (reason?: GamePauseReason): void => {
    gameBus.pause(reason);
};

/**
 * 继续游戏
 */
export const onContinue = (reason?: GamePauseReason): void => {
    gameBus.resume(reason);
};
