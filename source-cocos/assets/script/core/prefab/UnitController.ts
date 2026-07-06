import {
    _decorator,
    Collider2D,
    Color,
    Component,
    Contact2DType,
    director,
    instantiate,
    IPhysics2DContact,
    Label,
    Node,
    Prefab,
    Sprite,
    Vec3,
    Animation,
    UITransform,
    SpriteFrame,
    tween,
    Tween,
} from 'cc';
import { loadResSingleAsset, createStripFrames } from '../../../utils/utils';
import { applySpeedScale, GameData } from '../../../utils/data/config/manager/GameDataManager';
import { UnitBase } from '../../core/UnitBase';
import { DamageController } from '../../prefab/DamageController';
import { IUnit } from '../IUnit';
import { SkillEffectController } from 'db://assets/utils/skill/controller/SkillEffectController';
import { gameBus } from '../../../utils/signal/GameBus';
import { EDM } from '../../../utils/data/env/ConfigManager';
import { safeDisablePhysics2D, safeRestorePhysics2D } from '../../../utils/physics/SafePhysics2D';

import { HDM } from 'db://assets/utils/data/config/hero/HeroDataManager';
import { MDM } from 'db://assets/utils/data/config/monster/MonsterDataManager';
const { ccclass, property } = _decorator;
const HERO_ANIMATION_TIME_SCALE = 2;
const HERO_SPRITE_DISPLAY_SIZE = 128;

@ccclass('UnitController')
export class UnitController extends UnitBase {
    @property(Prefab)
    damagePrefab: Prefab; // 伤害预制体
    @property(Prefab)
    skillEffectPrefab: Prefab; // 技能特效预制体

    maxHp: number = this.hp; // 当前血量
    color: string = null;

    target: Node = null; // 当前目标
    _attackTimer: number = 0; // 攻击计时器
    _attackInterval: number = 0; // 攻击间隔
    otherColliderId: string = ''; // 记录碰撞体id，避免重复碰撞回调
    spriteFrames: SpriteFrame[] = []; // 精灵帧集合
    curSpriteIndex: number = 0; // 当前精灵帧
    interTime: number = 1; // 帧间隔
    actionInterTime: number = 0; // 单个动作帧间隔
    private _currentSpriteState: string = '';
    private _spriteBaseScale: Vec3 = new Vec3(1, 1, 1);
    private _spriteBasePosition: Vec3 = new Vec3(0, 0, 0);
    private _hasSpriteBaseScale: boolean = false;
    private _hasSpriteBasePosition: boolean = false;
    private _spriteJuiceLock: number = 0;
    private _loopTime: number = 0;
    private _momentarySpriteToken: number = 0;
    private _isDead: boolean = false;
    private _physicsDisabled: boolean = false;

    // 支持多种单位控制器类型
    controllerTypes = [
        'UnitController',
        'PetController',
        'HeroController',
        'DemonController',
        'MonsterController',
    ];

    // 定时器id
    private _timeoutIds: number[] = [];
    private _intervalIds: number[] = [];
    // schedule 句柄
    private _scheduleCallbacks: Array<{ cb: Function, target?: any }> = [];
    // tween 句柄
    private _tweens: any[] = [];

    async init(data: IUnit, isStand: boolean = false) {
        super.init(data);
        this.maxHp = data.hp;
        this.color = data.color ?? '#ffffff';
        this._currentSpriteState = '';
        this._hasSpriteBaseScale = false;
        this._hasSpriteBasePosition = false;
        this._spriteJuiceLock = 0;
        this._loopTime = 0;
        this._momentarySpriteToken = 0;
        this._isDead = false;
        this._physicsDisabled = false;
        safeRestorePhysics2D(this.node, true);

        if (isStand) this.canMove = false;

        this.initLabel();
        this.type === 'hero' ? this.initSprite('idle', true) : this.initSprite('walk', false);
        // 添加物理碰撞
        this.initCollider();
        // console.log('[UnitController][init] ', this, this.node, data);
    }

    // 包装setTimeout
    setSafeTimeout(fn: Function, delay: number) {
        const id = setTimeout(() => {
            fn();
            this._timeoutIds = this._timeoutIds.filter(tid => tid !== id);
        }, delay);
        this._timeoutIds.push(id);
        return id;
    }

    // 包装setInterval
    setSafeInterval(fn: Function, delay: number) {
        const id = setInterval(fn, delay);
        this._intervalIds.push(id);
        return id;
    }

    /**
     * 包装 scheduleOnce，自动管理回调，onDestroy 时统一 unschedule
     */
    setSafeScheduleOnce(cb: Function, delay: number) {
        this.scheduleOnce(cb, delay);
        this._scheduleCallbacks.push({ cb });
    }

    /**
     * 包装 schedule，自动管理回调，onDestroy 时统一 unschedule
     */
    setSafeSchedule(cb: Function, interval: number, repeat?: number, delay?: number) {
        this.schedule(cb, interval, repeat, delay);
        this._scheduleCallbacks.push({ cb });
    }

    /**
     * 包装 tween，onDestroy 时统一 stop
     */
    addSafeTween(tweenInst: any) {
        this._tweens.push(tweenInst);
        return tweenInst;
    }

    /**
     * 生成精灵图，支持不同类型单位
     * @param unitState 
     */
    initSprite(unitState: string, isHero: boolean = false) {
        if (!this.node || !this.node.isValid) return;
        const spriteState = this.normalizeSpriteState(unitState);
        // 处理type，截取下划线后部分
        let typeForPath = this.type;
        if (typeof typeForPath === 'string' && typeForPath.includes('_')) {
            typeForPath = typeForPath.split('_')[1];
        }

        let path = `textures/${typeForPath ?? 'monster'}/${this.url}/${spriteState ?? 'walk'}/spriteFrame`;
        switch (this.type) {
            case 'hero':
                path = HDM.getHeroPathById(Number(this.id), spriteState);
                break;
            case 'monster':
                path = MDM.getMonsterPathById(Number(this.id), spriteState);
                break;
            default:
                break;
        }

        const applyFrames = (frames: SpriteFrame[] | null, state: string, scale?: number[]) => {
            if (!frames || frames.length === 0) {
                return;
            }

            if (!this.node || !this.node.isValid || !this.node.parent || !this.node.parent.isValid) {
                console.warn('[UnitController][initSprite] Node is invalid when loading sprite asset completed');
                return;
            }

            try {
                const nodeSprite = this.node.getChildByName('Sprite');
                if (!nodeSprite || !nodeSprite.isValid) {
                    console.warn('[UnitController][initSprite] Sprite node is invalid');
                    return;
                }

                const spriteComp = nodeSprite.getComponent(Sprite);
                if (!spriteComp || !spriteComp.isValid) {
                    console.warn('[UnitController][initSprite] Sprite component is invalid');
                    return;
                }

                spriteComp.spriteFrame = frames[0];
                spriteComp.sizeMode = Sprite.SizeMode.CUSTOM;
                if (this.type === 'hero') {
                    nodeSprite.getComponent(UITransform)?.setContentSize(HERO_SPRITE_DISPLAY_SIZE, HERO_SPRITE_DISPLAY_SIZE);
                }

                if (scale && scale.length === 3) {
                    nodeSprite.setScale(new Vec3(...scale));
                    this._spriteBaseScale = nodeSprite.scale.clone();
                    this._hasSpriteBaseScale = true;
                } else if (!this._hasSpriteBaseScale) {
                    this._spriteBaseScale = nodeSprite.scale.clone();
                    this._hasSpriteBaseScale = true;
                } else {
                    nodeSprite.setScale(this._spriteBaseScale);
                }
                if (!this._hasSpriteBasePosition) {
                    this._spriteBasePosition = nodeSprite.position.clone();
                    this._hasSpriteBasePosition = true;
                } else {
                    nodeSprite.setPosition(this._spriteBasePosition);
                }

                this.actionInterTime = this.getSpriteFrameInterval(state, frames.length);
                this.spriteFrames = frames;
                this.curSpriteIndex = 0;
                this.interTime = 0;
                this._currentSpriteState = state;
            } catch (error) {
                console.error('[UnitController][initSprite] Error setting sprite:', error);
            }
        };

        if (this.type === 'hero') {
            const loadHeroFrames = (assetPath: string, state: string, allowFallback: boolean) => {
                loadResSingleAsset(assetPath, (spriteFrame) => {
                    if (!spriteFrame) {
                        console.warn(`[UnitController][initSprite] Hero sprite asset missing: ${assetPath}`);
                        if (allowFallback && state !== 'idle') {
                            const fallbackPath = HDM.getHeroPathById(Number(this.id), 'idle');
                            if (fallbackPath && fallbackPath !== assetPath) {
                                loadHeroFrames(fallbackPath, 'idle', false);
                            }
                        }
                        return;
                    }

                    const frames = createStripFrames(spriteFrame, `UnitController:${this.id}:${state}`, assetPath);
                    if (!frames || frames.length === 0) {
                        console.warn(`[UnitController][initSprite] Hero strip split failed: ${assetPath}`);
                        if (allowFallback && state !== 'idle') {
                            const fallbackPath = HDM.getHeroPathById(Number(this.id), 'idle');
                            if (fallbackPath && fallbackPath !== assetPath) {
                                loadHeroFrames(fallbackPath, 'idle', false);
                            }
                        }
                        return;
                    }

                    applyFrames(frames, state);
                });
            };

            loadHeroFrames(path, spriteState, true);
            return;
        }

        if (this.type === 'monster') {
            MDM.getMonsterAnimationFrames(Number(this.id), spriteState, (frames) => {
                if (!frames || frames.length === 0) {
                    console.warn(`[UnitController][initSprite] Monster strip split failed: ${path}`);
                    return;
                }

                applyFrames(frames, spriteState);
            });
            return;
        }
    }

    protected normalizeSpriteState(unitState: string): string {
        const state = (unitState || 'walk').toLowerCase();
        return state === 'idel' ? 'idle' : state;
    }

    private getSpriteFrameInterval(state: string, frameCount: number): number {
        const normalized = this.normalizeSpriteState(state);
        const fps = normalized === 'attack' || normalized === 'skill' || normalized === 'release'
            ? 14
            : this.type === 'monster'
                ? 11
                : 12;
        const frameInterval = 1 / Math.max(6, Math.min(18, frameCount >= 12 ? fps : 8));
        return this.type === 'hero' ? frameInterval * HERO_ANIMATION_TIME_SCALE : frameInterval;
    }

    protected playMomentarySprite(state: string, fallbackState?: string, durationMs: number = 520, restartIfActive: boolean = true): void {
        const normalized = this.normalizeSpriteState(state);
        const fallback = this.normalizeSpriteState(fallbackState || (this.type === 'hero' ? 'idle' : 'walk'));
        const token = ++this._momentarySpriteToken;
        if (restartIfActive || this._currentSpriteState !== normalized) {
            this.initSprite(normalized, this.type === 'hero');
        }
        const fallbackDelayMs = this.type === 'hero' ? durationMs * HERO_ANIMATION_TIME_SCALE : durationMs;
        this.setSafeTimeout(() => {
            if (!this.node || !this.node.isValid) return;
            if (token !== this._momentarySpriteToken) return;
            if (this._currentSpriteState === normalized) {
                this.initSprite(fallback, this.type === 'hero');
            }
        }, fallbackDelayMs);
    }

    protected playActionJuice(kind: 'hit' | 'attack' | 'skill' = 'hit'): void {
        if (!this.node || !this.node.isValid) return;
        const nodeSprite = this.node.getChildByName('Sprite');
        if (!nodeSprite || !nodeSprite.isValid) return;

        const isHero = this.type === 'hero';
        const base = this._spriteBaseScale || nodeSprite.scale.clone();
        const direction = kind === 'attack' ? 1 : -1;
        const horizontalMove = isHero ? 0 : 5;
        const reboundMove = isHero ? 0 : 2;
        const lift = isHero ? (kind === 'skill' ? 3 : 2) : (kind === 'skill' ? 8 : 4);
        const stretch = isHero
            ? new Vec3(base.x, base.y * (kind === 'hit' ? 0.98 : 1.03), base.z)
            : (kind === 'hit'
                ? new Vec3(base.x * 1.18, base.y * 0.84, base.z)
                : new Vec3(base.x * 1.10, base.y * 1.05, base.z));
        const reboundScale = isHero
            ? new Vec3(base.x, base.y * 1.01, base.z)
            : new Vec3(base.x * 0.94, base.y * 1.08, base.z);

        this._spriteJuiceLock = kind === 'hit' ? 0.18 : 0.28;
        Tween.stopAllByTarget(nodeSprite);
        const startPosition = this._hasSpriteBasePosition ? this._spriteBasePosition.clone() : nodeSprite.position.clone();
        nodeSprite.setScale(base);
        nodeSprite.setPosition(startPosition);

        const anim = tween(nodeSprite)
            .to(0.06, {
                scale: stretch,
                position: new Vec3(startPosition.x + direction * horizontalMove, startPosition.y + lift, startPosition.z),
            }, { easing: 'quadOut' })
            .to(0.09, {
                scale: reboundScale,
                position: new Vec3(startPosition.x - direction * reboundMove, startPosition.y + (isHero ? 0 : -2), startPosition.z),
            }, { easing: 'backOut' })
            .to(0.08, {
                scale: base,
                position: startPosition,
            }, { easing: 'sineOut' });
        this.addSafeTween(anim);
        anim.start();
    }

    initLabel() {
        if (!this.node) return;
        let nodeLabel = this.node.getChildByName('Label');
        if (nodeLabel) {
            nodeLabel.active = true;

            // 获取本地化名称
            let displayName = this.unitName;
            if (this.type && this.type.includes('monster')) {
                const localizedName = EDM.getText(`monster.${this.id}.name`);
                if (localizedName && localizedName.trim() !== '') {
                    displayName = localizedName;
                }
            } else if (this.type && this.type.includes('hero')) {
                const heroConfig = HDM.getHeroById(Number(this.id));
                if (heroConfig?.name) {
                    displayName = heroConfig.name;
                }
            }

            nodeLabel.getComponent(Label).string = displayName;
        }
    }

    initCollider() {
        if (!this.node) return;
        const spriteNode = this.node.getChildByName('Sprite');
        if (!spriteNode) return;
        let collider = spriteNode.getComponent(Collider2D);
        if (collider) {
            collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            // collider.on(Contact2DType.END_CONTACT, this.onEndContact, this);
            // collider.on(Contact2DType.POST_SOLVE, this.onPostSolve, this);
        }
    }

    protected disablePhysicsOnce(): void {
        if (this._physicsDisabled) return;
        safeDisablePhysics2D(this.node, true);
        this._physicsDisabled = true;
    }

    // 查找目标单位（只攻击非本阵营单位）
    findTarget() {
        if (!this.node) return;
        const parent = this.node.parent;
        if (!parent) {
            this.target = null;
            return;
        }

        const enemies = parent.children.filter(n => {
            if (n === this.node) return false;
            if (!n.activeInHierarchy) return false; // 只选激活的节点
            // 动态判断是否为任意单位控制器
            let unit = null;
            for (const type of this.controllerTypes) {
                unit = n.getComponent(type);
                if (unit) break;
            }
            if (!unit) return false;
            // 只攻击非本阵营单位
            return unit.camp !== this.camp;
        });
        if (enemies.length > 0) {
            let minDist = Infinity;
            let nearest = null;
            for (const m of enemies) {
                const dist = Vec3.distance(this.node.position, m.position);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = m;
                }
            }
            this.target = nearest;
        } else {
            this.target = null;
        }
    }

    /**
     * 移动到目标（英雄canMove=false时不移动，原地释放技能）
     */
    moveToTarget(deltaTime: number) {
        if (!this.node) return;
        if (!this.canMove) return;

        // 其它单位移动逻辑
        if (!this.target) return;
        const dir = new Vec3(
            this.target.position.x - this.node.position.x,
            this.target.position.y - this.node.position.y,
            0
        );
        const dist = Vec3.len(dir);
        if (dist > (this.attackRange || 50)) {
            Vec3.normalize(dir, dir);
            const moveStep = this.moveSpeed * applySpeedScale(deltaTime);
            this.node.position = new Vec3(
                this.node.position.x + dir.x * moveStep,
                this.node.position.y + dir.y * moveStep,
                this.node.position.z
            );
        } else {
            this.attack(deltaTime);
        }
    }


    /**
     * 普通攻击
     * 攻击方法：根据不同单位类型读取不同路径下的攻击精灵图
     */
    attack(deltaTime: number) {
        if (!this.node) return;
        if (!this.canAttack) return;
        if (!this.target || !this.target.isValid || !this.target.activeInHierarchy) {
            this.initSprite('idle');
            return;
        }
        this._attackTimer += applySpeedScale(deltaTime); // 攻击计时器  
        this._attackInterval = 1 / (this.attackSpeed || 1); // 攻击间隔
        const dist = Vec3.distance(this.node.position, this.target.position); // 距离
        if (dist <= (this.attackRange || 50)) { // 距离小于攻击距离则攻击
            if (this._attackTimer >= this._attackInterval) { // 攻击计时器大于攻击间隔则攻击
                this._attackTimer = 0; // 攻击计时器归零
                // 攻击动画、特效
                this.playMomentarySprite('attack', 'idle', 500);
                this.playActionJuice('attack');
                // 造成伤害
                let targetUnit = null;
                for (const type of this.controllerTypes) {
                    if (!this.target || !this.target.isValid || !this.target.activeInHierarchy) break;
                    try {
                        targetUnit = this.target.getComponent(type);
                    } catch (e) {
                        targetUnit = null;
                        break;
                    }
                    if (targetUnit) break;
                }
                if (targetUnit) {
                    targetUnit.takeAttack(this);
                }
            }
        }
    }

    // 受到攻击
    takeAttack(attackUnit: any) {
        if (!this.node) return;
        // 阵营判定，防止同阵营伤害
        if (attackUnit.camp && attackUnit.camp === this.camp) return;

        if (attackUnit.atk) this.hp -= attackUnit.atk;
        this.playActionJuice('hit');

        // 找到目标单位的父节点，然后找到Sprite并高亮红色
        let nodeSprite = this.node.getChildByName('Sprite');
        if (
            this.node && this.node.isValid && this.node.activeInHierarchy &&
            nodeSprite && nodeSprite.isValid && nodeSprite.activeInHierarchy
        ) {
            let nss = nodeSprite.getComponent(Sprite);
            if (nss && nss.isValid) {
                try {
                    nss.color = new Color('#D64242');
                    this.setSafeTimeout(() => {
                        if (nss && nss.isValid) {
                            this.color ?
                                nss.color = new Color(this.color) :
                                nss.color = new Color('#ffffff');
                        }
                    }, 100);
                } catch (e) {
                    console.warn('[UnitController] [takeAttack] [nss] 获取Sprite失败', e);
                }
            }
        }
        // 弹出伤害数字，位置随机
        let damagePrefab = instantiate(this.damagePrefab);
        let pos = this.node.position;
        let rangeX = Math.random() * 60 - 30;
        let rangeY = Math.random() * 30 + 20;
        damagePrefab.getComponent(DamageController).init({ color: this.color || '#ffffff' }, attackUnit.atk);
        damagePrefab.setPosition(pos.x + rangeX, pos.y + rangeY, 0);
        this.node.parent.addChild(damagePrefab);
        // 死亡判定
        if (this.hp <= 0) {
            // console.log('[UnitController] 死亡判定', this._data);
            this.onDie();
        }
    }

    // 碰撞发生
    onBeginContact(
        selfCollider: Collider2D,
        otherCollider: Collider2D,
        contact: IPhysics2DContact | null
    ) {
        if (!this.node) return;
        // 只在两个碰撞体开始接触时被调用一次
        // 只处理伤害结算，不需要SkillEffectController主动调用
        if (this.otherColliderId === otherCollider.node['_id']) {
            return;
        } else {
            this.otherColliderId = otherCollider.node['_id'];
        }

        let skillEffectNode = otherCollider.node;
        let skillEffectCtrl = skillEffectNode.getComponent(SkillEffectController);
        if (!skillEffectCtrl && skillEffectNode.parent) {
            skillEffectCtrl = skillEffectNode.parent.getComponent(SkillEffectController);
        }
        if (!skillEffectCtrl) {
            console.warn('[UnitController] 未找到 SkillEffectController', skillEffectNode);
            return;
        }

        // 弹道技能不通过UnitController处理伤害，只通过SkillEffectController处理
        // 这样可以避免重复伤害，并且让SkillEffectController统一管理穿透逻辑
        const skillId = skillEffectCtrl._data?.['id'] || skillEffectCtrl._data?.['skillId'];
        if (skillId === 1001 || skillId === 1002 || skillId === 1003) {
            // 弹道技能，不在这里处理伤害
            return;
        }

        let skillEffectData = skillEffectCtrl._data;
        if (!skillEffectData) {
            console.warn('[UnitController] takeskill skillEffectData 为空', skillEffectData);
            return;
        }

        // 只有非弹道技能才在这里处理伤害
        this.takeskill(skillEffectData);

        // 死亡判定由takeskill方法统一处理，这里不需要重复处理
    }

    // 受到技能伤害
    takeskill(skillEffectData: any) {
        if (!this.node) return;
        // 阵营判定，防止同阵营伤害
        if ((skillEffectData as any).camp && (skillEffectData as any).camp === this.camp) {
            // console.log('[UnitController] 阵营相同，不结算伤害', (skillEffectData as any).camp, this.camp);
            return;
        }
        // console.log('[UnitController] takeskill', skillEffectData, '当前hp:', this.hp);
        let damage = 0;
        const atk = skillEffectData['damage'] ? skillEffectData['damage'] : skillEffectData['atk'] ?? 0;
        if (atk) {
            this.hp -= atk;
            damage = atk;
            this.playActionJuice('hit');
            // console.log('[UnitController] 受到伤害', atk, '剩余hp:', this.hp);
        } else if (skillEffectData['%dmg']) {
            damage = Math.floor(this.maxHp * skillEffectData['%dmg']);
            this.hp -= damage;
            this.playActionJuice('hit');
            // console.log('[UnitController] 受到百分比伤害', damage, '剩余hp:', this.hp);
        }

        // 高亮红色
        if (this.node) {
            let nodeSprite = this.node.getChildByName('Sprite');
            nodeSprite.getComponent(Sprite).color = new Color('#D64242');
            this.setSafeTimeout(() => {
                if (this.node) {
                    this.color ?
                        nodeSprite.getComponent(Sprite).color = new Color(this.color) :
                        nodeSprite.getComponent(Sprite).color = new Color('#ffffff');
                }
            }, 100);
            // 弹出伤害数字，位置随机
            let damagePrefab = instantiate(this.damagePrefab);
            let pos = this.node.position;
            let rangeX = Math.random() * 60 - 30;
            let rangeY = Math.random() * 30 + 20;
            damagePrefab.getComponent(DamageController).init({ color: skillEffectData.color || this.color || '#ffffff' }, damage);
            damagePrefab.setPosition(pos.x + rangeX, pos.y + rangeY, 0);
            if (this.node && this.node.parent) { // 防御
                this.node.parent.addChild(damagePrefab);
            }
        }
        // 死亡判定
        if (this.hp <= 0) {
            // console.log('[UnitController] 死亡判定', this._data);
            this.onDie();
        }
    }

    /**
     * 播放精灵图
     * @param dt 
     */
    playSprite(dt: number) {
        if (!this.node) return;
        const nodeSprite = this.node.getChildByName('Sprite');
        if (!nodeSprite || !nodeSprite.isValid) return;

        this.updateSpriteLoopMotion(dt, nodeSprite);
        if (this.spriteFrames.length > 0) {
            if (this.interTime > this.actionInterTime) {
                if (this.curSpriteIndex < this.spriteFrames.length - 1) {
                    this.curSpriteIndex++;
                } else {
                    this.curSpriteIndex = 0;
                }
                this.interTime = 0;
            } else {
                this.interTime += dt * GameData.speedScale;
            }
            const sprite = nodeSprite.getComponent(Sprite);
            if (sprite && sprite.isValid) {
                sprite.spriteFrame = this.spriteFrames[this.curSpriteIndex];
            }
        }
    }

    private updateSpriteLoopMotion(dt: number, nodeSprite: Node): void {
        if (!this._hasSpriteBaseScale) return;
        if (this._spriteJuiceLock > 0) {
            this._spriteJuiceLock -= dt * GameData.speedScale;
            return;
        }
        const base = this._spriteBaseScale;
        if (this.type === 'hero') {
            nodeSprite.setScale(base);
            nodeSprite.setPosition(this._spriteBasePosition);
            return;
        }

        this._loopTime += dt * GameData.speedScale;
        const speed = 7.6;
        const pulse = Math.sin(this._loopTime * speed);
        const bob = Math.sin(this._loopTime * speed * 0.5);
        nodeSprite.setScale(
            base.x * (1 + pulse * 0.018),
            base.y * (1 - pulse * 0.012),
            base.z,
        );
        if (this.type === 'monster') {
            const basePosition = this._spriteBasePosition;
            nodeSprite.setPosition(basePosition.x, basePosition.y + bob * 1.8, basePosition.z);
        }
    }

    /**
     * 更新
     * @param dt 
     */
    update(dt: number) {
        if (!this.node) return;
        if (!gameBus.paused) {
            this.findTarget();
            this.moveToTarget(dt);
            // this.attack(dt);
            this.playSprite(dt);
        }
    }

    /**
     * 死亡处理，只触发死亡事件，对象池回收由GameController统一处理
     */
    public onDie(): void {
        if (!this.node || this._isDead) return;
        this._isDead = true;
        this.canMove = false;
        this.canAttack = false;
        this.disablePhysicsOnce();

        // 只触发死亡事件，不处理对象池回收
        this.node.emit('monster_die', true);
    }

    onDestroy() {
        this.disablePhysicsOnce();

        // 清理所有 setTimeout/setInterval
        this._timeoutIds.forEach(id => clearTimeout(id));
        this._intervalIds.forEach(id => clearInterval(id));
        this._timeoutIds = [];
        this._intervalIds = [];

        // 清理所有 schedule/scheduleOnce
        this._scheduleCallbacks.forEach(({ cb }) => {
            this.unschedule(cb);
        });
        this._scheduleCallbacks = [];

        // 解绑所有事件
        this.node && this.node.targetOff(this);

        // 停止所有 tween
        if (this._tweens && this._tweens.length > 0) {
            this._tweens.forEach(tw => {
                if (tw && tw.stop) tw.stop();
            });
            this._tweens = [];
        }

        // 停止所有 Animation 组件
        const anim = this.node?.getComponent(Animation);
        if (anim && anim.isValid) {
            anim.stop();
        }
    }
}
