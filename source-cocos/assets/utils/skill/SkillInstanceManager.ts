import { Node } from 'cc';
import { ISkill } from './ISkill';
import { SkillFactory } from './SkillFactory';
import { SkillStatusManager } from './SkillStatusManager';
import { gameBus } from 'db://assets/utils/signal/GameBus';
import { SIGNAL_TYPES } from '../signal/ISignal';

/**
 * 技能实例管理器
 * 负责管理所有技能实例的自主释放
 */
export class SkillInstanceManager {
    private static _skillInstances: Map<number, Map<number, ISkill>> = new Map();
    private static _skillCooldowns: Map<string, number> = new Map();
    private static _fightAreaNode: Node | null = null;
    private static _gameCtrlNode: Node | null = null;

    static init(fightAreaNode: Node, gameCtrlNode: Node): void {
        console.log('[SkillInstanceManager] 开始初始化');
        console.log('[SkillInstanceManager] fightAreaNode:', fightAreaNode);
        console.log('[SkillInstanceManager] gameCtrlNode:', gameCtrlNode);
        
        if (!fightAreaNode) {
            console.error('[SkillInstanceManager] fightAreaNode为空，初始化失败');
            return;
        }
        
        if (!gameCtrlNode) {
            console.error('[SkillInstanceManager] gameCtrlNode为空，初始化失败');
            return;
        }
        
        this._fightAreaNode = fightAreaNode;
        this._gameCtrlNode = gameCtrlNode;
        console.log('[SkillInstanceManager] 初始化完成');
    }

    static async createSkillInstance(heroId: number, skillId: number): Promise<ISkill | null> {
        try {
            const skill = await SkillFactory.createSkill(skillId, undefined, heroId);
            if (!skill) return null;

            if (!this._skillInstances.has(heroId)) {
                this._skillInstances.set(heroId, new Map());
            }
            this._skillInstances.get(heroId)!.set(skillId, skill);

            const cooldownKey = this.getCooldownKey(heroId, skillId);
            this._skillCooldowns.set(cooldownKey, 0);

            console.log(`[SkillInstanceManager] 创建技能实例成功: heroId=${heroId}, skillId=${skillId}`);
            return skill;
        } catch (error) {
            console.error(`[SkillInstanceManager] 创建技能实例失败: heroId=${heroId}, skillId=${skillId}`, error);
            return null;
        }
    }

    static updateAllSkills(deltaTime: number): void {
        console.log('[SkillInstanceManager] updateAllSkills 被调用');
        console.log('[SkillInstanceManager] 技能实例数量:', this._skillInstances.size);
        
        if (!this._fightAreaNode) {
            console.warn('[SkillInstanceManager] 战斗区域节点未设置');
            console.log('[SkillInstanceManager] _fightAreaNode:', this._fightAreaNode);
            console.log('[SkillInstanceManager] _gameCtrlNode:', this._gameCtrlNode);
            return;
        }

        for (const [heroId, heroSkills] of this._skillInstances) {
            console.log(`[SkillInstanceManager] 检查英雄${heroId}的技能，技能数量: ${heroSkills.size}`);
            const heroNode = this.findHeroNode(heroId);
            if (!heroNode) {
                console.warn(`[SkillInstanceManager] 未找到英雄节点: heroId=${heroId}`);
                continue;
            }

            this.updateHeroSkills(heroId, heroSkills, heroNode, deltaTime);
        }
    }

    private static updateHeroSkills(
        heroId: number, 
        heroSkills: Map<number, ISkill>, 
        heroNode: Node, 
        deltaTime: number
    ): void {
        const enemies = this.getEnemies(heroNode);
        console.log(`[SkillInstanceManager] 英雄${heroId}的敌人数量: ${enemies.length}`);
        
        if (enemies.length === 0) {
            console.log(`[SkillInstanceManager] 英雄${heroId}没有敌人，跳过技能释放`);
            return;
        }

        console.log(`[SkillInstanceManager] 英雄${heroId}有${enemies.length}个敌人，检查${heroSkills.size}个技能`);
        for (const [skillId, skill] of heroSkills) {
            console.log(`[SkillInstanceManager] 检查英雄${heroId}的技能${skillId}`);
            this.updateSkillInstance(skill, heroId, skillId, heroNode, enemies, deltaTime);
        }
    }

    private static updateSkillInstance(
        skill: ISkill,
        heroId: number,
        skillId: number,
        heroNode: Node,
        enemies: Node[],
        deltaTime: number
    ): void {
        const cooldownKey = this.getCooldownKey(heroId, skillId);
        let cooldownTime = this._skillCooldowns.get(cooldownKey) || 0;

        console.log(`[SkillInstanceManager] 英雄${heroId}技能${skillId}冷却时间: ${cooldownTime}`);

        if (cooldownTime > 0) {
            cooldownTime -= deltaTime;
            this._skillCooldowns.set(cooldownKey, Math.max(0, cooldownTime));
            
            // 更新冷却进度
            const totalCooldown = skill.cooldown || 1;
            const progress = 1 - (cooldownTime / totalCooldown);
            SkillStatusManager.updateSkillStatus(heroId, skillId, 'cooldown', progress);
            
            console.log(`[SkillInstanceManager] 英雄${heroId}技能${skillId}冷却中，剩余时间: ${cooldownTime}`);
            return;
        }

        const canCast = this.canSkillCast(skill, heroNode, enemies);
        console.log(`[SkillInstanceManager] 英雄${heroId}技能${skillId}可释放: ${canCast}`);

        if (canCast) {
            this.castSkill(skill, heroId, skillId, heroNode, enemies);
            const cooldown = skill.cooldown || 1;
            this._skillCooldowns.set(cooldownKey, cooldown);
        } else {
            // 技能准备就绪
            SkillStatusManager.updateSkillStatus(heroId, skillId, 'ready', 0);
        }
    }

    private static canSkillCast(skill: ISkill, heroNode: Node, enemies: Node[]): boolean {
        const heroCtrl = heroNode.getComponent('UnitController') as any;
        const heroController = heroNode.getComponent('HeroController') as any;
        
        console.log(`[SkillInstanceManager] 技能释放条件检查:`, {
            heroCtrl: !!heroCtrl,
            heroHp: heroCtrl?.hp,
            enemiesCount: enemies.length,
            canLearn: skill.canLearn,
            canSkill: heroController?.canSkill
        });
        
        if (!heroCtrl || heroCtrl.hp <= 0) {
            console.log(`[SkillInstanceManager] 英雄控制器无效或HP不足`);
            return false;
        }
        if (enemies.length === 0) {
            console.log(`[SkillInstanceManager] 没有敌人`);
            return false;
        }
        if (!skill.canLearn) {
            console.log(`[SkillInstanceManager] 技能不可学习`);
            return false;
        }
        
        // 检查英雄是否可以进行技能释放
        if (heroController && !heroController.canSkill) {
            console.log(`[SkillInstanceManager] 英雄不能释放技能`);
            return false;
        }
        
        console.log(`[SkillInstanceManager] 技能释放条件满足`);
        return true;
    }

    private static castSkill(
        skill: ISkill,
        heroId: number,
        skillId: number,
        heroNode: Node,
        enemies: Node[]
    ): void {
        try {
            // 更新技能状态为释放中
            SkillStatusManager.updateSkillStatus(heroId, skillId, 'releasing', 0);
            gameBus.emit(SIGNAL_TYPES.SKILL_STATUS_CHANGED, {
                heroId,
                skillId,
                status: 'releasing',
                progress: 0
            });

            // 创建敌人节点的副本，避免循环引用
            const enemyNodes = enemies.map(enemy => ({
                position: enemy.position.clone(),
                id: (enemy.getComponent('UnitController') as any)?.id,
                camp: (enemy.getComponent('UnitController') as any)?.camp,
                hp: (enemy.getComponent('UnitController') as any)?.hp
            }));

            // 调用技能实例的cast方法
            skill.cast(heroNode, enemies);
            
            // 播放技能动画和音效
            skill.playAnimation();
            skill.playSound();

            // 更新技能状态为冷却中
            SkillStatusManager.updateSkillStatus(heroId, skillId, 'cooldown', 0);
            gameBus.emit(SIGNAL_TYPES.SKILL_STATUS_CHANGED, {
                heroId,
                skillId,
                status: 'cooldown',
                progress: 0
            });

            console.log(`[SkillInstanceManager] 技能释放: heroId=${heroId}, skillId=${skillId}`);
        } catch (error) {
            console.error(`[SkillInstanceManager] 技能释放异常: heroId=${heroId}, skillId=${skillId}`, error);
        }
    }

    private static findHeroNode(heroId: number): Node | null {
        if (!this._fightAreaNode) return null;
        
        for (const child of this._fightAreaNode.children) {
            const heroCtrl = child.getComponent('HeroController') as any;
            if (heroCtrl && heroCtrl.id === heroId) {
                return child;
            }
        }
        return null;
    }

    private static getEnemies(heroNode: Node): Node[] {
        if (!this._fightAreaNode) {
            console.log('[SkillInstanceManager] getEnemies: 战斗区域节点为空');
            return [];
        }

        const heroCtrl = heroNode.getComponent('UnitController') as any;
        if (!heroCtrl) {
            console.log('[SkillInstanceManager] getEnemies: 英雄控制器为空');
            return [];
        }

        console.log(`[SkillInstanceManager] getEnemies: 英雄阵营=${heroCtrl.camp}, HP=${heroCtrl.hp}`);

        const enemies: Node[] = [];
        for (const child of this._fightAreaNode.children) {
            const unitCtrl = child.getComponent('UnitController') as any;
            if (unitCtrl && unitCtrl.camp !== heroCtrl.camp && unitCtrl.hp > 0) {
                enemies.push(child);
                console.log(`[SkillInstanceManager] getEnemies: 找到敌人，阵营=${unitCtrl.camp}, HP=${unitCtrl.hp}`);
            }
        }
        
        console.log(`[SkillInstanceManager] getEnemies: 总共找到${enemies.length}个敌人`);
        return enemies;
    }

    private static getCooldownKey(heroId: number, skillId: number): string {
        return `${heroId}-${skillId}`;
    }

    static levelUpSkill(heroId: number, skillId: number): void {
        const skill = this.getSkillInstance(heroId, skillId);
        if (skill) {
            skill.levelUp();
            console.log(`[SkillInstanceManager] 技能升级: heroId=${heroId}, skillId=${skillId}`);
        }
    }

    static getSkillInstance(heroId: number, skillId: number): ISkill | null {
        const heroSkills = this._skillInstances.get(heroId);
        if (!heroSkills) return null;
        return heroSkills.get(skillId) || null;
    }

    static getSkillCooldown(heroId: number, skillId: number): number {
        const cooldownKey = this.getCooldownKey(heroId, skillId);
        return this._skillCooldowns.get(cooldownKey) || 0;
    }

    static clearAllSkills(): void {
        this._skillInstances.clear();
        this._skillCooldowns.clear();
    }

    /**
     * 测试技能系统功能
     */
    static testSkillSystem(): void {
        console.log('[SkillInstanceManager] 开始测试技能系统');
        console.log('[SkillInstanceManager] 技能实例数量:', this._skillInstances.size);
        console.log('[SkillInstanceManager] 战斗区域节点:', this._fightAreaNode);
        console.log('[SkillInstanceManager] 游戏控制器节点:', this._gameCtrlNode);
        
        for (const [heroId, heroSkills] of this._skillInstances) {
            console.log(`[SkillInstanceManager] 英雄${heroId}的技能数量:`, heroSkills.size);
            for (const [skillId, skill] of heroSkills) {
                console.log(`[SkillInstanceManager] 英雄${heroId}的技能${skillId}:`, skill);
            }
        }
    }
} 