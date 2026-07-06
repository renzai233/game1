import { CurrencyType } from "db://assets/utils/common/CurrencyManager";
import { JDM } from "../../utils/data/config/manager/JsonDataManager";

// 背包标签类型
export enum BAG_TAB_TYPE {
    ALL = 'all',
    CURRENCY = 'currency',
    FRAGMENT = 'fragment',
}

// 背包物品数据接口
export interface IBagItemData {
    id: string;
    name: string;
    desc: string;
    icon: string;
    ownNum: number;
    resType: CurrencyType;
    tabType: BAG_TAB_TYPE;
    isAvailable: boolean;
    isShow: boolean;
    heroId?: number; // 英雄ID，用于英雄碎片项
}

// 背包物品配置（用于生成背包项）
export interface IBagItemConfig {
    id: string;
    name: string;
    desc: string;
    icon: string;
    resType: CurrencyType;
    tabType: BAG_TAB_TYPE;
    heroId?: number; // 英雄ID，用于英雄碎片项
}

// 背包配置数据
export const BAG_ITEMS_CONFIG: IBagItemConfig[] = [
    {
        id: 'coin',
        name: "晶币",
        desc: "晶核防线基础货币",
        icon: 'textures/icon/res/coin/spriteFrame',
        resType: CurrencyType.Gold,
        tabType: BAG_TAB_TYPE.CURRENCY
    },
    {
        id: 'gem',
        name: "棱钻",
        desc: "晶核防线高级货币",
        icon: 'textures/icon/res/gem/spriteFrame',
        resType: CurrencyType.Gem,
        tabType: BAG_TAB_TYPE.CURRENCY
    },
    {
        id: 'stamina',
        name: "能量",
        desc: "晶核防线行动力",
        icon: 'textures/icon/res/stamina/spriteFrame',
        resType: CurrencyType.Stamina,
        tabType: BAG_TAB_TYPE.CURRENCY
    },
];