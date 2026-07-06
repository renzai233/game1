import { SkillManager } from './SkillManager';
import { Prefab } from 'cc';

/**
 * 技能与单位绑定逻辑
 */
export class SkillBind {
    /**
     * 挂载技能到单位
     * @param unitId 单位ID
     * @param skillId 技能ID
     * @param skillEffectPrefab 子弹预制体（可选）
     */
    static bindSkill(unitId: string, skillId: string, skillEffectPrefab?: Prefab): void {
        console.log('[SkillBind] bindSkill', { unitId, skillId, skillIdType: typeof skillId, skillEffectPrefab });
        SkillManager.addSkillToUnit(Number(unitId), skillId, skillEffectPrefab);
    }

    /**
     * 解绑单位的某个技能
     */
    static unbindSkill(unitId: string, skillId: string): void {
        const skills = SkillManager.getSkillsOfUnit(Number(unitId));
        const idx = skills.findIndex(s => s.skillId === skillId);
        if (idx !== -1) {
            skills.splice(idx, 1);
        }
    }

    /**
     * 检查单位是否有某技能
     */
    static hasSkill(unitId: string, skillId: string): boolean {
        return SkillManager.getSkillsOfUnit(Number(unitId)).some(s => s.skillId === skillId);
    }
}
