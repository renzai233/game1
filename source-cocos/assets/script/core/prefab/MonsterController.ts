import { _decorator, Collider2D, IPhysics2DContact, Vec3, Node, Contact2DType } from 'cc';
import { UnitController } from './UnitController';
import { applySpeedScale } from '../../../utils/data/config/manager/GameDataManager';
import { WallController } from './WallController';
import { gameBus } from '../../../utils/signal/GameBus';
const { ccclass } = _decorator;

@ccclass('MonsterController')
export class MonsterController extends UnitController {
    public speed: number = 0; // 从父类继承，需要声明以供类型检查
    public rarity: string = 'NORMAL'; // 怪物稀有度

    private _wallNode: Node = null; // 城墙节点引用
    private _obstacleTarget: Node = null; // 障碍物目标（英雄）

    onLoad() {
        // 注册碰撞回调
        const collider = this.getComponent(Collider2D);
        if (collider) {
            collider.off(Contact2DType.BEGIN_CONTACT, this.onContactEnter, this);
            collider.off(Contact2DType.END_CONTACT, this.onContactLeave, this);
            collider.on(Contact2DType.BEGIN_CONTACT, this.onContactEnter, this);
            collider.on(Contact2DType.END_CONTACT, this.onContactLeave, this);
        }
    }

    async init(data: any, isStand: boolean = false) {
        if (!data) {
            console.error('[MonsterController][init] data is null');
            return;
        }
        
        if (!data.hp) {
            console.warn('[MonsterController][init] data.hp is null, using default value');
            data.hp = 100; // 使用默认值
        }
        
        this._obstacleTarget = null;
        this._wallNode = null;
        this.canMove = true;
        this.canAttack = true;
        this.hp = data.hp;
        this.maxHp = data.hp;
        this._attackTimer = 0;
        this._attackInterval = 0;
        this.target = null;
        this.spriteFrames = [];
        this.curSpriteIndex = 0;
        this.interTime = 1;
        this.actionInterTime = 0;
        // 重新初始化数据
        await super.init(data, isStand);
    }

    // 查找目标单位（只攻击非本阵营单位）
    findTarget() {
        if (this._wallNode && this._wallNode.isValid) {
            this.target = this._wallNode;
            return;
        }

        if (!this.node || !this.node.isValid) return;
        const parent = this.node.parent;
        if (!parent) {
            this.target = null;
            return;
        }

        // 查找并缓存城墙节点
        if (this.camp !== 'human') {
            const wallNode = parent.getChildByName('Wall');
            if (wallNode && wallNode.activeInHierarchy) {
                this.target = wallNode;
                this._wallNode = wallNode;
            }
        }
    }

    /**
     * 重写移动逻辑：始终向城墙方向（下方）移动
     */
    moveToTarget(deltaTime: number) {
        if(!this.canMove) return;
        // 如果有障碍物，则停止移动
        if (this._obstacleTarget && this._obstacleTarget.isValid) {
            this.canMove = false;
            return;
        }

        // 如果已到达城墙，则停止移动
        if (this._wallNode && this._wallNode.isValid) {
            // 假设城墙在底部，只比较y坐标
            // 留出攻击距离
            if (this.node.position.y <= this._wallNode.position.y + (this.attackRange || 60)) {
                this.canMove = false;
                return;
            }
        }
        // console.log('[MonsterController] [moveToTarget] wallNode', this._wallNode, 'moveSpeed', this.moveSpeed);

        // 检查速度值
        if (typeof this.moveSpeed !== 'number' || this.moveSpeed <= 0) {
            // speed不合法或为0，怪物不移动
            if (this.canMove) this.canMove = false;
            return;
        }

        this.canMove = true;
        const moveSpeed = applySpeedScale(this.moveSpeed * deltaTime);
        this.node.setPosition(this.node.position.x, this.node.position.y - moveSpeed, this.node.position.z);
    }

    /**
     * 普通攻击
     * 攻击方法：根据不同单位类型读取不同路径下的攻击精灵图
     */
    attack(deltaTime: number) {
        if(!this.canAttack) return;
        // 攻击目标优先级：英雄 > 城墙
        let finalTarget = this._obstacleTarget;
        let isAttackingWall = false;

        if (!finalTarget || !finalTarget.isValid) {
            // 如果没有英雄障碍物，并且已经停止移动（意味着到达了城墙）
            if (!this.canMove && this._wallNode && this._wallNode.isValid) {
                finalTarget = this._wallNode;
                isAttackingWall = true;
            }
        }

        if (!this.node || !this.node.isValid || !this.canAttack || !finalTarget || !finalTarget.isValid) {
            return;
        }

        this._attackTimer += applySpeedScale(deltaTime);
        // 如果目标是城墙，我们通过 isMoving 状态判断已在攻击范围内；否则检查距离
        const inRange = isAttackingWall || Vec3.distance(this.node.position, finalTarget.position) <= (this.attackRange || 60);

        if (inRange) {
            if (this._attackTimer >= this.attackSpeed) {
                this._attackTimer = 0;
                this.playMomentarySprite('attack', 'walk', 500);
                this.playActionJuice('attack');

                // 检查目标是城墙还是单位
                const wallCtrl = finalTarget.getComponent(WallController);
                if (wallCtrl) {
                    wallCtrl.takeDamage(this.atk);
                } else {
                    // 目标是单位（英雄）
                    let targetUnit = null;
                    for (const type of this.controllerTypes) {
                        try {
                            targetUnit = finalTarget.getComponent(type);
                            if (targetUnit && targetUnit.camp !== this.camp) break;
                            else targetUnit = null;
                        } catch (e) {
                            targetUnit = null;
                        }
                    }
                    if (targetUnit) {
                        targetUnit.takeAttack(this);
                    } else {
                        // 如果目标不是有效单位（可能已死亡），则清除障碍
                        this._obstacleTarget = null;
                    }
                }
            }
        }
    }

    /**
     * 碰撞进入回调
     */
    onContactEnter(event: IPhysics2DContact, self: Collider2D, other: Collider2D) {
        // 如果已经有障碍物目标，则不处理新的碰撞
        if (this._obstacleTarget && this._obstacleTarget.isValid) return;

        // 检查碰撞对象是否为敌方英雄
        let otherUnit = null;
        for (const type of this.controllerTypes) {
            otherUnit = other.node.getComponent(type);
            if (otherUnit && otherUnit.camp !== this.camp) break;
            else otherUnit = null;
        }

        if (otherUnit) {
            this._obstacleTarget = other.node;
        }
    }

    /**
     * 碰撞离开回调
     */
    onContactLeave(event: IPhysics2DContact, self: Collider2D, other: Collider2D) {
        if (this._obstacleTarget === other.node) {
            this._obstacleTarget = null;
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
            this.attack(dt); // attack现在只攻击障碍物
            this.playSprite(dt);
        }
    }

    /**
     * 死亡处理，只触发死亡事件，对象池回收由GameController统一处理
     */
    public onDie(): void {
        super.onDie();
    }

    onDestroy() {
        const collider = this.getComponent(Collider2D);
        if (collider) {
            collider.off(Contact2DType.BEGIN_CONTACT, this.onContactEnter, this);
            collider.off(Contact2DType.END_CONTACT, this.onContactLeave, this);
        }
        super.onDestroy(); // 调用父类的onDestroy
    }
}
