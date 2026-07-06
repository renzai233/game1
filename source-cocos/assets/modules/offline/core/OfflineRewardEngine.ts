import { IHeroConfig } from 'db://assets/utils/data/config/hero/IHeroConfig';
import {
    CalcRounding,
    OfflineRewardConfig,
    OfflineRewardFragment,
    OfflineRewardInput,
    OfflineRewardPending
} from './OfflineRewardTypes';

// 稀有度别名归一化映射（将各种写法统一到C/R/L/SSR口径）
const RARITY_ALIASES: Record<string, string> = {
    COMMON: 'C',
    UNCOMMON: 'C',
    RARE: 'R',
    SR: 'R',
    SUPER_RARE: 'R',
    SSR: 'SSR',
    SUPER_SUPER_RARE: 'SSR',
    LEGENDARY: 'L',
    MYTHIC: 'L',
    C: 'C',
    UC: 'C',
    R: 'R',
    L: 'L',
    M: 'L'
};

// 计算离线奖励：只负责纯计算，不触发任何副作用
export function calculateOfflineReward(input: OfflineRewardInput): OfflineRewardPending | null {
    const rng = input.rng || Math.random;
    const config = input.config;

    // 1) 计算可用时长（封顶）
    const rawSeconds = Math.max(0, (input.nowMs - input.lastClaimTime) / 1000);
    const capSeconds = Math.max(0, (config.maxHoursPerDay || 0) * 3600);
    const cappedSeconds = Math.min(rawSeconds, capSeconds);
    if (cappedSeconds <= 0) return null;

    // 2) 计算递减后的有效时长
    const fullSeconds = Math.min(cappedSeconds, Math.max(0, (config.fullRateHours || 0) * 3600));
    const tailCap = Math.max(0, (config.tailHours || 0) * 3600);
    const tailSeconds = Math.min(Math.max(cappedSeconds - fullSeconds, 0), tailCap);
    const effectiveSeconds = fullSeconds + tailSeconds * (config.tailMultiplier ?? 0);
    if (effectiveSeconds <= 0) return null;

    // 3) 通过“每小时固定值”计算期望收益
    const goldExpected = (input.rateEntry.goldPerHour || 0) * (effectiveSeconds / 3600) * (config.efficiency ?? 0);
    const fragExpected = (input.rateEntry.fragmentPerHour || 0) * (effectiveSeconds / 3600) * (config.efficiency ?? 0);

    // 4) 应用取整规则
    const gold = applyRounding(goldExpected, config.calcRounding, rng);
    const totalFragments = applyRounding(fragExpected, config.calcRounding, rng);

    // 5) 将碎片分配到具体英雄（保持“惊喜感”）
    const fragments = totalFragments > 0
        ? allocateFragments(totalFragments, input.rarityWeights, input.heroes, config, rng)
        : [];

    return {
        generatedAt: input.nowMs,
        durationSeconds: cappedSeconds,
        effectiveSeconds,
        levelIndex: input.levelIndex,
        levelId: input.levelId,
        gold: Math.max(0, gold),
        totalFragments: Math.max(0, totalFragments),
        fragments
    };
}

// 将碎片数量分配到具体英雄（按稀有度权重抽取）
function allocateFragments(
    totalFragments: number,
    rarityWeights: Map<string, number>,
    heroes: IHeroConfig[],
    config: OfflineRewardConfig,
    rng: () => number
): OfflineRewardFragment[] {
    if (heroes.length === 0 || totalFragments <= 0) return [];

    // 以稀有度分组英雄，按权重随机抽取
    const heroByRarity = groupHeroesByRarity(heroes, config);
    const weights = rarityWeights.size > 0 ? rarityWeights : buildDefaultRarityWeights(config);

    const counts = new Map<number, number>();
    // 逐片抽取，统计到英雄粒度
    for (let i = 0; i < totalFragments; i++) {
        const rarity = pickWeighted(weights, rng);
        const heroId = pickHeroByRarity(rarity, heroByRarity, heroes, config.fallbackOrder || [], rng);
        if (!heroId) continue;
        counts.set(heroId, (counts.get(heroId) || 0) + 1);
    }

    return Array.from(counts.entries()).map(([heroId, amount]) => ({ heroId, amount }));
}

// 将英雄按稀有度归类（用于碎片分配）
function groupHeroesByRarity(heroes: IHeroConfig[], config: OfflineRewardConfig): Map<string, IHeroConfig[]> {
    const map = new Map<string, IHeroConfig[]>();
    heroes.forEach(hero => {
        const rarity = normalizeHeroRarity(hero?.rarity, config);
        if (!rarity || !isRarityAllowed(rarity, config)) return;
        if (!map.has(rarity)) map.set(rarity, []);
        map.get(rarity)!.push(hero);
    });
    return map;
}

// 将英雄稀有度统一到配置口径（C/R/L/SSR）
function normalizeHeroRarity(raw: string, config: OfflineRewardConfig): string | null {
    if (!raw) return null;
    const upper = String(raw).toUpperCase();
    if (config.rarityFold && (config.rarityFold[upper] || config.rarityFold[raw])) {
        return config.rarityFold[upper] || config.rarityFold[raw];
    }
    return RARITY_ALIASES[upper] || raw;
}

// 稀有度是否允许参与随机
function isRarityAllowed(rarity: string, config: OfflineRewardConfig): boolean {
    const whitelist = config.rarityWhitelist || [];
    return whitelist.length === 0 || whitelist.includes(rarity);
}

// 当关卡掉落权重不可用时，使用白名单均分权重
function buildDefaultRarityWeights(config: OfflineRewardConfig): Map<string, number> {
    const weights = new Map<string, number>();
    const whitelist = config.rarityWhitelist || [];
    whitelist.forEach(r => {
        weights.set(r, (weights.get(r) || 0) + 1);
    });
    if (weights.size === 0 && config.fallbackOrder) {
        config.fallbackOrder.forEach(r => weights.set(r, (weights.get(r) || 0) + 1));
    }
    return weights;
}

// 按权重随机抽取稀有度
function pickWeighted(weights: Map<string, number>, rng: () => number): string {
    const entries = Array.from(weights.entries()).filter(([, w]) => w > 0);
    if (entries.length === 0) return '';

    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = rng() * total;
    for (const [key, weight] of entries) {
        if (roll <= weight) return key;
        roll -= weight;
    }
    return entries[entries.length - 1][0];
}

// 按稀有度挑选英雄，若无则按降级顺序尝试
function pickHeroByRarity(
    rarity: string,
    heroByRarity: Map<string, IHeroConfig[]>,
    allHeroes: IHeroConfig[],
    fallbackOrder: string[],
    rng: () => number
): number | null {
    const tryPick = (r: string): number | null => {
        const list = heroByRarity.get(r) || [];
        if (list.length === 0) return null;
        const hero = list[Math.floor(rng() * list.length)];
        return hero?.id ?? null;
    };

    let heroId = tryPick(rarity);
    if (heroId) return heroId;

    const order = fallbackOrder.length > 0 ? fallbackOrder : Array.from(heroByRarity.keys());
    const startIndex = Math.max(0, order.indexOf(rarity));
    for (let i = startIndex; i < order.length; i++) {
        heroId = tryPick(order[i]);
        if (heroId) return heroId;
    }

    // 兜底：仍然无匹配则从全量英雄中随机
    const anyHero = allHeroes[Math.floor(rng() * allHeroes.length)];
    return anyHero?.id ?? null;
}

// 根据配置的规则对期望值进行取整
function applyRounding(value: number, rounding: CalcRounding, rng: () => number): number {
    if (!isFinite(value) || value <= 0) return 0;

    switch (rounding) {
        case 'ceil':
            return Math.ceil(value);
        case 'round':
            return Math.round(value);
        case 'floor':
            return Math.floor(value);
        case 'floor_with_chance': {
            const base = Math.floor(value);
            const frac = value - base;
            return base + (rng() < frac ? 1 : 0);
        }
        default:
            return Math.floor(value);
    }
}
