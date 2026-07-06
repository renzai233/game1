/**
 * 物资模块类型定义
 */

// 物品类型枚举
export enum ItemType {
    EQUIPMENT = 'equipment',     // 装备
    CONSUMABLE = 'consumable',   // 消耗品
    MATERIAL = 'material',       // 材料
    HERO_FRAGMENT = 'hero_fragment', // 英雄碎片
    CURRENCY = 'currency',       // 货币（特殊物品）
    TREASURE = 'treasure',       // 宝箱/宝藏
    QUEST_ITEM = 'quest_item',   // 任务物品
}

// 物品稀有度
export enum ItemRarity {
    COMMON = 'common',      // 普通（白色）
    UNCOMMON = 'uncommon',  // 稀有（绿色）
    RARE = 'rare',          // 珍贵（蓝色）
    EPIC = 'epic',          // 史诗（紫色）
    LEGENDARY = 'legendary', // 传说（橙色）
    MYTHIC = 'mythic',      // 神话（红色）
}

// 物品品质
export enum ItemQuality {
    NORMAL = 'normal',      // 普通
    GOOD = 'good',          // 良好
    EXCELLENT = 'excellent', // 优秀
    PERFECT = 'perfect',    // 完美
}

// 装备部位
export enum EquipmentSlot {
    WEAPON = 'weapon',      // 武器
    HEAD = 'head',          // 头部
    CHEST = 'chest',        // 胸部
    LEGS = 'legs',          // 腿部
    HANDS = 'hands',        // 手部
    FEET = 'feet',          // 脚部
    NECKLACE = 'necklace',  // 项链
    RING = 'ring',          // 戒指
    ARTIFACT = 'artifact',  // 神器
}

// 消耗品类型
export enum ConsumableType {
    POTION = 'potion',      // 药水
    SCROLL = 'scroll',      // 卷轴
    FOOD = 'food',          // 食物
    BUFF = 'buff',          // 增益道具
}

// 物品属性
export interface IItemAttributes {
    // 基础属性
    attack?: number;        // 攻击力
    defense?: number;       // 防御力
    health?: number;        // 生命值
    speed?: number;         // 速度
    criticalChance?: number; // 暴击率
    criticalDamage?: number; // 暴击伤害
    dodge?: number;         // 闪避
    accuracy?: number;      // 命中

    // 特殊属性
    lifesteal?: number;     // 吸血
    armorPenetration?: number; // 护甲穿透
    magicResistance?: number; // 魔法抗性

    // 资源属性
    goldFind?: number;      // 金币获取
    expBoost?: number;      // 经验加成
    dropRate?: number;      // 掉落率
}

// 装备属性（继承物品属性）
export interface IEquipmentAttributes extends IItemAttributes {
    slot: EquipmentSlot;    // 装备部位
    requiredLevel: number;  // 需求等级
    durability?: number;    // 耐久度（可选）
    maxDurability?: number; // 最大耐久度
    setBonusId?: string;    // 套装效果ID
    socketCount?: number;   // 镶嵌孔数量
    sockets?: Array<{       // 镶嵌宝石
        gemId: number;
        attributes: IItemAttributes;
    }>;
}

// 消耗品效果
export interface IConsumableEffect {
    type: 'heal' | 'buff' | 'debuff' | 'resource';
    value: number;
    duration?: number;      // 持续时间（秒）
    target: 'self' | 'ally' | 'enemy';
    attributes?: IItemAttributes;
}

// 基础物品接口
export interface IBaseItem {
    id: number;             // 物品ID
    itemId: string;         // 物品唯一标识
    name: string;          // 物品名称
    description: string;   // 物品描述
    type: ItemType;        // 物品类型
    rarity: ItemRarity;    // 稀有度
    quality?: ItemQuality;  // 品质（可选）
    icon: string;          // 图标路径
    iconAtlas?: string;    // 图标图集（可选）
    maxStack: number;      // 最大堆叠数量
    sellPrice: number;     // 出售价格
    buyPrice: number;      // 购买价格
    isTradable: boolean;   // 是否可交易
    isDestroyable: boolean; // 是否可销毁
    isQuestItem: boolean;  // 是否是任务物品
    requiredLevel: number; // 需求等级
}

// 装备接口
export interface IEquipment extends IBaseItem {
    type: ItemType.EQUIPMENT;
    slot: EquipmentSlot;
    attributes: IEquipmentAttributes;
    level: number;         // 装备等级
    upgradeLevel: number;  // 强化等级
    enchantment?: {        // 附魔效果
        id: number;
        attributes: IItemAttributes;
    };
    isEquipped: boolean;   // 是否已装备
}

// 消耗品接口
export interface IConsumable extends IBaseItem {
    type: ItemType.CONSUMABLE;
    consumableType: ConsumableType;
    effects: IConsumableEffect[];
    useCount: number;      // 可使用次数
    cooldown?: number;     // 使用冷却时间（秒）
}

// 材料接口
export interface IMaterial extends IBaseItem {
    type: ItemType.MATERIAL;
    materialType: string;  // 材料类型（如：矿石、草药、皮革等）
    tier: number;          // 材料等级
    isCraftable: boolean;  // 是否可用于合成
}

// 英雄碎片接口
export interface IHeroFragment extends IBaseItem {
    type: ItemType.HERO_FRAGMENT;
    heroId: number;        // 对应英雄ID
    fragmentsNeeded: number; // 合成需要的碎片数量
}

// 宝箱接口
export interface ITreasure extends IBaseItem {
    type: ItemType.TREASURE;
    treasureType: 'chest' | 'box' | 'bag';
    guaranteedDrops: Array<{
        itemId: string;
        min: number;
        max: number;
    }>;
    possibleDrops: Array<{
        itemId: string;
        chance: number;      // 掉落概率（0-1）
        min: number;
        max: number;
    }>;
    requiredKey?: string;  // 需要的钥匙
}

// 联合类型：所有物品
export type IItem = IEquipment | IConsumable | IMaterial | IHeroFragment | ITreasure;

// 物品配置（用于生成）
export interface IItemConfig {
    id: number;
    name: string;
    type: ItemType;
    rarity: ItemRarity;
    maxStack: number;
    icon: string;
    sellPrice?: number,
    buyPrice?: number,
    isTradable?: boolean,
    isDestroyable?: boolean,
    isQuestItem?: boolean,
    requiredLevel?: number,
    description?: string
    // ... 其他配置
}

// 背包槽位
export interface IInventorySlot {
    slotId: number;        // 槽位ID（0-based）
    item: IItem | null;    // 物品（null表示空）
    quantity: number;      // 数量
    locked: boolean;       // 是否锁定（不可移动）
}

// 背包配置
export interface IInventoryConfig {
    maxSlots: number;      // 最大槽位数量
    unlockedSlots: number; // 已解锁槽位数量
    rows: number;          // 行数（用于UI显示）
    columns: number;       // 列数（用于UI显示）
    slotSize: number;      // 槽位大小
}

// 仓库配置
export interface IWarehouseConfig {
    maxSlots: number;
    unlockedSlots: number;
    upgradeCosts: Array<{  // 升级花费
        level: number;
        costGold: number;
        costGem: number;
    }>;
}

// 物品过滤器选项
export interface IItemFilter {
    types?: ItemType[];
    rarities?: ItemRarity[];
    qualities?: ItemQuality[];
    minLevel?: number;
    maxLevel?: number;
    searchText?: string;
    showEquipped?: boolean;
    showLocked?: boolean;
}

// 物品操作结果
export interface IItemOperationResult {
    success: boolean;
    message?: string;
    item?: IItem;
    oldQuantity?: number;
    newQuantity?: number;
    fromSlot?: number;
    toSlot?: number;
}