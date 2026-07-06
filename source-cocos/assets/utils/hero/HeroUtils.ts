import { Node, Label } from 'cc';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';
import { HDM } from '../data/config/hero/HeroDataManager';
import { IHero } from './IHero';

export interface IHeroUpdateConfig {
    heroNameNode?: Node;
    heroLevelNode?: Node;
    heroStarNode?: Node;
    heroData?: IHero;
}

export class HeroUtils {
    static updateHeroName(config: IHeroUpdateConfig): void {
        const { heroNameNode, heroData } = config;

        if (!heroNameNode || !heroData) {
            if (EDM.isDev()) console.warn('[HeroUtils] updateHeroName: 节点或数据为空', { module: 'HeroUtils', method: 'updateHeroName' });
            return;
        }

        const label = heroNameNode.getComponent(Label);
        if (label) {
            const name = EDM.getText(heroData.name) || heroData.name || 'Unknown Hero';
            label.string = name;
            if (EDM.isDev()) console.debug(`[HeroUtils] updateHeroName: 设置名称为 "${name}"`, { module: 'HeroUtils', method: 'updateHeroName' });
        } else {
            if (EDM.isDev()) console.warn('[HeroUtils] updateHeroName: Label组件未找到', { module: 'HeroUtils', method: 'updateHeroName' });
        }
    }

    static updateHeroLevel(config: IHeroUpdateConfig): void {
        const { heroLevelNode, heroData } = config;

        if (!heroLevelNode || !heroData) {
            if (EDM.isDev()) console.warn('[HeroUtils] updateHeroLevel: 节点或数据为空');
            return;
        }

        const label = heroLevelNode.getComponent(Label);
        if (label) {
            try {
                const runtimeData = HDM.getHeroRuntimeData(Number(heroData.id));
                const level = runtimeData?.level || 1;
                label.string = String(level);
                if (EDM.isDev()) console.log(`[HeroUtils] updateHeroLevel: 设置等级为 ${level}`);
            } catch (error) {
                if (EDM.isDev()) console.error('[HeroUtils] 更新英雄等级失败', error);
            }
        } else {
            if (EDM.isDev()) console.warn('[HeroUtils] updateHeroLevel: Label组件未找到');
        }
    }

    static updateHeroStar(config: IHeroUpdateConfig): void {
        const { heroStarNode, heroData } = config;

        if (!heroStarNode || !heroData) {
            if (EDM.isDev()) console.warn('[HeroUtils] updateHeroStar: 节点或数据为空');
            return;
        }

        const label = heroStarNode.getComponent(Label);
        if (label) {
            try {
                const runtimeData = HDM.getHeroRuntimeData(Number(heroData.id));
                const star = runtimeData?.star || 1;
                label.string = `${star}★`;
                if (EDM.isDev()) console.log(`[HeroUtils] updateHeroStar: 设置星级为 ${star}`);
            } catch (error) {
                if (EDM.isDev()) console.error('[HeroUtils] 更新英雄星级失败', error);
            }
        } else {
            if (EDM.isDev()) console.warn('[HeroUtils] updateHeroStar: Label组件未找到');
        }
    }

    static formatNumber(num: number): string {
        if (isNaN(num) || !isFinite(num)) {
            if (EDM.isDev()) console.warn(`[HeroUtils] formatNumber: 输入数字无效: ${num}`);
            return '0';
        }

        let result: string;

        if (num < 1000) {
            result = num.toString();
        } else if (num < 1000000) {
            result = (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        } else if (num < 1000000000) {
            result = (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        } else {
            result = (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
        }
        return result;
    }
}
