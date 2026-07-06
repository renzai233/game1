import { _decorator, Component, Sprite, Label, Node } from 'cc';
const { ccclass, property } = _decorator;

/**
 * 技能冷却图标组件
 */
@ccclass('SkillIcon')
export class SkillIcon extends Component {
    @property(Sprite)
    iconSprite: Sprite = null!;

    @property(Label)
    cooldownLabel: Label = null!;

    @property(Node)
    cooldownMask: Node = null!;

    /** 是否显示冷却动画 */
    @property
    showCooldown: boolean = true;

    /** 冷却剩余时间 */
    private _cooldownLeft: number = 0;
    /** 冷却总时间 */
    private _cooldown: number = 0;

    /** 设置技能图标 */
    setIcon(iconPath: string) {
        // TODO: 动态加载图标资源
    }

    /** 设置冷却时间 */
    setCooldown(cooldown: number) {
        this._cooldown = cooldown;
        this._cooldownLeft = cooldown;
        this.updateCooldownUI();
    }

    /** 更新冷却剩余 */
    updateCooldownLeft(left: number) {
        this._cooldownLeft = left;
        this.updateCooldownUI();
    }

    /** 刷新冷却UI */
    updateCooldownUI() {
        if (!this.showCooldown) {
            this.cooldownLabel.node.active = false;
            this.cooldownMask.active = false;
            return;
        }
        this.cooldownLabel.node.active = this._cooldownLeft > 0;
        this.cooldownMask.active = this._cooldownLeft > 0;
        if (this._cooldownLeft > 0) {
            this.cooldownLabel.string = this._cooldownLeft.toFixed(1);
            // TODO: 冷却遮罩动画
        }
    }
} 