import { _decorator, director, instantiate, Node, Vec3 } from 'cc';
import { UnitController } from './UnitController';
import { computedAngle } from '../../../utils/utils';
import { gameBus } from '../../../utils/signal/GameBus';
import { RangeController, BallisticController } from '../../../utils/skill';
import { ISkill, SkillFactory, SKILL_ROOT } from '../../../utils/skill';
import { applySpeedScale } from 'db://assets/utils/data/config/manager/GameDataManager';
import { SDM } from 'db://assets/utils/data/config/skill/SkillDataManager';
const { ccclass } = _decorator;
const HERO_UPWARD_SHOT_ANGLE = 90;
const HERO_CAST_ANIMATION_DURATION_MS = 900;

@ccclass('HeroController')
export class HeroController extends UnitController {
    hadSkills: ISkill[] = []; // 已学会技能
    hadEffects: any[] = []; // 已学会效果

    /**
     * 初始化英雄，加载默认技能
     */
    public async init(data: any) {
        await super.init(data);
        this.id = data.id; // 确保id赋值，便于升级时匹配
        this.hadSkills = [];
        this.hadEffects = [];

        if (data && Array.isArray(data.skills) && data.skills.length > 0) {
            for (const s of data.skills) {
                const defaultSkillId = typeof s === 'object' ? s.skillId : s;
                if (!defaultSkillId || defaultSkillId === undefined) continue;

                // 从基础数据中获取技能配置
                const skillConfig = SDM.getSkillList().find(v => v.id === defaultSkillId);
                if (skillConfig) {
                    // 构建技能数据，确保包含所有必要的属性
                    const skillData = {
                        ...skillConfig,
                        skillId: defaultSkillId,
                        heroId: this.id,
                        id: defaultSkillId,
                        level: 1,
                        damage: skillConfig.atk || 10,
                        cooldown: skillConfig.cooldown || 1,
                        range: skillConfig.atk_range || 500,
                        attackSpeed: skillConfig.cooldown || 1,
                        pierce: skillConfig.pierce || 1,
                        scatterAngle: (skillConfig as any).scatterAngle ?? (skillConfig as any).scatter_angle,
                        duration: skillConfig.duration || 1,
                        group: this.getSkillRoot(skillConfig.group),
                        releaseType: skillConfig.release_type || 'auto',
                        effectType: skillConfig.effect_type || 'damage'
                    };

                    // 创建技能实例
                    const skill = await SkillFactory.createSkill(defaultSkillId, skillData);
                    if (skill) {
                        this.hadSkills.push(skill);
                    }
                }
            }
        }
    }

    /**
     * 将字符串group转换为SKILL_ROOT枚举
     */
    private getSkillRoot(group: string): SKILL_ROOT {
        switch (group) {
            case 'ballistic':
                return SKILL_ROOT.BALLISTIC;
            case 'range':
                return SKILL_ROOT.RANGE;
            case 'laser':
                return SKILL_ROOT.LASER;
            default:
                return SKILL_ROOT.BALLISTIC;
        }
    }

    /**
     * 英雄升级（直接升级技能）
     * @param skillId 升级的技能ID
     */
    public levelUpSkill(skillId: number) {
        // 查找要升级的技能
        const skill = this.hadSkills.find(s => s.skillId === skillId);
        if (!skill) {
            return;
        }

        // 升级技能
        skill.levelUp();

        // 广播技能更新事件
        gameBus.emit('skill-updated', skill);
    }

    public applySkillEffect(effectData: any) {
        this.updateSkillEffect(effectData);
    }

    /**
     * 处理卡牌效果（技能/子弹表现主循环）
     */
    releaseSkillEffect() {
        if (this.hadSkills.length > 0) {
            const firstSkill = this.hadSkills[0];
            this.releaseSpecificSkill(firstSkill);
        }
    }

    /**
     * 英雄自动释放技能
     * @param deltaTime 帧间隔
     */
    public autoReleaseSkills(deltaTime: number) {
        // 确保hadSkills是数组
        if (!this.hadSkills || !Array.isArray(this.hadSkills)) {
            return;
        }

        // 更新所有技能的冷却
        for (const skill of this.hadSkills) {
            if (skill.atkTiming === undefined) skill.atkTiming = 0;
            if (skill.attackSpeed === undefined) skill.attackSpeed = 1;
            skill.atkTiming += applySpeedScale(deltaTime);
        }

        // 检查并释放技能
        for (const skill of this.hadSkills) {
            // 检查是否可释放
            if (this.canSkill && skill.atkTiming >= skill.attackSpeed) {
                // 释放技能
                this.releaseSpecificSkill(skill);

                // 重置冷却
                skill.atkTiming = 0;

                // 只释放一个技能
                break;
            }
        }
    }

    /**
     * 释放指定技能
     * @param skill 要释放的技能
     */
    private releaseSpecificSkill(skill: ISkill) {
        if (!this.canSkill || !skill) return;

        const scene = director.getScene();
        const canvas = scene.getChildByName('Canvas');
        let fightAreaNode = canvas ? canvas.getChildByName('FightArea') : null;
        if (!fightAreaNode || !canvas) {
            return;
        }

        // 只查找非本阵营的单位
        let enemies = (fightAreaNode.children as any[]).filter(n => {
            if (n === this.node) return false;
            if (!n.activeInHierarchy) return false;
            if (!n || typeof n.getComponent !== 'function') return false;

            const unit = n.getComponent('MonsterController');
            if (!unit) return false;
            return (unit as any).camp !== this.camp;
        });

        if (enemies.length === 0) {
            return;
        }

        // 根据技能类型释放
        if (skill.group === SKILL_ROOT.BALLISTIC) {
            const targetEnemy = this.selectSkillTarget(enemies);
            if (!targetEnemy) return;

            const rawAngle = computedAngle(this.node, targetEnemy);
            const angle = typeof rawAngle === 'number' && Number.isFinite(rawAngle)
                ? rawAngle
                : HERO_UPWARD_SHOT_ANGLE;

            let skillEffectNode = (canvas.getChildByName('Group') as any)?.getComponent(BallisticController);
            if (skillEffectNode) {
                this.playCastAnimation();
                skillEffectNode.init(skill, angle, this.node, this.camp);
            }
        } else if (skill.group === SKILL_ROOT.RANGE) {
            let skillEffectNode = (canvas.getChildByName('Group') as any)?.getComponent(RangeController);
            if (skillEffectNode) {
                // 对于范围技能，angle可以设为0，因为不需要方向
                this.playCastAnimation();
                skillEffectNode.init(skill, 0, this.node, this.camp);
            }
        } else if (skill.group === SKILL_ROOT.LASER) {
            // 激光技能：选择有效目标并计算角度
            const targetEnemy = this.selectSkillTarget(enemies);
            if (!targetEnemy) return;

            const distance = Vec3.distance(this.node.position, targetEnemy.position);
            const skillId = skill.skillId || skill.id;
            const skillConfig = SDM.getSkillById(skillId) as any;
            const attackRange = Number((skill as any).range ?? (skill as any).attackRange ?? skillConfig?.atk_range ?? 820);

            // 只有在攻击范围内才释放激光
            if (distance <= attackRange) {
                const rawAngle = computedAngle(this.node, targetEnemy);
                const angle = typeof rawAngle === 'number' && Number.isFinite(rawAngle)
                    ? rawAngle
                    : HERO_UPWARD_SHOT_ANGLE;
                this.playCastAnimation();
                this.createLaserSkillEffect(skill, angle);
            }
        }
    }

    private selectSkillTarget(enemies: Node[]): Node | null {
        if (!enemies || enemies.length === 0 || !this.node) return null;

        if (this.target && this.target.isValid && this.target.activeInHierarchy && enemies.indexOf(this.target) !== -1) {
            return this.target;
        }

        let nearest: Node | null = null;
        let minDist = Infinity;
        for (const enemy of enemies) {
            if (!enemy || !enemy.isValid || !enemy.activeInHierarchy) continue;
            const dist = Vec3.distance(this.node.position, enemy.position);
            if (dist < minDist) {
                minDist = dist;
                nearest = enemy;
            }
        }
        return nearest;
    }

    private playCastAnimation(): void {
        this.playMomentarySprite('skill', 'idle', HERO_CAST_ANIMATION_DURATION_MS, false);
        this.playActionJuice('skill');
    }

    /**
     * 创建激光技能效果
     * @param skill 技能数据
     * @param angle 角度
     */
    private createLaserSkillEffect(skill: ISkill, angle: number) {
        if (!this.skillEffectPrefab) {
            console.error('[HeroController] 缺少技能效果预制体');
            return;
        }

        // 创建技能效果节点
        const skillEffectNode = instantiate(this.skillEffectPrefab);
        if (!skillEffectNode) {
            console.error('[HeroController] 技能效果预制体实例化失败');
            return;
        }

        // 计算激光起始位置（从英雄旁边释放，而不是中心）
        const heroPos = this.node.position;
        const offsetDistance = 30; // 激光距离英雄中心的偏移距离
        const offsetX = Math.cos(angle * Math.PI / 180) * offsetDistance;
        const offsetY = Math.sin(angle * Math.PI / 180) * offsetDistance;
        const laserStartPos = new Vec3(
            heroPos.x + offsetX,
            heroPos.y + offsetY,
            heroPos.z
        );

        // 设置位置和角度
        skillEffectNode.setPosition(laserStartPos);
        skillEffectNode.setRotationFromEuler(0, 0, angle);

        // 添加到战斗区域
        this.node.parent.addChild(skillEffectNode);

        // 获取SkillEffectController并初始化
        const skillEffectCtrl = skillEffectNode.getComponent('SkillEffectController') as any;
        if (skillEffectCtrl) {
            const skillId = skill.skillId || skill.id;
            const skillConfig = SDM.getSkillById(skillId) as any;
            const laserRange = Number((skill as any).range ?? (skill as any).attackRange ?? skillConfig?.atk_range ?? 820);
            const laserWidth = Number((skill as any).width ?? skillConfig?.width ?? 34);
            const laserDuration = Number((skill as any).duration ?? skillConfig?.duration ?? 2.2);
            const laserDamageSpeed = Number((skill as any).damageSpeed ?? skillConfig?.damageSpeed ?? skillConfig?.damage_speed ?? 3);
            const laserColor = String((skill as any).color ?? skillConfig?.color ?? '#64eaff');

            // 准备技能数据
            const skillData = {
                id: skillId,
                skillId,
                atk: (skill as any).damage || (skill as any).atk || 15,
                range: laserRange,
                duration: laserDuration,
                damageSpeed: laserDamageSpeed,
                width: laserWidth,
                color: laserColor,
                camp: this.camp,
                scatterAngle: angle,
                pierce: skill.pierce || 999,
                moveSpeed: 0, // 激光不移动
                // 添加激光技能效果配置
                url: 'laser', // 激光资源路径
                spriteConfig: {
                    release: {
                        w: laserRange, // 激光长度
                        h: laserWidth,  // 激光宽度
                        itemW: laserRange, // 单个宽度
                        itemH: laserWidth,  // 单个高度
                        scale: [1, 1, 1], // 缩放
                    },
                    blow: {
                        w: laserRange,
                        h: laserWidth,
                        itemW: laserRange,
                        itemH: laserWidth,
                        scale: [1, 1, 1],
                    },
                }
            };

            skillEffectCtrl.init(skillData);
        } else {
            console.error('[HeroController] 技能效果节点缺少SkillEffectController组件');
            skillEffectNode.destroy();
        }
    }

    /** 每帧更新，处理技能冷却与自动释放 */
    update(dt: number) {
        if (!this.node) return;
        if (!gameBus.paused) {
            this.findTarget();
            this.playSprite(dt);
            this.autoReleaseSkills(dt);
            this.node.setSiblingIndex(999999);
        }
    }

    /**
     * 组件销毁时清理资源
     */
    onDestroy() {
        // 调用父类的清理方法
        super.onDestroy();
    }

    /**
     * 更新技能效果
     * @param effectData 技能效果数据
     */
    updateSkillEffect(effectData: any) {
        if (!effectData) return;

        // 查找对应的技能
        const skill = this.hadSkills.find(s => s.skillId === effectData.skill_id || s.skillId === effectData.skillId);
        if (skill) {
            // 应用技能效果
            if (effectData.atk_rate) {
                skill.damage = (skill.damage || 0) * (1 + effectData.atk_rate);
            }
            if (effectData.quantity) {
                (skill as any).quantity = ((skill as any).quantity || 0) + effectData.quantity;
            }
            if (effectData.repeat) {
                (skill as any).repeat = ((skill as any).repeat || 0) + effectData.repeat;
            }
            if (effectData.pierce) {
                skill.pierce = (skill.pierce || 0) + effectData.pierce;
            }
        }

        // 添加到已学会效果
        this.hadEffects.push(effectData);
    }

    /**
     * 获取可学习的技能效果
     */
    get learnableEffects() {
        return this.hadEffects.filter(effect => effect.can_learn || effect.canLearn);
    }
}
