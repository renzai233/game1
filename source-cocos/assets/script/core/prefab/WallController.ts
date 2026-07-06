import { _decorator, Component, Label, Node, ProgressBar, RigidBody2D, Vec2, ERigidBody2DType, Sprite, SpriteFrame, resources, UITransform, Vec3, Color } from 'cc';
import { gameBus } from 'db://assets/utils/signal/GameBus';
import { IUnit } from '../IUnit';
import { GameData } from 'db://assets/utils/data/config/manager/GameDataManager';

const { ccclass, property } = _decorator;

@ccclass('WallController')
export class WallController extends Component {
    @property(Label)
    hpLabel: Label = null;

    @property(ProgressBar)
    hpBar: ProgressBar = null;

    @property(Sprite)
    wallSprite: Sprite = null;

    private _maxHp: number = 1000; // 基础血量
    private _currentHp: number = 1000;
    private _defense: number = 0; // 防御力
    private _hpRecovery: number = 0; // 每秒回血
    private _heroFieldUpdateHandler: (heroes: IUnit[]) => void;

    private _wallSprites: SpriteFrame[] = [];
    private _spriteLoaded = false;

    onLoad() {
        // 强制同步全局状态，确保每次开始都是满血
        this._currentHp = GameData.hp;
        this._maxHp = GameData.maxHp;

        this._heroFieldUpdateHandler = this.updateWallStats.bind(this);
        gameBus.on('hero-field-updated', this._heroFieldUpdateHandler);
        this.updateAndEmitHp();
    }

    // 按血量百分比切换城墙图片
    private updateWallSprite() {
        // 直接获取Bg节点的Sprite组件
        const wallBg = this.node.getChildByName('Bg');
        const bgSprite = wallBg?.getComponent(Sprite);
        
        if (!bgSprite || !this._spriteLoaded) return;
        
        const percent = this._currentHp / this._maxHp;
        if (percent > 0.6) {
            bgSprite.spriteFrame = this._wallSprites[0]; // 正常
        } else if (percent > 0.3) {
            bgSprite.spriteFrame = this._wallSprites[1]; // 半血
        } else {
            bgSprite.spriteFrame = this._wallSprites[2]; // 濒危
        }
        
        console.log('[WallController] updateWallSprite', {
            percent: percent,
            spriteFrame: bgSprite.spriteFrame
        });
    }

    // 根据上场英雄列表更新城墙属性
    updateWallStats(heroesOnField: IUnit[]) {
        // 必须先重置，再根据当前在场英雄重新计算，否则会无限累加
        // this._maxHp = 1000;
        // this._currentHp = 1000;
        // this._defense = 0;
        // this._hpRecovery = 0;

        // 聚合所有英雄的属性加成
        for (const heroData of heroesOnField) {
            const heroHp = heroData.hp || 0;
            this._maxHp += heroHp;
            this._currentHp += heroHp;
            this._defense += heroData.defense || 0; // 假设IUnit有defense属性
            this._hpRecovery += heroData.hpRecover || 0; // 假设IUnit有hpRecover属性
        }

        this.updateAndEmitHp();
    }

    // 受到伤害
    takeDamage(damage: number) {
        // console.log('[WallController] takeDamage', this._currentHp, this._maxHp);

        const actualDamage = Math.max(1, damage - this._defense);
        this._currentHp -= actualDamage;
        this.updateAndEmitHp();
    }

    update(dt: number) {
        if (gameBus.paused) return;

        // 每秒自动回血
        if (this._hpRecovery > 0 && this._currentHp < this._maxHp) {
            this._currentHp = Math.min(this._maxHp, this._currentHp + this._hpRecovery * dt);
            this.updateAndEmitHp();
        }
    }

    updateAndEmitHp() {
        if (this._currentHp <= 0) {
            this._currentHp = 0;
            GameData.hp = 0; // 全局判断
            gameBus.emit('game-over', 'lose');
        }
        if (this.hpLabel) {
            this.hpLabel.string = `${Math.round(this._currentHp)} / ${Math.round(this._maxHp)}`;
        }
        if (this.hpBar) {
            this.hpBar.progress = this._currentHp / this._maxHp;
        }
        // this.updateWallSprite();
        // console.log('[WallController] updateAndEmitHp', this._currentHp, this._maxHp);
        gameBus.emit('wall-hp-updated', { currentHp: this._currentHp, maxHp: this._maxHp });
    }

    updateHpUI() {
        if (this.hpLabel) {
            this.hpLabel.string = `${Math.round(this._currentHp)} / ${Math.round(this._maxHp)}`;
        }
        if (this.hpBar) {
            this.hpBar.progress = this._currentHp / this._maxHp;
        }
        // this.updateWallSprite();
    }

    /**
     * 恢复全部血量
     */
    restoreFullHp(): void {
        this._currentHp = this._maxHp;
        GameData.hp = this._currentHp;
        this.updateAndEmitHp();
        console.log('[WallController] 恢复全部血量:', this._currentHp, '/', this._maxHp);
    }

    onDestroy() {
        if (this._heroFieldUpdateHandler) {
            gameBus.off('hero-field-updated', this._heroFieldUpdateHandler);
        }
    }
} 