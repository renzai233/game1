import {
    _decorator,
    Collider2D,
    Color,
    Component,
    Contact2DType,
    IPhysics2DContact,
    Sprite,
    Vec3,
    Graphics,
    UITransform,
    BoxCollider2D,
    Size,
    Node,
} from 'cc';
import { loadResAsset, loadResSingleAsset } from 'db://assets/utils/utils';
import { applySpeedScale, GameData } from 'db://assets/utils/data/config/manager/GameDataManager';
import { gameBus } from 'db://assets/utils/signal/GameBus';
import { ObjectPool } from 'db://assets/utils/common/ObjectPool';
import { skillEffectPool } from 'db://assets/utils/skill/SkillEffectPool';
import { safeApplyColliderShape, safeDisablePhysics2D, safeRestorePhysics2D } from 'db://assets/utils/physics/SafePhysics2D';
import { SDM, defaultSkillSpriteConfig } from '../../data/config/skill/SkillDataManager';
import { UNIT_CAMP } from '../../data/dict/base/UnitAttrList';
const { ccclass } = _decorator;

@ccclass('SkillEffectController')
export class SkillEffectController extends Component {
    _data: object = null; // 技能效果数据
    /** 对象池标识（可选） */
    private _poolKey: string | null = null;

    /** 异步贴图请求代次，防止对象池复用后的回调串写 */
    private _spriteLoadToken: number = 0;
    /** 当前贴图请求键，用于二次校验 */
    private _spriteLoadKey: string = '';

    /** 缓存：范围技能实际显示尺寸（基于单帧×缩放） */
    private _displayW: number = 0;
    private _displayH: number = 0;
    private _hitTargets: Set<string> = new Set(); // 防止重复伤害同一个目标

    _release_unit_id: number = -1; // 释放单位id

    _atk: number = 0; // 伤害
    _angle: number = 0; // 角度
    _camp: string = ''; // 阵营：不攻击己方阵营单位,使用 UNIT_CAMP 字符串类型
    _pierce: number = 1; // 剩余可穿透敌人数
    _duration: number = 1; // 技能持续时间：播放精灵图时间
    _range: number = 0; // 技能范围百分比：精灵图比例调整

    _isMove: boolean = true; // 是否可以移动

    spriteFrames: any[] = []; // 精灵帧集合
    curSpriteIndex: number = 0; // 当前精灵帧
    interTime: number = 1; // 帧间隔
    actionInterTime: number = 0; // 单个动作帧间隔
    private _pendingColliderApplyNode: Node | null = null;

    private syncSpriteCollider(spriteNode: Node, width: number, height: number): void {
        const collider = spriteNode.getComponent(BoxCollider2D);
        if (!collider) return;

        if (width <= 0 || height <= 0) {
            collider.enabled = false;
            if (this._pendingColliderApplyNode === spriteNode) {
                this._pendingColliderApplyNode = null;
            }
            return;
        }

        const safeWidth = Math.max(1, Math.round(width || 0));
        const safeHeight = Math.max(1, Math.round(height || 0));
        collider.size = new Size(safeWidth, safeHeight);
        collider.enabled = true;
        if (safeApplyColliderShape(collider, 'SkillEffectController.syncSpriteCollider')) {
            this._pendingColliderApplyNode = null;
        } else {
            this._pendingColliderApplyNode = spriteNode;
        }
    }

    onEnable() {
        const spriteNode = this._pendingColliderApplyNode;
        if (!spriteNode || !spriteNode.isValid) {
            this._pendingColliderApplyNode = null;
            return;
        }

        const collider = spriteNode.getComponent(BoxCollider2D);
        if (safeApplyColliderShape(collider, 'SkillEffectController.onEnable')) {
            this._pendingColliderApplyNode = null;
        }
    }

    /** 绑定对象池标识（可选） */
    public bindPool(poolKey: string): void {
        this._poolKey = poolKey || null;
    }

    /** 回收到对象池或直接销毁 */
    private recycleSelf(): void {
        const node = this.node;
        if (!node || !node.isValid) return;

        // 使之前的异步加载回调全部失效，避免回写到复用节点
        this._spriteLoadToken++;
        this._spriteLoadKey = '';
        this.spriteFrames = [];
        this._pendingColliderApplyNode = null;
        this.unscheduleAllCallbacks();

        const spriteNode = node.getChildByName('Sprite');
        if (spriteNode && spriteNode.isValid) {
            const collider = spriteNode.getComponent(Collider2D);
            if (collider) {
                collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            }
            const spriteComp = spriteNode.getComponent(Sprite);
            if (spriteComp) {
                spriteComp.spriteFrame = null;
                spriteComp.color = Color.WHITE;
            }
        }

        safeDisablePhysics2D(node, true);

        // 先从父节点移除并停用
        if (node.parent) node.removeFromParent();
        node.active = false;
        if (this._poolKey) {
            skillEffectPool.recycleEffect(this._poolKey, node);
        } else {
            node.destroy();
        }
    }

    /**
     * 初始化技能效果
     * @param data 技能效果数据
     * @param angle 角度
     * @param camp 阵营（可选，默认 HUMAN）
     */
    init(data: any) {
        if (!data) {
            console.error('[SkillEffectController] init: 数据为空');
            return;
        }

        // 对象池复用重置：清理旧状态与定时器
        this.unscheduleAllCallbacks();
        this._isMove = true; // 默认允许移动，范围/特殊技能在 generateSprite 内再关闭
        this.spriteFrames = [];
        this.curSpriteIndex = 0;
        this.interTime = 1;
        this.actionInterTime = 0;
        this._pendingColliderApplyNode = null;
        safeRestorePhysics2D(this.node, true);

        // 使之前的异步加载回调失效
        this._spriteLoadToken++;
        this._spriteLoadKey = '';

        // 清理旧的碰撞监听
        try {
            const spriteNode = this.node.getChildByName('Sprite');
            if (spriteNode) {
                const collider = spriteNode.getComponent(Collider2D);
                if (collider) {
                    collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
                }
                // 重置缩放与首帧，防止继承上次的显示状态
                spriteNode.setScale(1, 1, 1);
                // 重置子节点旋转，避免对象池复用导致的残留角度
                spriteNode.setRotationFromEuler(0, 0, 0);
                const s = spriteNode.getComponent(Sprite);
                if (s) {
                    s.spriteFrame = null;
                    s.color = Color.WHITE;
                }
                const uiTransform = spriteNode.getComponent(UITransform);
                if (uiTransform) {
                    uiTransform.setContentSize(0, 0);
                }
                this.syncSpriteCollider(spriteNode, 0, 0);
            }
        } catch (error) {
            console.warn('[SkillEffectController] reset sprite state failed:', error);
        }

        // 清理激光组件（若上次为激光）
        const g = this.node.getComponent(Graphics);
        if (g) {
            try {
                g.clear();
            } catch (error) {
                console.warn('[SkillEffectController] clear graphics failed:', error);
            }
            g.destroy();
        }

        this._data = data;
        // 重置范围显示缓存
        this._displayW = 0;
        this._displayH = 0;
        this._hitTargets.clear(); // 重置击中目标集合
        this._camp = data.camp ?? UNIT_CAMP.HUMAN; // 默认人类阵营
        // 初始化穿透次数，优先取data.pierce，没有则为1
        this._atk = (this._data && typeof this._data['atk'] === 'number') ? this._data['atk'] : 0;
        // 弹道技能默认穿透1次（伤害1个敌人），范围技能不穿透
        const skillId = this._data['id'] || this._data['skillId'];
        switch (skillId) {
            case 1002:
            case 1008: // 霜刃突袭 frostblade
            case 1009:
            case 1010: // 巨石重击 boulder
                this._pierce = 0;
            default:
                this._pierce = (this._data && typeof this._data['pierce'] === 'number') ? this._data['pierce'] : 1; // 箭矢默认穿透1次
        }
        this._duration = (this._data && typeof this._data['duration'] === 'number') ? this._data['duration'] : 1;
        this._range = (this._data && typeof this._data['range'] === 'number') ? this._data['range'] : 0;

        // 生成技能效果
        this.generateSprite();

        // 碰撞事件订阅
        const spriteNode = this.node.getChildByName('Sprite');
        if (spriteNode) {
            const collider = spriteNode.getComponent(Collider2D);
            if (collider) collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
        }

        // 恢复原方法：仅在此根据 scatterAngle 设置整体节点旋转
        if (typeof data.scatterAngle === 'number' && this.node) {
            this.node.setRotationFromEuler(0, 0, data.scatterAngle);
        }
    }

    /**
     * 碰撞开始时触发
     * @param selfCollider
     * @param otherCollider
     * @param contact
     * @returns
     */
    onBeginContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {
        // 只在两个碰撞体开始接触时被调用一次
        // 检查技能是否已经销毁或停止移动
        if (!this.node || !this.node.isValid || !this._isMove) {
            return;
        }

        const targetUnit = otherCollider.node.parent?.getComponent('MonsterController');
        // 只处理UnitController实例
        if (!targetUnit || typeof targetUnit !== 'object') return;
        // 只攻击非本阵营单位（用 UNIT_CAMP 判断）
        if ((targetUnit as any).camp === this._camp) return;

        const skillId = this._data['id'] || this._data['skillId'];

        // 范围技能不通过碰撞检测造成伤害，只通过定时器
        if (skillId === 1011) {
            return;
        }

        // 弹道技能造成伤害
        this.dealDamage(targetUnit);

        // 碰撞后爆炸处理逻辑
        if (skillId === 1002 || skillId === 1010 || skillId === 10013) {
            // 火球碰撞后播放爆炸动画，并造成爆炸伤害
            this._isMove = false;
            this.initSprite('blow');

            // 造成爆炸伤害（范围伤害）
            this.dealExplosionDamage();

            // 1秒后销毁
            this.scheduleOnce(() => {
                this.recycleSelf();
            }, 1);
        } else if (skillId === 1001 || skillId === 1004 || skillId === 1005
            || skillId === 1003 || skillId === 1006 || skillId === 1007 ||
            skillId === 1012 || skillId === 1013) {
            // 箭矢穿透逻辑：穿透次数减1，穿透完立即销毁
            this._pierce--;
            if (this._pierce <= 0) {
                // 穿透完毕，立即销毁
                this._isMove = false;
                if (skillId === 1004 || skillId === 1006 || skillId === 1007 || skillId === 1013) {
                    // 贯穿箭矢播放爆炸动画
                    this.initSprite('blow');
                    // 造成爆炸伤害（范围伤害）
                    this.dealExplosionDamage();
                    // 1秒后销毁
                    this.scheduleOnce(() => {
                        this.recycleSelf();
                    }, 1);
                    return;
                }
                this.scheduleOnce(() => {
                    this.recycleSelf();
                }, 0);
            } else {
                // 还有穿透次数，继续移动但标记已击中当前目标
                // console.log(`[SkillEffectController] 1001技能穿透剩余次数: ${this._pierce}`);
            }
        } else if (skillId === 1008 || skillId === 1009) {
            // boulder
            // 激光技能碰撞后立即销毁
            this._isMove = false;
            this.scheduleOnce(() => {
                this.recycleSelf();
            }, 0);
        }

    }


    // 辅助方法
    private handleExplosion() {
        this._isMove = false;
        this.initSprite('blow');
        this.dealExplosionDamage();
        this.scheduleOnce(() => this.recycleSelf(), 1);
    }

    private handlePierce(shouldExplode: boolean) {
        this._pierce--;
        if (this._pierce <= 0) {
            this._isMove = false;

            if (shouldExplode) {
                this.initSprite('blow');
                this.dealExplosionDamage();
                this.scheduleOnce(() => this.recycleSelf(), 1);
            } else {
                this.scheduleOnce(() => this.recycleSelf(), 0);
            }
        }
    }

    private handleImmediateRecycle() {
        this._isMove = false;
        this.scheduleOnce(() => this.recycleSelf(), 0);
    }

    /**
     * 造成伤害的统一方法
     * @param targetUnit 目标单位
     */
    private dealDamage(targetUnit: any): void {
        if (!targetUnit || !this._data) return;

        // 防止重复伤害同一个目标
        const targetId = targetUnit.node?.uuid || targetUnit._release_unit_id || 'unknown';
        if (this._hitTargets.has(targetId)) {
            return;
        }
        this._hitTargets.add(targetId);

        // 使用data.damage而不是_atk，因为data.damage已经包含了技能基础伤害和英雄伤害的总和
        let damage = this._data['damage'] || this._atk || 0;
        if (damage <= 0) return;

        // 应用全局伤害加成系数
        damage = Math.round(damage * GameData.damageScale);

        // 创建技能效果数据，确保能正确触发死亡事件和经验获取
        const skillEffectData = {
            atk: damage,
            camp: this._camp,
            id: this._data['id'] || this._data['skillId'],
            skillId: this._data['id'] || this._data['skillId'],
            // 弹道技能使用白色伤害显示，避免红色伤害
            color: this._data['color'] || '#ffffff'
        };

        // 调用目标的takeskill方法，确保能正确触发死亡事件
        if (typeof targetUnit.takeskill === 'function') {
            targetUnit.takeskill(skillEffectData);
        } else {
            console.warn('[SkillEffectController] 目标单位没有takeskill方法');
        }
    }

    /**
     * 根据技能初始化精灵图
     */
    generateSprite() {
        if (!this._data || typeof this._data !== 'object') {
            console.error('[SkillEffectController] 技能效果数据无效', this._data);
            return;
        }

        // 确保技能ID正确
        const skillId = this._data['id'] || this._data['skillId'];
        if (!skillId) {
            console.error('[SkillEffectController] 技能ID无效', this._data);
            return;
        }

        switch (skillId) {
            case 1001: // 箭矢
                this.initSprite('release');
                break;
            case 1009: // 激光技能
                this.initLaser();
                break;
            case 1011:
                // 范围技能：不移动，按持续时间销毁
                this._isMove = false;
                this.initSprite('blow');
                // 启动范围技能的持续伤害
                this.startRangeSkillDamage();
                {
                    const life = (typeof this._duration === 'number' && this._duration > 0) ? this._duration : 1;
                    // 使用智能销毁逻辑，考虑暂停状态
                    this.startSmartDestroyTimer(life);
                }
                break;
            default:
                this.initSprite('release');
                break;
        }
    }

    /**
     * 启动范围技能的持续伤害
     */
    private startRangeSkillDamage(): void {
        const damageInterval = this._data['damageInterval'] || 1; // 默认1秒伤害一次
        let damageTimer = 0;

        // 创建定期伤害处理函数
        const processRangeDamage = (dt: number) => {
            if (!this.node || !this.node.isValid) {
                return;
            }

            // 检查游戏是否暂停，如果暂停则不处理伤害
            if (gameBus.paused) {
                return;
            }

            damageTimer += applySpeedScale(dt);
            if (damageTimer >= damageInterval) {
                this.dealRangeSkillDamage();
                damageTimer = 0;
            }
        };

        // 注册定期伤害处理
        this.schedule(processRangeDamage, 0);
    }

    /**
     * 处理范围技能的区域伤害
     */
    private dealRangeSkillDamage(): void {
        if (!this.node || !this.node.isValid) return;

        const heroCamp = this._camp;
        // 应用全局伤害加成系数
        const damage = Math.round(this._atk * GameData.damageScale);

        // 优先使用缓存的单帧显示尺寸，避免重复计算与误差
        let rangeWidth = this._displayW || 100;
        let rangeHeight = this._displayH || 100;
        // 获取所有敌人
        const enemies = this.node.parent.children.filter(node => {
            const unit = node.getComponent('MonsterController');
            if (!unit) return false;
            return (unit as any).camp !== heroCamp;
        });

        let hitCount = 0; // 记录击中敌人数量
        const halfW = rangeWidth * 0.5;
        const halfH = rangeHeight * 0.5;
        const cx = this.node.position.x;
        const cy = this.node.position.y;

        // AABB 判定：在宽/高矩形范围内则命中
        enemies.forEach(enemy => {
            const dx = enemy.position.x - cx;
            const dy = enemy.position.y - cy;
            if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) {
                hitCount++;
                const enemyUnit = enemy.getComponent('MonsterController');
                if (enemyUnit) {
                    const skillEffectData = {
                        atk: damage,
                        camp: heroCamp,
                        id: this._data['id'] || this._data['skillId'],
                        skillId: this._data['id'] || this._data['skillId'],
                        color: '#ffffff' // 范围技能使用白色伤害显示
                    };
                    (enemyUnit as any).takeskill(skillEffectData);
                }
            }
        });
    }

    /**
     * 处理火球术的爆炸范围伤害
     */
    private dealExplosionDamage(): void {
        if (!this.node || !this.node.isValid) return;

        const heroCamp = this._camp;
        // 爆炸伤害通常是碰撞伤害的一半或相同，并应用全局伤害加成系数
        const baseDamage = (this._data['damage'] || this._atk || 0) * 0.8;
        const explosionDamage = Math.floor(baseDamage * GameData.damageScale);

        if (explosionDamage <= 0) return;

        // 爆炸范围（可配置，默认100像素）
        const explosionRange = this._data['explosionRange'] || 100;

        // 获取所有敌人
        const enemies = this.node.parent.children.filter(node => {
            const unit = node.getComponent('MonsterController');
            if (!unit) return false;
            return (unit as any).camp !== heroCamp;
        });

        let hitCount = 0; // 记录击中敌人数量
        const cx = this.node.position.x;
        const cy = this.node.position.y;

        // 圆形范围判定：在爆炸范围内则命中
        enemies.forEach(enemy => {
            const dx = enemy.position.x - cx;
            const dy = enemy.position.y - cy;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= explosionRange) {
                hitCount++;
                const enemyUnit = enemy.getComponent('MonsterController');
                if (enemyUnit) {
                    const skillEffectData = {
                        atk: explosionDamage,
                        camp: heroCamp,
                        id: this._data['id'] || this._data['skillId'],
                        skillId: this._data['id'] || this._data['skillId'],
                        color: '#ff6600' // 爆炸伤害使用橙色显示
                    };
                    (enemyUnit as any).takeskill(skillEffectData);
                }
            }
        });
    }

    /**
     * 初始化精灵图，支持不同类型单位
     * @param unitState
     */
    initSprite(unitState: string, atlas?: number) {

        if (!this.node || !this._data) {
            console.error('[SkillEffectController][initSprite] 节点为空 或 数据为空');
            return;
        }
        const nodeSprite = this.node.getChildByName('Sprite');
        if (!nodeSprite) {
            console.error('[SkillEffectController][initSprite] 技能效果节点缺少 Sprite 子节点', this.node?.name, this._data);
            return;
        }

        const skillId = this._data['id'] || this._data['skillId'];
        if (skillId === undefined || skillId === null) {
            console.error('[SkillEffectController][initSprite] 技能ID无效', this._data);
            return;
        }

        const path = SDM.getSkillPathById(Number(skillId), unitState);
        const config = SDM.getSkillSpriteConfig(Number(skillId), unitState);

        const spriteComponent = nodeSprite.getComponent(Sprite);
        if (!spriteComponent) {
            console.error('[SkillEffectController][initSprite] Sprite组件为空');
            return;
        }

        const resolveContentSize = (frame?: any) => {
            const itemW = Number(config?.item_width ?? 0);
            const itemH = Number(config?.item_height ?? 0);
            const frameW = Number(frame?.width ?? 0);
            const frameH = Number(frame?.height ?? 0);
            const cfgW = Number(config?.width ?? 0);
            const cfgH = Number(config?.height ?? 0);

            const width = itemW || frameW || cfgW || 40;
            const height = itemH || frameH || cfgH || 40;
            return { width, height };
        };

        // 先重置可见状态，避免对象池复用时展示旧图
        spriteComponent.spriteFrame = null;
        spriteComponent.color = Color.WHITE;
        const uiTransform = nodeSprite.getComponent(UITransform);
        if (uiTransform) {
            uiTransform.setContentSize(0, 0);
        }
        this.syncSpriteCollider(nodeSprite, 0, 0);
        if (config && config.scale) {
            nodeSprite.setScale(new Vec3(...config.scale));
        } else {
            nodeSprite.setScale(1, 1, 1);
        }

        // 新请求代次：旧回调全部作废
        const requestMode = atlas === 0 ? 'single' : 'atlas';
        const requestKey = `${skillId}:${unitState}:${requestMode}:${path}`;
        const requestToken = ++this._spriteLoadToken;
        this._spriteLoadKey = requestKey;

        if (atlas === 0) {
            loadResSingleAsset(path, (asset) => {
                if (!this.node || !this.node.isValid) {
                    return;
                }
                if (requestToken !== this._spriteLoadToken || this._spriteLoadKey !== requestKey) {
                    return;
                }

                const currentSpriteNode = this.node.getChildByName('Sprite');
                if (!currentSpriteNode || !currentSpriteNode.isValid) {
                    return;
                }
                const currentSprite = currentSpriteNode.getComponent(Sprite);
                if (!currentSprite) {
                    return;
                }

                if (!asset) {
                    return;
                }

                currentSprite.spriteFrame = asset as any;
                currentSprite.color = Color.WHITE;
                const currentUITransform = currentSpriteNode.getComponent(UITransform);
                if (currentUITransform) {
                    const size = resolveContentSize(asset);
                    currentUITransform.setContentSize(size.width, size.height);
                    this.syncSpriteCollider(currentSpriteNode, size.width, size.height);
                }
                if (config && config.scale) {
                    currentSpriteNode.setScale(new Vec3(...config.scale));
                } else {
                    currentSpriteNode.setScale(1, 1, 1);
                }
            });
            return;
        }

        loadResAsset(path, config, (asset) => {
            if (!this.node || !this.node.isValid) {
                return;
            }
            if (requestToken !== this._spriteLoadToken || this._spriteLoadKey !== requestKey) {
                return;
            }

            const currentSpriteNode = this.node.getChildByName('Sprite');
            if (!currentSpriteNode || !currentSpriteNode.isValid) {
                return;
            }
            const currentSprite = currentSpriteNode.getComponent(Sprite);
            if (!currentSprite) {
                return;
            }

            if (!asset) {
                return;
            }

            const spriteFrames = Array.isArray(asset) ? asset : [asset];
            if (spriteFrames.length === 0) {
                return;
            }

            currentSprite.spriteFrame = spriteFrames[0] as any;
            currentSprite.color = Color.WHITE;

            if (config && config.scale) {
                currentSpriteNode.setScale(new Vec3(...config.scale));
            } else {
                currentSpriteNode.setScale(1, 1, 1);
            }

            const currentUITransform = currentSpriteNode.getComponent(UITransform);
            if (currentUITransform) {
                const size = resolveContentSize(spriteFrames[0]);
                currentUITransform.setContentSize(size.width, size.height);
                this.syncSpriteCollider(currentSpriteNode, size.width, size.height);
            }

            // 计算并缓存单帧显示尺寸
            try {
                const itemW = Number(config?.item_width ?? 0);
                const itemH = Number(config?.item_height ?? 0);
                const baseW = itemW || (currentSprite.spriteFrame ? currentSprite.spriteFrame.width : 0) || 64;
                const baseH = itemH || (currentSprite.spriteFrame ? currentSprite.spriteFrame.height : 0) || 64;
                const sx = currentSpriteNode.scale.x || 1;
                const sy = currentSpriteNode.scale.y || 1;
                this._displayW = baseW * sx;
                this._displayH = baseH * sy;
            } catch (error) {
                console.warn('[SkillEffectController][initSprite] cache display size failed:', error);
            }

            this.actionInterTime = 1 / spriteFrames.length;
            this.spriteFrames = spriteFrames as any[];
        });
    }

    /**
     * 开始激光伤害处理
     * @param range 激光长度
     * @param width 激光宽度
     */
    private startLaserDamage(range: number, width: number) {
        const damageSpeed = this._data['damageSpeed'] || 2; // 每秒伤害次数
        const damageInterval = 1 / damageSpeed; // 伤害间隔
        let damageTimer = 0;

        // 创建伤害处理函数
        const processLaserDamage = (dt: number) => {
            if (!this.node || !this.node.isValid) {
                return;
            }

            // 检查游戏是否暂停，如果暂停则不处理伤害
            if (gameBus.paused) {
                return;
            }

            damageTimer += applySpeedScale(dt);
            if (damageTimer >= damageInterval) {
                this.dealLaserDamage(range, width);
                damageTimer = 0;
            }
        };

        // 注册伤害处理
        this.schedule(processLaserDamage, 0);
    }

    /**
     * 初始化激光效果
     */
    private initLaser() {
        if (!this.node) {
            console.error('[SkillEffectController][initLaser] 节点为空');
            return;
        }

        // 激光不移动
        this._isMove = false;

        // 获取激光参数
        const range = this._data['range'] || 800; // 激光长度
        const width = this._data['width'] || 34; // 激光宽度
        const color = this._data['color'] || '#64eaff'; // 激光颜色
        const duration = this._data['duration'] || 3; // 持续时间

        // 创建Graphics组件用于绘制激光
        let graphics = this.node.getComponent(Graphics);
        if (!graphics) {
            graphics = this.node.addComponent(Graphics);
        }

        // 绘制激光
        this.drawLaser(graphics, range, width, color);

        // 开始激光伤害处理
        this.startLaserDamage(range, width);

        // 设置激光持续时间 - 使用applySpeedScale确保跟随游戏速度
        let durationTimer = 0;
        const processLaserDuration = (dt: number) => {
            if (!this.node || !this.node.isValid) {
                return;
            }

            // 检查游戏是否暂停，如果暂停则不计算时间
            if (gameBus.paused) {
                return;
            }

            durationTimer += applySpeedScale(dt);
            if (durationTimer >= duration) {
                // 调用激光结束回调
                if (this._data['onLaserEnd']) {
                    this._data['onLaserEnd']();
                }
                this.recycleSelf();
            }
        };

        // 注册激光持续时间处理
        this.schedule(processLaserDuration, 0);
    }

    /**
     * 绘制激光
     * @param graphics Graphics组件
     * @param range 激光长度
     * @param width 激光宽度
     * @param color 激光颜色
     */
    private drawLaser(graphics: Graphics, range: number, width: number, color: string) {
        graphics.clear();

        const strokeBeam = (lineWidth: number, hex: string, alpha: number, start = 0, end = range) => {
            const c = new Color().fromHEX(hex || '#64eaff');
            c.a = alpha;
            graphics.lineWidth = lineWidth;
            graphics.strokeColor = c;
            graphics.moveTo(start, 0);
            graphics.lineTo(end, 0);
            graphics.stroke();
        };

        strokeBeam(width * 2.4, '#291056', 70);
        strokeBeam(width * 1.65, '#6f36ff', 115);
        strokeBeam(width * 1.05, color || '#64eaff', 210);
        strokeBeam(width * 0.42, '#ffffff', 245);

        const headLength = Math.min(72, range);
        strokeBeam(width * 1.35, '#8d4dff', 170, 0, headLength);
        strokeBeam(width * 1.05, '#64eaff', 190, Math.max(0, range - headLength), range);
        strokeBeam(width * 0.24, '#ffffff', 255, 0, range);
    }

    /**
     * 检查敌人是否在激光范围内
     * @param enemy 敌人节点
     * @param range 激光长度
     * @param width 激光宽度
     * @returns 是否在范围内
     */
    private isEnemyInLaserRange(enemy: any, range: number, width: number): boolean {
        if (!this.node || !enemy) return false;

        // 获取激光的世界坐标和角度
        const laserWorldPos = this.node.getWorldPosition();
        const enemyWorldPos = enemy.getWorldPosition();
        const laserAngle = this.node.angle * Math.PI / 180; // 转换为弧度

        // 计算敌人相对于激光的位置
        const relativeX = enemyWorldPos.x - laserWorldPos.x;
        const relativeY = enemyWorldPos.y - laserWorldPos.y;

        // 将相对坐标转换到激光的局部坐标系
        const cosA = Math.cos(laserAngle);
        const sinA = Math.sin(laserAngle);

        const localX = relativeX * cosA + relativeY * sinA;
        const localY = -relativeX * sinA + relativeY * cosA;

        // 检查是否在激光范围内
        const halfWidth = width / 2;
        const inRange = localX >= 0 && localX <= range && Math.abs(localY) <= halfWidth;
        return inRange;
    }

    /**
     * 处理激光伤害
     * @param range 激光长度
     * @param width 激光宽度
     */
    private dealLaserDamage(range: number, width: number) {
        if (!this.node || !this.node.isValid) return;

        const heroCamp = this._camp;
        // 应用全局伤害加成系数
        const damage = Math.round(this._atk * GameData.damageScale);

        // 获取所有敌人
        const enemies = this.node.parent.children.filter(node => {
            const unit = node.getComponent('MonsterController');
            if (!unit) return false;
            return (unit as any).camp !== heroCamp;
        });

        let hitCount = 0; // 记录击中敌人数量

        // 检查每个敌人是否在激光范围内
        enemies.forEach(enemy => {
            if (this.isEnemyInLaserRange(enemy, range, width)) {
                hitCount++;
                // 对敌人造成伤害
                const enemyUnit = enemy.getComponent('MonsterController');
                if (enemyUnit) {
                    // 创建技能效果数据，确保能正确触发死亡事件和经验获取
                    const skillEffectData = {
                        atk: damage,
                        camp: heroCamp,
                        id: this._data['id'] || this._data['skillId'],
                        skillId: this._data['id'] || this._data['skillId'],
                        // 添加颜色信息用于伤害显示
                        color: this._data['color'] || '#64eaff'
                    };

                    // 直接调用takeskill方法，确保能正确触发死亡事件
                    (enemyUnit as any).takeskill(skillEffectData);

                    // 死亡判定由takeskill方法统一处理，这里不需要重复处理
                }
            }
        });
    }

    /**
     * 播放精灵图
     * @param dt
     */
    playSprite(dt: number) {
        if (!this.node) return;
        // 检查游戏是否暂停，如果暂停则不播放动画
        if (gameBus.paused) {
            return;
        }

        if (this.spriteFrames.length > 0) {
            if (this.interTime > this.actionInterTime) {
                if (this.curSpriteIndex < this.spriteFrames.length - 1) {
                    this.curSpriteIndex++;
                } else {
                    this.curSpriteIndex = 0;
                }
                this.interTime = 0;
            } else {
                this.interTime += applySpeedScale(dt);
            }
            if (this.node && this.node.getChildByName('Sprite') && this.spriteFrames[this.curSpriteIndex]) {
                const spriteNode = this.node.getChildByName('Sprite');
                const spriteComponent = spriteNode.getComponent(Sprite);
                if (spriteComponent) {
                    spriteComponent.spriteFrame = this.spriteFrames[this.curSpriteIndex];
                }
            }
        }
    }

    /**
     *
     * @param deltaTime
     */
    update(deltaTime: number) {
        // 动画播放不受暂停影响，但移动和销毁逻辑受暂停影响
        if (this._data && this.node) {
            // 播放帧动画（不受暂停影响）
            this.playSprite(deltaTime);

            // 移动和销毁逻辑受暂停影响
            if (!gameBus.paused) {
                if (this._isMove) {
                    const mv = (this._data['moveSpeed'] || 0);
                    if (mv > 0) {
                        const angleInRadians = (this._data['scatterAngle'] * Math.PI) / 180;
                        // 计算x和y方向上的速度分量
                        const velocityX = Math.cos(angleInRadians) * mv * applySpeedScale(deltaTime);
                        const velocityY = Math.sin(angleInRadians) * mv * applySpeedScale(deltaTime);
                        // 更新节点位置
                        this.node.position = new Vec3(
                            this.node.position.x + velocityX,
                            this.node.position.y + velocityY,
                            this.node.position.z
                        );
                    }
                    // 超出可视范围自动回收（使用局部坐标，更稳健）
                    const px = this.node.position.x;
                    const py = this.node.position.y;
                    if (Math.abs(px) > 4000 || Math.abs(py) > 4000) {
                        this.recycleSelf();
                    }
                }
            }

            // 设置层级（不受暂停影响）
            this.node.setSiblingIndex(999998);
        }
    }

    /**
     * 启动智能销毁定时器，考虑暂停状态
     * @param duration 持续时间
     */
    private startSmartDestroyTimer(duration: number) {
        let destroyTimer = 0;

        const processDestroy = (dt: number) => {
            if (!this.node || !this.node.isValid) {
                return;
            }

            // 检查游戏是否暂停，如果暂停则不计算时间
            if (gameBus.paused) {
                return;
            }

            // 累计时间，考虑游戏速度
            destroyTimer += applySpeedScale(dt);

            // 达到持续时间后销毁
            if (destroyTimer >= duration) {
                this.recycleSelf();
            }
        };

        // 注册销毁处理
        this.schedule(processDestroy, 0);
    }

    static _pool: ObjectPool<SkillEffectController> = null;
    static registerPool(createFunc: () => SkillEffectController, maxSize = 100) {
        this._pool = new ObjectPool<SkillEffectController>(createFunc, maxSize);
    }
    static getFromPool(): SkillEffectController {
        if (!this._pool) throw new Error('SkillEffectController pool not registered');
        return this._pool.get();
    }
    static putToPool(obj: SkillEffectController) {
        if (this._pool) this._pool.put(obj);
    }
    // 兼容SkillManager调用
    static recycleToPool(obj: SkillEffectController) {
        this.putToPool(obj);
    }
}
