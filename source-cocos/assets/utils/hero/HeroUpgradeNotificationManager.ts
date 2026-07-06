/**
 * 英雄升级提示管理器
 * 负责管理英雄升级相关的视觉提示和动画
 */

import { _decorator, Component, Node, Sprite, Animation, Tween, tween, Vec3, Color } from 'cc';
import { IHero as IHeroData } from './IHero';
import { HDM } from '../data/config/hero/HeroDataManager';

const { ccclass, property } = _decorator;

/**
 * 升级提示类型
 */
export enum UpgradeNotificationType {
    Navigation = 'navigation',      // 导航栏英雄按钮
    HeroItem = 'hero_item',         // HeroItem右上角
    DetailPanel = 'detail_panel'    // 详情面板升级按钮
}

/**
 * 升级提示配置
 */
export interface IUpgradeNotificationConfig {
    type: UpgradeNotificationType;
    node: Node;
    sprite?: Sprite;
    animation?: Animation;
    isActive: boolean;
}

@ccclass('HeroUpgradeNotificationManager')
export class HeroUpgradeNotificationManager extends Component {
    private static _instance: HeroUpgradeNotificationManager;

    // 升级提示配置
    private _notificationConfigs: Map<string, IUpgradeNotificationConfig> = new Map();
    
    // 可升级的英雄列表
    private _upgradableHeroes: Set<string> = new Set();
    
    // 可升星的英雄列表
    private _starUpgradableHeroes: Set<string> = new Set();

    public static get instance(): HeroUpgradeNotificationManager {
        return this._instance;
    }

    onLoad() {
        HeroUpgradeNotificationManager._instance = this;
    }

    onDestroy() {
        if (HeroUpgradeNotificationManager._instance === this) {
            HeroUpgradeNotificationManager._instance = null;
        }
    }

    /**
     * 注册升级提示节点
     * @param type 提示类型
     * @param node 节点
     * @param sprite 精灵组件（可选）
     * @param animation 动画组件（可选）
     */
    public registerNotification(type: UpgradeNotificationType, node: Node, sprite?: Sprite, animation?: Animation): void {
        const key = `${type}_${node.uuid}`;
        this._notificationConfigs.set(key, {
            type,
            node,
            sprite,
            animation,
            isActive: false
        });
    }

    /**
     * 更新英雄升级状态
     * @param heroData 英雄数据
     */
    public updateHeroUpgradeStatus(heroData: IHeroData): void {
        const canUpgrade = HDM.canUpgradeHero(Number(heroData.id));
        const canStarUp = HDM.canStarUpHero(Number(heroData.id));

        if (canUpgrade) {
            this._upgradableHeroes.add(heroData.id);
        } else {
            this._upgradableHeroes.delete(heroData.id);
        }

        if (canStarUp) {
            this._starUpgradableHeroes.add(heroData.id);
        } else {
            this._starUpgradableHeroes.delete(heroData.id);
        }

        this.updateAllNotifications();
    }

    /**
     * 更新所有提示
     */
    public updateAllNotifications(): void {
        this._notificationConfigs.forEach((config, key) => {
            this.updateNotification(config);
        });
    }

    /**
     * 更新单个提示
     * @param config 提示配置
     */
    private updateNotification(config: IUpgradeNotificationConfig): void {
        const hasUpgradableHeroes = this._upgradableHeroes.size > 0;
        const hasStarUpgradableHeroes = this._starUpgradableHeroes.size > 0;
        const shouldShow = hasUpgradableHeroes || hasStarUpgradableHeroes;

        if (shouldShow && !config.isActive) {
            this.activateNotification(config);
        } else if (!shouldShow && config.isActive) {
            this.deactivateNotification(config);
        }
    }

    /**
     * 激活提示
     * @param config 提示配置
     */
    private activateNotification(config: IUpgradeNotificationConfig): void {
        config.isActive = true;
        config.node.active = true;

        // 设置红色提示点
        if (config.sprite) {
            config.sprite.color = new Color(255, 0, 0, 255);
        }

        // 播放动画
        if (config.animation) {
            config.animation.play();
        } else {
            // 创建更丰富的动画效果
            this.createEnhancedPulseAnimation(config.node);
        }
    }

    /**
     * 停用提示
     * @param config 提示配置
     */
    private deactivateNotification(config: IUpgradeNotificationConfig): void {
        config.isActive = false;
        config.node.active = false;

        // 停止动画
        if (config.animation) {
            config.animation.stop();
        }

        // 停止缩放动画
        Tween.stopAllByTarget(config.node);
    }

    /**
     * 创建脉冲动画
     * @param node 目标节点
     */
    private createPulseAnimation(node: Node): void {
        const originalScale = node.scale.clone();
        const pulseScale = originalScale.clone().multiplyScalar(1.2);

        tween(node)
            .to(0.5, { scale: pulseScale })
            .to(0.5, { scale: originalScale })
            .union()
            .repeatForever()
            .start();
    }

    /**
     * 创建增强的脉冲动画
     * @param node 目标节点
     */
    private createEnhancedPulseAnimation(node: Node): void {
        const originalScale = node.scale.clone();
        const pulseScale = originalScale.clone().multiplyScalar(1.3);

        // 创建闪烁和缩放组合动画
        tween(node)
            .parallel(
                tween()
                    .to(0.3, { scale: pulseScale })
                    .to(0.3, { scale: originalScale })
                    .union()
                    .repeatForever(),
                tween()
                    .to(0.5, { opacity: 180 })
                    .to(0.5, { opacity: 255 })
                    .union()
                    .repeatForever()
            )
            .start();
    }

    /**
     * 播放升级动画
     * @param heroData 英雄数据
     * @param onComplete 完成回调
     */
    public playUpgradeAnimation(heroData: IHeroData, onComplete?: () => void): void {
        // 创建升级特效节点
        const effectNode = new Node('UpgradeEffect');
        effectNode.parent = this.node;

        // 创建升级特效精灵
        const effectSprite = effectNode.addComponent(Sprite);
        // TODO: 设置升级特效图片

        // 播放升级动画
        tween(effectNode)
            .set({ scale: Vec3.ZERO })
            .to(0.3, { scale: new Vec3(1.5, 1.5, 1.5) })
            .to(0.2, { scale: new Vec3(1, 1, 1) })
            .call(() => {
                effectNode.destroy();
                onComplete?.();
            })
            .start();
    }

    /**
     * 检查英雄是否可以升级
     * @param heroData 英雄数据
     * @returns 是否可以升级
     */
    public canHeroUpgrade(heroData: IHeroData): boolean {
        return this._upgradableHeroes.has(heroData.id);
    }

    /**
     * 检查英雄是否可以升星
     * @param heroData 英雄数据
     * @returns 是否可以升星
     */
    public canHeroStarUp(heroData: IHeroData): boolean {
        return this._starUpgradableHeroes.has(heroData.id);
    }

    /**
     * 获取可升级英雄数量
     * @returns 可升级英雄数量
     */
    public getUpgradableHeroCount(): number {
        return this._upgradableHeroes.size;
    }

    /**
     * 获取可升星英雄数量
     * @returns 可升星英雄数量
     */
    public getStarUpgradableHeroCount(): number {
        return this._starUpgradableHeroes.size;
    }

    /**
     * 清除所有提示
     */
    public clearAllNotifications(): void {
        this._upgradableHeroes.clear();
        this._starUpgradableHeroes.clear();
        this.updateAllNotifications();
    }
} 