import { HDM } from 'db://assets/utils/data/config/hero/HeroDataManager';
import { GameData, resetGameData } from 'db://assets/utils/data/config/manager/GameDataManager';

export function prepareGameSession(): void {
    resetGameData();
    GameData.heroes = HDM.getHeroList().filter((hero) => hero.type === 'hero');
}
