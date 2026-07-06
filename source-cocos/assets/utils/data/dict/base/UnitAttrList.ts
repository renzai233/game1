// 阵营列表
export const UNIT_CAMP = {
  HUMAN: "human",
  DEMON: "demon",
  NATURE: "nature"
}

// 单位类型列表
export const UNIT_TYPE = {
  HERO: "hero",
  MONSTER: "monster",
  SKILL: "skill",
  PET: "pet",
  DEMON: "demon",
}

export const UNIT_RARITY = {
  COMMON: 'common',       // 普通
  RARE: 'rare',           // 稀有
  EPIC: 'epic',           // 史诗
  LEGENDARY: 'legendary', // 传说
  SR: 'sr',               // SR级
  SSR: 'ssr'              // SSR级
}

export const UNIT_RARITY_ICON_BG = {
  COMMON: 'textures/icon/bg/icon-bg01/spriteFrame',       // 普通
  RARE: 'textures/icon/bg/icon-bg02/spriteFrame',           // 稀有
  EPIC: 'textures/icon/bg/icon-bg03/spriteFrame',           // 史诗
  LEGENDARY: 'textures/icon/bg/icon-bg04/spriteFrame', // 传说
  SR: 'textures/icon/bg/icon-bg05/spriteFrame',               // SR级
  SSR: 'textures/icon/bg/icon-bg06/spriteFrame'              // SSR级
}

export const UNIT_POSITION = {
  WARRIOR: 'warrior',     // 战士
  MAGE: 'mage',           // 法师
  ARCHER: 'archer',       // 弓箭手
  TANK: 'tank',           // 坦克
  SUPPORT: 'support',      // 辅助
  ASSASSIN: 'assassin'    // 刺客
}

export const UNIT_STATUS = {
  LOCKED: 'locked',       // 未解锁
  UNLOCKED: 'unlocked',   // 已解锁
  DEPLOYED: 'deployed'    // 已上阵
}

export const UNIT_ATTR_COLOR = {
  FIRE: {
    name: "火",
    color: "#ff5722",
  },
  WATER: {
    name: "水",
    color: "#03a9f4",
  },
  LIGHT: {
    name: "光",
    color: "#fffde7",
  },
  DARK: {
    name: "暗",
    color: "#424242",
  },
  SKY: {
    name: "天空",
    color: "#00bcd4",
  },
  GROUND: {
    name: "地面",
    color: "#3e2723",
  },
  POISON: {
    name: "毒",
    color: "#673ab7",
  },
  GRASS: {
    name: "草",
    color: "#43a047",
  },
  WOOD: {
    name: "木",
    color: "#795548",
  },
  MAGIC: {
    name: "魔法",
    color: "#3f51b5",
  },
}


/**
 * 英雄属性
 */
export interface IHeroAttr {
  name: string;
  color: string;
  icon: string;
}

/**
 * 英雄属性列表
 */
export const UNIT_ATTR: Record<string, IHeroAttr> = {
  ALL: { name: 'all', color: '#000000', icon: '' },
  FIRE: { name: 'fire', color: '#ff5722', icon: 'textures/icon/attr/icon-fire/spriteFrame' },
  WATER: { name: 'water', color: '#03a9f4', icon: 'textures/icon/attr/icon-water/spriteFrame' },
  EARTH: { name: 'earth', color: '#3e2723', icon: 'textures/icon/attr/icon-earth/spriteFrame' },
  LIGHT: { name: 'light', color: '#fffde7', icon: 'textures/icon/attr/icon-light/spriteFrame' },
  DARK: { name: 'dark', color: '#424242', icon: 'textures/icon/attr/icon-dark/spriteFrame' },
  SKY: { name: 'sky', color: '#00bcd4', icon: 'textures/icon/attr/icon-all/spriteFrame' },
}