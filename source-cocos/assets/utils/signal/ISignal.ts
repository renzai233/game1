
// 信号类型
export enum SIGNAL_TYPES {
    LANGUAGE_CHANGED = "language-changed",
    // 玩家
    PLAYER_INIT_COMPLETE = "player-init-complete",
    PLAYER_DATA_UPDATED = "player-data-updated",

    // 物资
    CURRENCY_CHANGED = "currency-changed",
    REWARD_RECEIVED = "reward-received",
    OFFLINE_REWARD_CLAIMED = "offline-reward-claimed",
    DAILY_TASK_STATE_CHANGED = "daily-task-state-changed",
    SIGN_IN_TASK_STATE_CHANGED = "sign-in-task-state-changed",
    OFFLINE_REWARD_STATE_CHANGED = "offline-reward-state-changed",
    SHORTCUT_REWARD_STATE_CHANGED = "shortcut-reward-state-changed",
    CLEANUP_HUD = "cleanup-hud",

    // 物资模块信号
    ITEM_CONFIG_LOADED = "item-config-loaded",          // 物品配置加载完成
    // 背包
    INVENTORY_INITIALIZED = "inventory-initialized",    // 背包初始化完成
    INVENTORY_CHANGED = "inventory-changed",            // 背包数据变化
    INVENTORY_SLOT_CHANGED = "inventory-slot-changed",  // 背包槽位变化
    INVENTORY_SORTED = "inventory-sorted",              // 背包排序完成
    INVENTORY_SLOTS_UNLOCKED = "inventory-slots-unlocked", // 背包槽位解锁
    // 仓库
    WAREHOUSE_INITIALIZED = "warehouse-initialized",    // 仓库初始化完成
    WAREHOUSE_CHANGED = "warehouse-changed",            // 仓库数据变化
    WAREHOUSE_UPGRADED = "warehouse-upgraded",          // 仓库升级
    //装备
    EQUIPMENT_INITIALIZED = "equipment-initialized",    // 装备初始化完成
    EQUIPMENT_CHANGED = "equipment-changed",            // 装备变化
    EQUIPMENT_UPGRADED = "equipment-upgraded",          // 装备强化
    EQUIPMENT_SAVED = "equipment-saved",                // 装备保存

    // 英雄
    HERO_UPGRADED = "hero-upgraded",
    HERO_ANIMATION_CHANGED = "hero-animation-changed",
    // 英雄数据相关信号
    HERO_DATA_INIT_COMPLETE = "hero-data-init-complete",
    HERO_DATA_UPDATED = "hero-data-updated",
    HERO_DATA_BATCH_UPDATED = "hero-data-batch-updated",
    HERO_STAR_UP = "hero-star-up",
    HERO_DEPLOYED = "hero-deployed",
    HERO_UNDEPLOYED = "hero-undeployed",
    HERO_FRAGMENT_ADDED = "hero-fragment-added",
    HERO_CONFIG_RELOADED = "hero-config-reloaded", // 配置重新加载信号

    // 技能
    SKILL_STATUS_CHANGED = "skill-status-changed",
    SKILL_ICON_CHANGED = "skill-icon-status-changed",

    // 商店
    SHOP_DATA_UPDATED = "shop-data-updated",      // 商店数据更新
    SHOP_GOODS_CLAIMED = "shop-goods-claimed",    // 商品领取成功
    SHOP_GOODS_PURCHASED = "shop-goods-purchased", // 商品购买成功
    SHOP_LOTTERY_SUCCESS = "shop-lottery-success", // 抽奖成功

    // 游戏
    GAME_VICTORY = "game-victory", // 游戏胜利
    GAME_DEFEAT = "game-defeat", // 游戏失败

    // 关卡相关
    LEVEL_CHANGED = "level-changed",          // 关卡切换
    LEVEL_STARTED = "level-started",          // 关卡开始
    LEVEL_ENDED = "level-ended",              // 关卡结束
    LEVEL_PROGRESS_UPDATED = "level-progress-updated", // 关卡进度更新
    LEVEL_UNLOCKED = "level-unlocked",        // 关卡解锁

    // 关卡波次相关
    WAVE_START = "wave-start",                // 波次开始
    WAVE_COMPLETE = "wave-complete",          // 波次完成
    WALL_HP_CHANGE = "wall-hp-change",        // 城墙HP变化
    WALL_DESTROYED = "wall-destroyed",
    MONSTER_SPAWN = "MONSTER_SPAWN",
    MONSTER_DIE = "MONSTER_DIE",
    SCENE_CHANGED = "SCENE_CHANGED",
    LEVEL_COMPLETED = "LEVEL_COMPLETED",
    LEVEL_FAILED = "LEVEL_FAILED",        // 城墙被摧毁
}

// 存储键定义
export enum STORAGE_KEYS {
    // 商店相关
    SHOP_GOODS_STATES = "shop_goods_states",      // 商品状态
    SHOP_LAST_REFRESH_DATE = "shop_last_refresh_date", // 最后刷新日期

    // 玩家数据（由CurrencyManager管理）
    PLAYER_DATA = "player_data",                   // 玩家数据
    OFFLINE_REWARD = "offline_reward",             // 挂机收益数据
    OFFLINE_QUICK_PATROL = "offline_quick_patrol", // 快速巡逻次数

    // 游戏数据：关卡要单独做一个模块
    GAME_LEVEL = "game_level", // 游戏最新关卡
    GAME_LATEST_LEVEL = "game_latest_Level", // 游戏最新关卡

    // 英雄数据
    HERO_DATA = "hero_data", // 英雄运行时数据
    HERO_RUNTIME_DATA = "hero_runtime_data", // 英雄运行时数据
}

/**
 * 信号接口
 * 定义事件信号的基本结构
 */
export interface ISignal {
    /**
     * 信号类型
     */
    type: string;

    /**
     * 信号数据
     */
    data?: any;

    /**
     * 发送时间戳
     */
    timestamp: number;

    /**
     * 信号源
     */
    source?: string;
}

/**
 * 信号监听器接口
 */
export interface ISignalListener {
    (signal: ISignal): void;
}

/**
 * 信号管理器接口
 */
export interface ISignalManager {
    /**
     * 注册信号监听器
     * @param type 信号类型
     * @param listener 监听器
     */
    on(type: string, listener: ISignalListener): void;

    /**
     * 移除信号监听器
     * @param type 信号类型
     * @param listener 监听器
     */
    off(type: string, listener: ISignalListener): void;

    /**
     * 发送信号
     * @param type 信号类型
     * @param data 信号数据
     * @param source 信号源
     */
    emit(type: string, data?: any, source?: string): void;

    /**
     * 清除所有监听器
     */
    clear(): void;
}
