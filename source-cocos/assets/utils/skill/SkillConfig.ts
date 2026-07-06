import { ISkillEffectConfig, SDM } from "../data/config/skill/SkillDataManager";

/**
 * 技能配置加载与解析
 */
export class SkillConfig {
    /** 技能配置缓存 */
    private static _skillConfigs: Record<string, any> = {};
    /** Buff配置缓存 */
    private static _buffConfigs: Record<string, any> = {};

    /** 加载技能配置 */
    static loadSkillConfigs(configs: any[]): void {
        for (const cfg of configs) {
            this._skillConfigs[cfg.id] = cfg;
        }
    }

    /**
     * 加载技能数据
     * @param id 技能ID
     * @param unitId 单位ID
     * @returns 技能数据Promise
     */
    static async loadSkillData(skillId: number, unitId?: string): Promise<any> | null {
        // 统一通过RemoteGameDataManager获取技能数据
        if (skillId) {
            let skillData = SDM.getSkillList().find(v => v.id === skillId);
            if (skillData) {
                // 深拷贝技能数据，确保每次返回的都是独立的对象
                return JSON.parse(JSON.stringify(skillData));
            } else {
                // 没有找到技能，返回null而不是自动分配错误技能
                console.warn(`[SkillConfig] 未找到skillId=${skillId}的技能数据`);
                return null;
            }
        }
        // 如果没有skillId，返回所有技能列表的深拷贝
        return JSON.parse(JSON.stringify(SDM.getSkillList()));
    }

    static getSkillData(skillId: number, unitId: string): any {
        if (!skillId) return null;
        const skill = SDM.getSkillList().find(v => v.id === skillId);
        if (!skill) {
            console.warn(`[SkillConfig] getSkillData: 未找到skillId=${skillId}`);
            return null;
        }
        return skill;
    }

    /** 获取技能配置 */
    static getSkillConfig(id: string): any {
        return this._skillConfigs[id];
    }

    /** 加载Buff配置 */
    static loadBuffConfigs(configs: any[]): void {
        for (const cfg of configs) {
            this._buffConfigs[cfg.id] = cfg;
        }
    }

    /** 获取Buff配置 */
    static getBuffConfig(id: string): any {
        return this._buffConfigs[id];
    }

    /**
     * 加载技能效果数据
     * @param id 技能ID
     * @returns 技能数据Promise
     */
    static async loadSkillEffectsBySkillId(skillId: number): Promise<ISkillEffectConfig[]> | null {
        if (!skillId) return null;

        // 首先尝试直接匹配技能ID
        let effects = SDM.getSkillEffectList().filter(v => v.skill_id === skillId);

        // 如果没有找到直接匹配的效果，尝试通过技能组ID查找
        if (effects.length === 0) {
            effects = SDM.getSkillEffectBySkillId(skillId);
        }

        if (effects && effects.length > 0) {
            return effects;
        } else {
            console.warn(`[SkillConfig] 未找到skillId=${skillId}的技能效果数据！`);
            return [];
        }
    }

    static getSkillEffectsData(skillId: number): ISkillEffectConfig[] {
        if (!skillId) return [];

        // 首先尝试直接匹配技能ID
        let effects = SDM.getSkillEffectBySkillId(skillId);

        if (!effects || effects.length === 0) {
            console.warn(`[SkillConfig] getSkillEffectsData: 未找到skillId=${skillId}的技能效果，返回空数组`);
            return [];
        }
        return effects;
    }
} 