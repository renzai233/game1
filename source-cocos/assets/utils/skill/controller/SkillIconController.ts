import { _decorator, Component, Label, Sprite, Color } from 'cc';
import { gameBus } from 'db://assets/utils/signal/GameBus';
import { ISkill, SKILL_STATUS } from '../ISkill';
import { loadResSingleAsset } from 'db://assets/utils/utils';
import { SIGNAL_TYPES } from '../../signal/ISignal';
import { HDM } from '../../data/config/hero/HeroDataManager';
const { ccclass, property } = _decorator;

@ccclass('SkillIconController')
export class SkillIconController extends Component {
    @property(Sprite)
    icon: Sprite = null;
    @property(Sprite)
    iconBg: Sprite = null;
    @property(Label)
    levelLabel: Label = null;
    @property(Sprite)
    cooldownSprite: Sprite = null;
    @property(Sprite)
    castSprite: Sprite = null;

    private _skill: ISkill;
    private _heroId: number;
    private _skillStatusHandler: (data: any) => void;
    private _currentStatus: string = SKILL_STATUS.READY;
    private _currentProgress: number = 0;

    init(skill: ISkill, heroId: number) {
        this._skill = skill;
        this._heroId = heroId;
        this.updateIcon(skill.url);
        this.updateLevel(skill.level);
        this.cooldownSprite.fillRange = 0;
        this.castSprite.fillRange = 0;

        // 初始化技能状态总线监听
        this.initSkillStatusBus();

        // 初始化UI状态
        this.updateIconStatus(SKILL_STATUS.READY, 0);
    }

    /**
     * 初始化技能状态总线监听
     */
    private initSkillStatusBus() {
        this._skillStatusHandler = (data: any) => {
            if (data.heroId === this._heroId && data.skillId === this._skill.skillId) {
                this.updateIconStatus(data.status, data.progress || 0);
            }
        };
        gameBus.on(SIGNAL_TYPES.SKILL_ICON_CHANGED, this._skillStatusHandler);
    }

    /**
     * 根据技能状态更新图标表现
     */
    private updateIconStatus(status: string, progress: number) {
        this._currentStatus = status;
        this._currentProgress = progress;

        switch (status) {
            case SKILL_STATUS.READY:
                // 准备状态：图标正常显示，无蒙版
                this.cooldownSprite.node.active = false;
                this.castSprite.node.active = false;
                this.icon.color = Color.WHITE;
                // 彻底移除遮罩颜色影响
                this.cooldownSprite.color = new Color(0, 0, 0, 0);
                this.castSprite.color = new Color(0, 0, 0, 0);
                break;

            case SKILL_STATUS.RELEASING:
                // 释放中：绿色边框进度条 + 灰色透明蒙版
                this.cooldownSprite.node.active = true;
                this.castSprite.node.active = true;

                // 灰色透明蒙版（全遮罩）
                this.cooldownSprite.fillRange = 1;
                this.cooldownSprite.color = new Color(0, 0, 0, 128); // 半透明黑色

                // 绿色边框进度条（根据释放进度减少）
                this.castSprite.fillRange = 1 - progress; // 进度条从1减少到0
                this.castSprite.color = Color.GREEN;

                this.icon.color = Color.WHITE;
                break;

            case SKILL_STATUS.COOLDOWN:
                // 冷却中：灰色透明蒙版根据进度旋转减少
                this.cooldownSprite.node.active = true;
                this.castSprite.node.active = false;

                // 灰色蒙版根据冷却进度旋转减少
                this.cooldownSprite.fillRange = 1 - progress; // 从1减少到0
                this.cooldownSprite.color = new Color(0, 0, 0, 128); // 半透明黑色

                // this.icon.color = Color.GRAY;
                break;
        }
    }

    /**
     * 每帧更新，确保技能图标状态同步
     */
    update(dt: number) {
        if (!this._skill) return;
        // 每帧同步等级显示
        this.updateLevel(this._skill.level);

        // 从技能对象获取状态和进度
        const status = (this._skill as any).skillStatus || (this._skill as any).atkStatus || SKILL_STATUS.READY;
        const cooldown = (this._skill as any).attackSpeed || (this._skill as any).cooldown || 1;
        const cooldownTiming = (this._skill as any).cooldownTiming || 0;
        const duration = (this._skill as any).duration || 0.5;
        const durationTiming = (this._skill as any).durationTiming || 0;

        let progress = 0;

        if (status === SKILL_STATUS.RELEASING) {
            progress = duration > 0 ? durationTiming / duration : 0;
        } else if (status === SKILL_STATUS.COOLDOWN) {
            progress = cooldown > 0 ? cooldownTiming / cooldown : 0;
        }

        // 如果状态或进度发生变化，更新UI
        if (this._currentStatus !== status || Math.abs(this._currentProgress - progress) > 0.01) {
            this.updateIconStatus(status, progress);
        }
    }

    /**
     * 更新技能图标
     * @param url 技能图标url
     */
    updateIcon(url: string) {
        let finalUrl = url ?? "default";

        // 优先通过heroId查找英雄url
        if (this._heroId) {
            const hero = HDM.getHeroList().find(h => h.id === Number(this._heroId));
            if (hero && hero.url) finalUrl = hero.url;
        }

        let path = `textures/hero/${finalUrl}/portrait/spriteFrame`;
        loadResSingleAsset(path, (spriteFrame) => {
            if (this.icon && spriteFrame) {
                this.icon.spriteFrame = spriteFrame;
            }
        });

        // 设置背景颜色
        this.setBgColorByHeroRarity();
    }

    /**
     * 根据英雄稀有度设置背景色
     */
    private setBgColorByHeroRarity() {
        if (!this.iconBg) {
            console.warn('[SkillIconController] iconBg is null');
            return;
        }

        // 确保iconBg有SpriteFrame
        if (!this.iconBg.spriteFrame) {
            console.warn('[SkillIconController] iconBg has no spriteFrame');
            return;
        }

        // 暂统一使用灰色（#8A8A8A），后续按稀有度扩展
        this.iconBg.color = new Color(138, 138, 138, 255);
    }


    /**
     * 更新技能等级
     * @param level 技能等级
     */
    updateLevel(level: number) {
        if (this.levelLabel) {
            this.levelLabel.string = level ? level.toString() : '';
        }
    }

    /**
     * 销毁
     */
    onDestroy() {
        if (this._skillStatusHandler) {
            gameBus.off(SIGNAL_TYPES.SKILL_ICON_CHANGED, this._skillStatusHandler);
        }
    }
}