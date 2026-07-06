import { _decorator, Component, Sprite, Label } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Buff图标组件
 */
@ccclass('SkillBuffIcon')
export class SkillBuffIcon extends Component {
    @property(Sprite)
    iconSprite: Sprite = null!;

    @property(Label)
    stackLabel: Label = null!;

    /** 设置Buff图标 */
    setIcon(iconPath: string) {
        // TODO: 动态加载图标资源
    }

    /** 设置叠加层数 */
    setStackCount(count: number) {
        this.stackLabel.string = count > 1 ? count.toString() : '';
    }
} 