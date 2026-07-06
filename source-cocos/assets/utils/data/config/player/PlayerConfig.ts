import { CurrencyType } from "../../../common/CurrencyManager";
import { IPlayer, IPlayerProgress, IUserConfig } from "./IPlayer";

// 用户基础数据
export const USER_DATA: IUserConfig = {
    uid: userId(),
    userName: `player_${userId().slice(7, 6)}`,
    userAvatar: 'avatar_default',
    userInviterCode: generateInviteCode(),
    userInvitedCodes: [],
    soundVolume: 0.8,
    musicVolume: 0.7,
    isMusicOn: true,
    isSoundOn: true,
    isVibrationOn: true
}

// 玩家游戏进程
export const PLAYER_PROGRESS: IPlayerProgress = {
    playerLevel: 1,
    levelIndex: 1,
    latestLevel: 1,
    stars: [],
    heroIds: [1, 2, 3],
    lastLoginTime: new Date().toISOString(),
    today: new Date().toISOString(),
    viewScale: 1,
    isAdVip: false,
    vipLevel: 0,
    adCount: 0,
    adStats: {}
}

// 玩家货币数据: 英雄碎片初始化时没有
export const CURRENCIES: Map<CurrencyType, any> = new Map([
    [CurrencyType.Gold, 100],
    [CurrencyType.Gem, 50],
    [CurrencyType.Stamina, 30],

    [CurrencyType.MaxStamina, 30],
    [CurrencyType.Stars, 0],
    [CurrencyType.EXP, 0]
])

// 玩家数据
export const PLAYER_DATA: IPlayer = {
    user: USER_DATA,
    progress: PLAYER_PROGRESS,
    currencies: CURRENCIES,
    bagList: [],
    equipments: [],
    heroes: [],
    talents: [],
    stocks: []
};

// 随机用户ID
export function userId(): string {
    return `player_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}


// 随机用户唯一编码
export function generateInviteCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
