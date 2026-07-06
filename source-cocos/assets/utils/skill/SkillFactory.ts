import { SkillBase } from './SkillBase';
import { SkillConfig } from './SkillConfig';
import { ISkillEffectConfig, SDM } from '../data/config/skill/SkillDataManager';

/**
 * 技能工厂，负责根据配置动态创建技能实例
 */
export class SkillFactory {
    /**
     * 创建技能实例
     * @param skillId 技能ID
     * @param skillData 技能数据
     * @param heroId 英雄ID
     */
    static async createSkill(skillId: number, skillData?: any, heroId?: number): Promise<any | null> {
        if (!skillId) {
            console.warn('[SkillFactory] createSkill: 无效的技能ID', skillId);
            return null;
        }
        
        let skillConfig;
        if (skillData) {
            // 使用传入的技能数据
            skillConfig = { ...skillData };
        } else {
            // 从配置加载技能数据
            const cfg = await SkillConfig.loadSkillData(skillId);
            if (!cfg) {
                console.warn('[SkillFactory] createSkill: 未找到技能配置', skillId);
                return null;
            }
            skillConfig = { ...cfg };
        }
        
        // 确保技能配置包含正确的ID
        skillConfig.id = skillId;
        skillConfig.skillId = skillId;
        
        // SkillBase为抽象类，实际应有具体子类，这里假定SkillBase可直接实例化
        // 若有具体子类如NormalSkillBase请替换
        const skill = new (SkillBase as any)();
        await skill.init(skillConfig);
        
        if (heroId !== undefined) {
            skill.use_unit_id = heroId;
            skill.heroId = heroId; // 添加heroId属性，确保技能与英雄正确关联
        }
        
        return skill;
    }

    /**
     * 根据技能标识创建技能效果组
     * @param skillId 技能ID
     */
    static createSkillEffectsBySkillId(skillId: number): ISkillEffectConfig[] {
        // 首先尝试直接匹配技能ID
        let effects = SDM.getSkillEffectBySkillId(skillId);
        
        // 如果没有找到直接匹配的效果，尝试通过技能组ID查找
        if (effects.length === 0) {
             return null;
        }
        
        return effects;
    }
}
