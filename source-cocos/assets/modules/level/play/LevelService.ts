import { HDM } from '../../../utils/data/config/hero/HeroDataManager';
import { CDM, CurrencyType } from '../../../utils/common/CurrencyManager';
import { PDM } from '../../../utils/data/config/player/PlayerDataManager';
import { GameData } from'../../../utils/data/config/manager/GameDataManager';
import { ILevelConfig, IMonsterSpawnData, IWaveConfig, MonsterRarity } from '../config/ILevel';
import { LDM } from '../config/LevelDataManager';

export class LevelService {
    private static instance: LevelService;

    static getInstance(): LevelService {
        if (!LevelService.instance) {
            LevelService.instance = new LevelService();
        }
        return LevelService.instance;
    }

    calculateStars(currentWallHp: number, maxWallHp: number): number {
        let stars = 1;
        const wallHpPercent = currentWallHp / maxWallHp;
        if (wallHpPercent >= 0.5) stars = 2;
        if (wallHpPercent >= 0.8) stars = 3;
        return stars;
    }

    selectSpawnPoint(): { x: number; y: number } {
        const fightAreaW = 750;
        const fightAreaH = 1100;
        const x = (Math.random() - 0.5) * fightAreaW;
        const y = fightAreaH / 2;
        return { x, y };
    }

    getWaveConfig(levelConfig: ILevelConfig, waveNumber: number): IWaveConfig {
        const isEliteWave = levelConfig.eliteId !== null && waveNumber % 5 === 0;
        const isBossWave = levelConfig.bossId !== null && waveNumber === levelConfig.maxWave;
        const hasSpecialMonster = levelConfig.specialId !== null && waveNumber === 6;

        const monsters: IMonsterSpawnData[] = [];

        if (isBossWave) {
            monsters.push(this.createBossMonster(levelConfig, waveNumber));
        } else if (isEliteWave) {
            monsters.push(this.createEliteMonster(levelConfig, waveNumber));
        } else {
            const normalMonsters = this.createNormalMonsters(levelConfig, waveNumber);
            monsters.push(...normalMonsters);
        }

        if (hasSpecialMonster && !isBossWave) {
            monsters.push(this.createSpecialMonster(levelConfig, waveNumber));
        }

        return {
            waveNumber,
            monsters,
            isEliteWave,
            isBossWave,
            hasSpecialMonster
        };
    }

    private createNormalMonsters(levelConfig: ILevelConfig, waveNumber: number): IMonsterSpawnData[] {
        const monsters: IMonsterSpawnData[] = [];

        if (!levelConfig.normalIds || levelConfig.normalIds.length === 0) {
            return monsters;
        }

        const monsterCount = levelConfig.startNumber + (waveNumber - 1) * levelConfig.waveNumberAdd;
        const normalIdIndex = (waveNumber - 1) % levelConfig.normalIds.length;
        const monsterId = levelConfig.normalIds[normalIdIndex];

        const attrMultiplier = 1 + (waveNumber - 1) * levelConfig.waveAttrRatio;

        for (let i = 0; i < monsterCount; i++) {
            monsters.push({
                monsterId,
                position: this.selectSpawnPoint(),
                rarity: MonsterRarity.NORMAL,
                atkMultiplier: attrMultiplier,
                hpMultiplier: attrMultiplier,
                dropMultiplier: 1
            });
        }

        return monsters;
    }

    private createEliteMonster(levelConfig: ILevelConfig, waveNumber: number): IMonsterSpawnData {
        if (levelConfig.eliteId === null) {
            throw new Error('[LevelService] 精英怪ID未配置');
        }

        const attrMultiplier = 1 + (waveNumber - 1) * levelConfig.waveAttrRatio;

        return {
            monsterId: levelConfig.eliteId,
            position: this.selectSpawnPoint(),
            rarity: MonsterRarity.ELITE,
            atkMultiplier: attrMultiplier * 3,
            hpMultiplier: attrMultiplier * 3,
            dropMultiplier: 1,
            skillReward: this.getRandomHeroSkill()
        };
    }

    private createBossMonster(levelConfig: ILevelConfig, waveNumber: number): IMonsterSpawnData {
        if (levelConfig.bossId === null) {
            throw new Error('[LevelService] Boss怪ID未配置');
        }

        const attrMultiplier = 1 + (waveNumber - 1) * levelConfig.waveAttrRatio;

        return {
            monsterId: levelConfig.bossId,
            position: this.selectSpawnPoint(),
            rarity: MonsterRarity.BOSS,
            atkMultiplier: attrMultiplier * 5,
            hpMultiplier: attrMultiplier * 5,
            dropMultiplier: 5
        };
    }

    private createSpecialMonster(levelConfig: ILevelConfig, waveNumber: number): IMonsterSpawnData {
        if (levelConfig.specialId === null || levelConfig.specialType === null) {
            throw new Error('[LevelService] 特殊怪ID或类型未配置');
        }

        const monsterType = LDM.getMonsterTypeByKey(levelConfig.specialType);
        if (!monsterType) {
            throw new Error(`[LevelService] 找不到怪物类型: ${levelConfig.specialType}`);
        }

        const specialDrop = this.calculateSpecialDrop(levelConfig.levelId, levelConfig.specialType);

        return {
            monsterId: levelConfig.specialId,
            position: this.selectSpawnPoint(),
            rarity: MonsterRarity.SPECIAL,
            atkMultiplier: monsterType.atk_rate,
            hpMultiplier: monsterType.hp_rate,
            dropMultiplier: 1,
            specialDrop
        };
    }

    private getRandomHeroSkill(): number | undefined {
        if (!GameData.heroOnField || GameData.heroOnField.length === 0) {
            return undefined;
        }

        const randomHero = GameData.heroOnField[Math.floor(Math.random() * GameData.heroOnField.length)];
        const hero = HDM.getHeroById(randomHero.id);

        if (!hero || !hero.skills || hero.skills.length === 0) {
            return undefined;
        }

        const skillCount = Math.floor(Math.random() * 5) + 1;
        const randomSkill = hero.skills[Math.floor(Math.random() * hero.skills.length)];

        return randomSkill;
    }

    private calculateSpecialDrop(levelId: number, specialType: string): { type: string; amount: number } | undefined {
        switch (specialType) {
            case 'gold':
                return {
                    type: 'gold',
                    amount: levelId * (Math.floor(Math.random() * 51) + 100)
                };
            case 'gem':
                return {
                    type: 'gem',
                    amount: levelId * (Math.floor(Math.random() * 11) + 10)
                };
            case 'hero_fragment':
                return {
                    type: 'hero_fragment',
                    amount: levelId * (Math.floor(Math.random() * 6) + 5)
                };
            default:
                return undefined;
        }
    }

    calculateMonsterDrop(levelId: number, monsterRarity: MonsterRarity): any[] {
        const dropConfigs = LDM.getDropConfigsByLevel(levelId);
        const drops: any[] = [];

        for (const dropConfig of dropConfigs) {
            const dropRate = dropConfig.item_drop_rate;
            const adjustedDropRate = monsterRarity === MonsterRarity.BOSS ? dropRate * 5 : dropRate;

            if (Math.random() < adjustedDropRate) {
                const amount = Math.floor(Math.random() * (dropConfig.max_amount - dropConfig.min_amount + 1)) + dropConfig.min_amount;

                if (dropConfig.item_type === 'hero_fragment') {
                    const hero = this.getRandomHeroByRarity(dropConfig.rarity);
                    if (hero) {
                        drops.push({
                            item_id: hero.id,
                            item_type: 'hero_fragment',
                            number: amount,
                            rarity: dropConfig.rarity
                        });
                    }
                } else {
                    drops.push({
                        item_type: dropConfig.item_type,
                        number: amount
                    });
                }
            }
        }

        return drops;
    }

    private getRandomHeroByRarity(rarity: string): any {
        const heroList = HDM.getHeroList();
        const heroesByRarity = heroList.filter(hero => hero.rarity === rarity);

        if (heroesByRarity.length === 0) {
            return heroList[Math.floor(Math.random() * heroList.length)];
        }

        return heroesByRarity[Math.floor(Math.random() * heroesByRarity.length)];
    }

    validateLevelConfig(config: any): boolean {
        if (!config || config.levelId === undefined) {
            return false;
        }
        return true;
    }

    giveMonsterKillRewards(levelId: number, monsterRarity: MonsterRarity): void {
        try {
            const dropConfigs = LDM.getDropConfigsByLevel(levelId);

            dropConfigs.forEach(drop => {
                const dropRate = drop.item_drop_rate;
                const adjustedDropRate = monsterRarity === MonsterRarity.BOSS ? dropRate * 5 : dropRate;

                if (Math.random() < adjustedDropRate) {
                    const amount = drop.min_amount + Math.floor(Math.random() * (drop.max_amount - drop.min_amount + 1));

                    if (drop.item_type === 'gold') {
                        CDM.addCurrency(CurrencyType.Gold, amount, 'monster_kill');
                        console.log(`[Drop] 金币 +${amount}`);
                    } else if (drop.item_type === 'gem') {
                        CDM.addCurrency(CurrencyType.Gem, amount, 'monster_kill');
                        console.log(`[Drop] 钻石 +${amount}`);
                    } else if (drop.item_type === 'hero_fragment') {
                        const hero = this.getRandomHeroByRarity(drop.rarity);
                        if (hero) {
                            CDM.addHeroFragmentCount(Number(hero.id), amount, `monster_kill_${hero.id}`);
                            console.log(`[Drop] 英雄碎片(${hero.id}) +${amount}`);
                        }
                    }
                }
            });
        } catch (error) {
            console.error('[LevelService] 给予怪物击杀奖励失败:', error);
        }
    }
}

export const levelService = LevelService.getInstance();
