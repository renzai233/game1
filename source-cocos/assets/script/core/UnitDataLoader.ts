import { HDM } from '../../utils/data/config/hero/HeroDataManager';
import { MDM } from '../../utils/data/config/monster/MonsterDataManager';
import { SDM } from '../../utils/data/config/skill/SkillDataManager';
import { EDM } from '../../utils/data/env/ConfigManager';

/**
 * 单位数据加载器
 * 优先级：本地缓存 > （可选远程）> 数据字典
 */
export class UnitDataLoader {
    /**
     * 加载单位数据
     * @param id 单位ID
     * @param unitType 单位类型
     * @returns 单位数据Promise
     */
    static async loadUnitData(id: number, unitType: string): Promise<any> | null {
        // 1. 本地缓存优先
        if (EDM.config.useCache) {
            let cache = localStorage.getItem(`${id}`);
            if (cache) {
                console.log('[UnitDataLoader][loadUnitData] 使用本地缓存', id, cache);
                // 使用本地缓存
                return JSON.parse(cache);
            }
        }
        //2. 直接用远程数据管理器
        let unitData = null;
        if (unitType === 'hero') unitData = HDM.getHeroList().find(v => v.id === id);
        if (unitType === 'monster') unitData = MDM.getMonsterList().find(v => v.id === id);
        if (unitType === 'skill') unitData = SDM.getSkillList().find(v => v.id === id);
        if (unitType === 'skill_effect') unitData = SDM.getSkillEffectList().find(v => v.id === id);

        if (unitData) {
            // console.log('[UnitDataLoader][loadUnitData] 使用远程数据', id, unitData);
            return unitData;
        } else {
            console.warn('[UnitDataLoader] 未找到单位数据，返回默认数据', { id, unitType });
            // 返回默认数据而不是null，避免后续的空指针错误
            return this.getDefaultUnitData(id, unitType);
        }
    }
    
    /**
     * 获取默认单位数据
     * @param id 单位ID
     * @param unitType 单位类型
     * @returns 默认单位数据
     */
    private static getDefaultUnitData(id: number, unitType: string): any {
        const defaultData = {
            id: id,
            name: `Default${unitType}`,
            hp: 100,
            atk: 10,
            def: 5,
            speed: 1,
            type: unitType,
            camp: unitType === 'hero' ? 'human' : 'monster',
            // 其他必要属性
            attackRange: 60,
            moveSpeed: 50,
            attackSpeed: 1.0,
            attackInterval: 1.0,
            skills: [],
            star: 1,
            reward: { coin: 10, exp: 5 },
        };
        
        // 根据单位类型添加特定属性
        if (unitType === 'hero') {
            defaultData.skills = [];
            defaultData.star = 1;
        } else if (unitType === 'monster') {
            defaultData.reward = { coin: 10, exp: 5 };
        }
        
        return defaultData;
    }
}