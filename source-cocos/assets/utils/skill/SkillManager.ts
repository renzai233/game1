import { SkillFactory } from './SkillFactory';
import { Prefab, instantiate } from 'cc';
import { computedAngle } from 'db://assets/utils/utils';
import { ISkill } from './ISkill';
import { SkillEffectController } from './controller/SkillEffectController';
import { HDM } from '../data/config/hero/HeroDataManager';
import { GameData } from '../data/config/manager/GameDataManager';
import { SDM } from '../data/config/skill/SkillDataManager';

/**
 * 技能全局管理器
 */
export class SkillManager {
    /** 单位ID到技能列表的映射 */
    private static _unitSkills: Map<number, ISkill[]> = new Map();

    /**
     * 给单位挂载技能
     * @param unitId 单位ID
     * @param skillId 技能ID
     * @param skillEffectPrefab 子弹预制体（可选）
     */
    static async addSkillToUnit(unitId: number, skillId: number, skillEffectPrefab?: Prefab): Promise<ISkill | null> {
        const skill = await SkillFactory.createSkill(skillId, skillEffectPrefab, unitId);
        if (!skill) return null;
        let skills = this._unitSkills.get(Number(unitId));
        if (!skills) {
            skills = [];
            this._unitSkills.set(Number(unitId), skills);
        }
        skills.push(skill);
        return skill;
    }

    /**
     * 获取单位所有技能
     */
    static getSkillsOfUnit(unitId: number): ISkill[] {
        const result = this._unitSkills.get(unitId) || [];
        return result;
    }

    /**
     * 技能升级
     */
    static levelUpSkill(unitId: number, skillId: number): void {
        const skills = this._unitSkills.get(Number(unitId));
        if (!skills) return;
        const skill = skills.find(s => s.skillId === skillId);
        if (skill) {
            skill.levelUp();
        }
    }

    /**
     * 技能冷却更新（每帧调用）
     */
    static updateCooldown(dt: number): void {
        for (const skills of this._unitSkills.values()) {
            for (const skill of skills) {
                if (skill.castTime > 0) {
                    skill.castTime = Math.max(0, skill.castTime + dt);
                }
            }
        }
    }

    /**
     * 设置技能等级（用于与卡牌星级同步）
     * @param unitId 单位ID
     * @param skillId 技能ID
     * @param level 目标等级
     */
    static setSkillLevel(unitId: number, skillId: number, level: number): void {
        const skills = this._unitSkills.get(Number(unitId));
        if (!skills) return;
        const skill = skills.find(s => s.skillId === skillId);
        if (skill) {
            skill.skillLevel = Math.min(level, skill.skillMaxLevel);
        }
    }

    /**
     * 英雄自动释放技能
     * @param gameCtrlNode GameController 节点
     * @param fightAreaNode 战斗区域节点
     * @param scaledDelta 帧间隔
     * @param cooldown 技能冷却记录对象
     */
    static heroAutoReleaseSkill(gameCtrlNode: any, fightAreaNode: any, scaledDelta: number, cooldown: any): void {
        // 通过游戏数据获取所有上场英雄，目前不行因为需要场景中的英雄节点

        // 遍历所有上场英雄节点，分别处理技能表现
        fightAreaNode.children.forEach(heroNode => {
            // 获取英雄控制器，如果英雄控制器不存在，说明非英雄节点
            const heroCtrl = heroNode.getComponent('HeroController');
            if (heroCtrl) {
                // 更新英雄
                heroCtrl.update(scaledDelta);
                // 取该英雄数据
                const heroData = GameData.heroes.find(h => h.id === heroCtrl['_heroId']);
                const heroCfg = heroData ? HDM.getHeroList().find(h => h.id === heroData.id) : null;
                if (heroCfg && heroCfg.can_skill) {
                    SkillManager.handleSkillEffect(scaledDelta, heroNode, fightAreaNode, gameCtrlNode, heroData, heroCfg.can_skill, cooldown);
                } else {
                    console.log('[SkillManager] heroAutoReleaseSkill', heroCtrl['_heroId'], 'can_skill=false，不释放技能');
                }
            }
        });
    }

    /**
     * 处理卡牌效果（技能/子弹表现主循环）
     * @param deltaTime 帧间隔
     * @param heroNode 英雄节点
     * @param fightAreaNode 战斗区域节点
     * @param node GameController 节点（用于查找Group等）
     * @param heroData 英雄数据
     * @param canSkill 是否可释放技能
     * @param cooldownLeft 技能冷却记录对象
     */
    static handleSkillEffect(deltaTime: number, heroNode: any, fightAreaNode: any, node: any, heroData: any, canSkill: boolean, cooldownLeft: any) {
        if (!canSkill) return;

        // 只查找非本阵营的单位
        let arr = (fightAreaNode.children as any[]).filter((v: any) => {
            if (!v || typeof v.getComponent !== 'function') return false;
            const unit = v.getComponent('UnitController');
            if (!unit || !unit.unitData) return false;
            if (!heroNode || typeof heroNode.getComponent !== 'function') return false;
            const heroUnit = heroNode.getComponent('UnitController');
            if (!heroUnit || !heroUnit.unitData) return false;
            return unit.unitData.camp !== heroUnit.unitData.camp;
        });
        if (arr.length === 0) return;

        // 选择距离英雄最近的敌人，避免弹道目标被固定到单一竖线。
        const heroPos = heroNode.position;
        let targetEnemy = arr[0];
        let minDistSq = Infinity;
        for (const enemy of arr) {
            const dx = enemy.position.x - heroPos.x;
            const dy = enemy.position.y - heroPos.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                targetEnemy = enemy;
            }
        }

        // 计算角度
        let angle = computedAngle(heroNode, targetEnemy);


        // 封装获取子弹和对应攻击频率方法
        const getBulletFunc = (group: any, callback: any) => {
            // 获取子弹
            let se = this.getBulletByGroup(group, heroData);
            if (se) {
                // 如果子弹冷却为空，则设置为1
                if (typeof cooldownLeft[`${se['id']}`] !== 'number') {
                    cooldownLeft[`${se['id']}`] = 1;
                }
                // 回调
                callback && callback(se);
            }
        };

    }

    /**
     * 根据卡牌分组获取对应的子弹信息
     * 用于后续生成子弹和计算攻击频率。
     */
    static getBulletByGroup(group: any, heroData: any) {
        if (!group) {
            return null;
        }

        // 使用技能数据本身作为子弹数据，而不是从子弹字典中查找
        let se = null;

        // 如果是单个技能对象
        if (group.id || group.skillId) {
            se = JSON.parse(JSON.stringify(group));
        }
        // 如果是技能组，取最高等级的技能
        else if (group.data && group.data.length > 0) {
            let data = group.data;
            let ids = data.map((v: any) => v.id || v.skillId);
            let max = Math.max(...ids);
            let maxObj = data.find((v: any) => (v.id || v.skillId) === max);
            se = JSON.parse(JSON.stringify(maxObj));
        }

        if (!se) {
            return null;
        }

        // 统一属性赋值
        const heroId = Number(heroData?.id);
        const groupId = group.groupId || group.data?.[0]?.groupId;
        const groupAttrs = GameData.heroSkillGroupAttrs?.[heroId]?.[groupId];
        if (groupAttrs) {
            if (groupAttrs.atk !== undefined) se.atk = groupAttrs.atk;
            if (groupAttrs.cooldown !== undefined) se.cooldown = groupAttrs.cooldown;
            if (groupAttrs.range !== undefined) se.range = groupAttrs.range;
        }

        // 兼容卡牌的默认攻击频率
        let defCardObj = SDM.getSkillList().find((v) => v.id === heroData['defCardId']);
        if (defCardObj) {
            // 检查是否是默认攻击，是的话bullet的攻击频率需要改为英雄的攻击频率
            if (se.id === defCardObj.id) {
                se['frequency'] = heroData['attackSpeed'];
            }
        }

        if (se.cooldown !== undefined) {
            se.cooldown = Math.max(0.1, se.cooldown);
        }
        if (se.frequency !== undefined) {
            se.frequency = Math.max(0.1, se.frequency);
        }
        return se;
    }

    // 在游戏初始化时注册对象池
    static initObjectPools(sePrefab: Prefab, skillEffectPrefab: Prefab) {
        SkillEffectController.registerPool(() => {
            return instantiate(sePrefab).getComponent(SkillEffectController);
        }, 100);
        SkillEffectController.registerPool(() => {
            return instantiate(skillEffectPrefab).getComponent(SkillEffectController);
        }, 100);
    }

    // 在技能/子弹生成处统一用对象池获取和回收
    static getBulletFromPool() {
        return SkillEffectController.getFromPool();
    }

    static getSkillEffectFromPool() {
        return SkillEffectController.getFromPool();
    }

    static recycleBullet(se: SkillEffectController) {
        SkillEffectController.recycleToPool(se);
    }

    static recycleSkillEffect(effect: SkillEffectController) {
        SkillEffectController.recycleToPool(effect);
    }
}
