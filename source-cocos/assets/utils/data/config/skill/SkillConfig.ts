import { ISkillData, ISkillConfig, ISkillEffectConfig, ISpriteConfig } from "./ISkillConfig";

export const SkillConfigPath = {
    skills: 'skill/skill_base',
    skillSprites: 'skill/skill_sprite',
    skillEffects: 'skill/skill_effects'
}

export const SKILL_DATA: ISkillData = {
    skills: [],
    skillSprites: [],
    skillEffects: []
}

export const defaultSkillSpriteConfig: Record<string, ISpriteConfig> = {
    release: {
        id: 0,
        skill_id: 0,
        type: 'release',
        scale: [1, 1, 1],
        width: 64,
        height: 16,
        item_width: 16,
        item_height: 16
    },
    blow: {
        id: 0,
        skill_id: 0,
        type: 'blow',
        scale: [1, 1, 1],
        width: 64,
        height: 16,
        item_width: 16,
        item_height: 16
    }
}
