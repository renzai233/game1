import { Singleton } from "../../../common/Singleton";
import { resManager } from "../manager/ResourceManager";
import { ISkillData, ISkillConfig, ISkillEffectConfig, ISpriteConfig, SkillRarity } from "./ISkillConfig";
import { SKILL_DATA, SkillConfigPath, defaultSkillSpriteConfig } from "./SkillConfig";

export type { ISkillConfig, ISkillEffectConfig, ISkillData, ISpriteConfig, SkillRarity };
export { defaultSkillSpriteConfig };

export class SkillDataManager extends Singleton {
    private _skillData: ISkillData = SKILL_DATA;
    private _isInitialized: boolean = false;
    private readonly CONFIG_BUNDLE = 'configs';

    async initialize(): Promise<boolean> {
        if (this._isInitialized) return true;

        try {
            console.log('[SkillDataManager] 开始加载技能配置数据...');

            await this.loadAllConfigs();

            this._isInitialized = true;
            console.log('[SkillDataManager] 技能配置数据初始化完成');
            return true;
        } catch (error) {
            console.error('[SkillDataManager] 初始化失败:', error);
            return false;
        }
    }

    private async loadAllConfigs(): Promise<void> {
        const configPromises = [
            this.loadConfig<ISkillConfig[]>(SkillConfigPath.skills),
            this.loadConfig<ISpriteConfig[]>(SkillConfigPath.skillSprites),
            this.loadConfig<ISkillEffectConfig[]>(SkillConfigPath.skillEffects)
        ];

        const results = await Promise.allSettled(configPromises);

        if (results[0].status === 'fulfilled') {
            this._skillData.skills = results[0].value as ISkillConfig[];
            console.log(`[SkillDataManager] 技能配置加载成功，共${this._skillData.skills.length}条`);
        } else {
            console.warn('[SkillDataManager] 技能配置加载失败:', results[0].reason);
            this._skillData.skills = [];
        }

        if (results[1].status === 'fulfilled') {
            this._skillData.skillSprites = results[1].value as ISpriteConfig[];
            console.log(`[SkillDataManager] 技能精灵配置加载成功，共${this._skillData.skillSprites.length}条`);
        } else {
            console.warn('[SkillDataManager] 技能精灵配置加载失败:', results[1].reason);
            this._skillData.skillSprites = [];
        }

        if (results[2].status === 'fulfilled') {
            this._skillData.skillEffects = results[2].value as ISkillEffectConfig[];
            console.log(`[SkillDataManager] 技能效果配置加载成功，共${this._skillData.skillEffects.length}条`);
        } else {
            console.warn('[SkillDataManager] 技能效果配置加载失败:', results[2].reason);
            this._skillData.skillEffects = [];
        }
    }

    private async loadConfig<T>(configName: string): Promise<T> {
        try {
            const config = await resManager().loadConfig<T>(
                configName,
                this.CONFIG_BUNDLE
            );
            return this.validateConfig(config, configName);
        } catch (error) {
            console.error(`[SkillDataManager] 加载配置${configName}失败:`, error);
            throw error;
        }
    }

    private validateConfig<T>(config: any, configName: string): T {
        if (!config) {
            console.warn(`[SkillDataManager] ${configName}配置为空`);
            return [] as any;
        }

        switch (configName) {
            case SkillConfigPath.skills:
                if (!Array.isArray(config)) {
                    console.warn(`[SkillDataManager] 技能配置应该是一个数组`);
                    return [] as any;
                }
                return config.map(skill => ({
                    id: skill.id || 0,
                    name: skill.name || '未知技能',
                    url: skill.url || 'default',
                    type: skill.type || 'fly',
                    skills: skill.skills || [],
                    rarity: skill['稀有度(rarity)'] || skill.rarity || 'common',
                    desc: skill['描述(desc)'] || skill.desc || '',
                    sprite: skill.sprite || {},
                    camp: skill.camp || 'human',
                    can_move: skill.can_move ?? true,
                    can_skill: skill.can_skill ?? false,
                    can_attack: skill.can_attack ?? false,
                    can_learn: skill.can_learn ?? true,
                    release_type: skill.release_type || 'auto',
                    group: skill.group || 'ballistic',
                    effect_type: skill.effect_type || 'damage',
                    detect_range: skill.detect_range ?? 50,
                    atk: skill.atk ?? 5,
                    atk_range: skill.atk_range ?? 50,
                    cooldown: skill.cooldown ?? 0.5,
                    hp: skill.hp ?? 0,
                    move_speed: skill.move_speed ?? 500,
                    repeat: skill.repeat ?? 0,
                    quantity: skill.quantity ?? 0,
                    scatterAngle: skill.scatterAngle ?? skill.scatter_angle,
                    pierce: skill.pierce ?? 0,
                    level: skill.level ?? 1,
                    max_level: skill.max_level ?? 5,
                    star: skill.star ?? 1,
                    max_star: skill.max_star ?? 5,
                    defense: skill.defense ?? 0,
                    hp_recover: skill.hp_recover ?? 0,
                    hp_recover_speed: skill.hp_recover_speed ?? 5,
                    dmg_range: skill.dmg_range ?? 0,
                    duration: skill.duration ?? 0,
                    frequency: skill.frequency ?? 1,
                    atk_CR: skill.atk_CR ?? 0,
                    atk_CRD: skill.atk_CRD ?? 2,
                    ...skill
                })) as T;

            case SkillConfigPath.skillSprites:
                if (!Array.isArray(config)) {
                    console.warn(`[SkillDataManager] 技能精灵配置应该是一个数组`);
                    return [] as any;
                }
                return config as T;

            case SkillConfigPath.skillEffects:
                if (!Array.isArray(config)) {
                    console.warn(`[SkillDataManager] 技能效果配置应该是一个数组`);
                    return [] as any;
                }
                return config as T;

            default:
                return config as T;
        }
    }

    getSkillList(): ISkillConfig[] {
        return this._skillData.skills || [];
    }

    getSkillById(id: number): ISkillConfig | undefined {
        return this.getSkillList().find(skill => skill.id === id);
    }

    getSkillListByRarity(rarity: SkillRarity): ISkillConfig[] {
        return this.getSkillList().filter(skill => skill.rarity === rarity);
    }

    getSkillListByCampCamp(camp: string): ISkillConfig[] {
            return this.getSkillList().filter(skill => skill.camp === camp);
    }

    getSkillListByGroupGroup(group: string): ISkillConfig[] {
        return this.getSkillList().filter(skill => skill.group === group);
    }

    getSkillPathById(id: number, spriteType: string = 'release'): string {
        const skill = this.getSkillById(id);
        if (!skill || !skill.url) {
            console.warn(`[SkillDataManager] 技能ID${id}配置不存在或URL为空`);
            return '';
        }
        const path = `textures/skill/${skill.url}/${spriteType}/spriteFrame`;
        return path || `textures/skill/arrow/${spriteType}/spriteFrame`;
    }

    getSkillSpriteConfig(skillId: number, spriteType: string = 'release'): ISpriteConfig {
        const spriteConfig = this._skillData.skillSprites.find(
            sprite => sprite.skill_id === skillId && sprite.type === spriteType
        );
        
        if (!spriteConfig) {
            console.warn(`[SkillDataManager] 技能ID${skillId}的${spriteType}精灵配置不存在`);
            return defaultSkillSpriteConfig[spriteType] || defaultSkillSpriteConfig.release;
        }

        return spriteConfig;
    }

    getSkillEffectList(): ISkillEffectConfig[] {
        return this._skillData.skillEffects || [];
    }

    getSkillEffectById(id: number): ISkillEffectConfig | undefined {
        return this.getSkillEffectList().find(effect => effect.id === id);
    }

    getSkillEffectBySkillId(skillId: number): ISkillEffectConfig[] {
        return this.getSkillEffectList().filter(effect => effect.skill_id === skillId);
    }

    getSkillStats(): { total: number; byRarity: Record<SkillRarity, number> } {
        const skills = this.getSkillList();
        const byRarity: Record<SkillRarity, number> = {
            common: 0,
            base: 0,
            normal: 0,
            advanced: 0,
            ultimate: 0
        };

        skills.forEach(skill => {
            byRarity[skill.rarity]++;
        });

        return {
            total: skills.length,
            byRarity
        };
    }

    async reloadConfig(configName: string): Promise<void> {
        try {
            if (configName === SkillConfigPath.skills) {
                const config = await this.loadConfig<ISkillConfig[]>(configName);
                this._skillData.skills = config;
                console.log(`[SkillDataManager] 技能配置重新加载成功`);
            } else if (configName === SkillConfigPath.skillSprites) {
                const config = await this.loadConfig<ISpriteConfig[]>(configName);
                this._skillData.skillSprites = config;
                console.log(`[SkillDataManager] 技能精灵配置重新加载成功`);
            } else if (configName === SkillConfigPath.skillEffects) {
                const config = await this.loadConfig<ISkillEffectConfig[]>(configName);
                this._skillData.skillEffects = config;
                console.log(`[SkillDataManager] 技能效果配置重新加载成功`);
            }
        } catch (error) {
            console.error(`[SkillDataManager] 重新加载配置${configName}失败:`, error);
        }
    }
}

export const SDM = SkillDataManager.instance();
