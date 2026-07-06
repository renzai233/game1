import { HDM } from '../data/config/hero/HeroDataManager';
import { CDM, CurrencyType } from '../common/CurrencyManager';
import { HeroUpgradeNotificationManager } from './HeroUpgradeNotificationManager';
import { gameBus } from '../signal/GameBus';
import { SIGNAL_TYPES } from '../signal/ISignal';
import { IHero as IHeroData } from './IHero';

export interface IHeroUpgradeResult {
    success: boolean;
    heroId: number;
    oldLevel: number;
    newLevel: number;
    requiredFragments: number;
    requiredGold: number;
}

export interface IHeroGrowthPreview {
    hp: number;
    atk: number;
    defense: number;
    move_speed: number;
}

export class HeroUpgradeService {
    /**
     * 统一的升级逻辑（消耗资源 + 升级 + 事件 + 通知）
     */
    public static async upgradeHero(heroId: number): Promise<IHeroUpgradeResult> {
        const runtimeData = HDM.getHeroRuntimeData(heroId);
        const currentLevel = runtimeData?.level || 1;
        const requiredFragments = HDM.calculateUpgradeFragments(currentLevel);
        const requiredGold = 100 * currentLevel;

        const result: IHeroUpgradeResult = {
            success: false,
            heroId,
            oldLevel: currentLevel,
            newLevel: currentLevel,
            requiredFragments,
            requiredGold
        };

        const hero = HDM.getHeroById(heroId);
        if (!hero) {
            return result;
        }

        if (!HDM.canUpgradeHero(heroId)) {
            return result;
        }

        // 消耗资源
        CDM.subtractHeroFragmentCount(heroId, requiredFragments, `hero_upgrade_${heroId}`);
        CDM.subtractCurrency(CurrencyType.Gold, requiredGold, `hero_upgrade_${heroId}`);

        const success = await HDM.upgradeHeroLevel(heroId, 1);
        if (!success) {
            return result;
        }

        result.success = true;
        result.newLevel = currentLevel + 1;

        // 更新英雄属性
        this.applyLevelBonus(hero, result.newLevel);

        // 升级事件（供 UI/特效使用）
        gameBus.emit(SIGNAL_TYPES.HERO_UPGRADED, {
            heroId,
            oldLevel: result.oldLevel,
            newLevel: result.newLevel
        });

        // 更新升级提示状态（避免刷新整个列表）
        this.refreshUpgradeNotifications();

        // 兼容旧资源更新事件
        try {
            gameBus.emit('global-update');
        } catch (error) {
            // ignore
        }

        return result;
    }

    public static previewLevelGrowth(heroData: Partial<IHeroData>, level: number): IHeroGrowthPreview {
        const levelBonus = level * 0.1;
        return {
            hp: this.growStat(heroData.hp || 0, 1 + levelBonus, 0),
            atk: this.growStat(heroData.atk || 0, 1 + levelBonus, 1),
            defense: this.growStat(heroData.defense || 0, 1 + levelBonus, 0),
            move_speed: this.growStat(heroData.move_speed || 0, 1 + levelBonus * 0.5, 0),
        };
    }

    private static applyLevelBonus(heroData: IHeroData, level: number): void {
        const preview = this.previewLevelGrowth(heroData, level);
        heroData.hp = preview.hp;
        heroData.atk = preview.atk;
        heroData.defense = preview.defense;
        heroData.move_speed = preview.move_speed;
    }

    private static growStat(value: number, multiplier: number, decimalPlaces: number): number {
        const current = Number.isFinite(value) ? value : 0;
        const factor = Math.pow(10, decimalPlaces);
        const grown = Math.round(current * multiplier * factor) / factor;
        return Math.max(current, grown);
    }

    private static refreshUpgradeNotifications(): void {
        const notificationManager = HeroUpgradeNotificationManager.instance;
        if (!notificationManager) return;

        const heroes = HDM.getHeroList();
        heroes.forEach((heroData) => {
            notificationManager.updateHeroUpgradeStatus(heroData as any);
        });
    }
}
