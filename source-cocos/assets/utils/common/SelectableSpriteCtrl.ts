import { _decorator, Component, Sprite, Node, Color } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('SelectableSpriteCtrl')
export class SelectableSpriteCtrl extends Component {
    // 声明一个属性，用于在编辑器里链接我们的原图Sprite节点
    @property(Sprite)
    mainSprite: Sprite = null;

    // 声明一个属性，用于在编辑器里链接描边Sprite节点
    @property(Node)
    outlineNode: Node = null;

    // 用于设置描边颜色，会在编辑器显示
    @property
    outlineColor: string = "#ff0000ff"; // 默认红色

    onLoad() {
        // 如果没手动指定，尝试自动查找节点
        if (!this.outlineNode) {
            this.outlineNode = this.node.getChildByName("Outline");
        }
        if (!this.mainSprite) {
            this.mainSprite = this.node.getChildByName("Sprite").getComponent(Sprite);
        }

        // 初始时隐藏描边
        if (this.outlineNode) {
            this.outlineNode.active = false;
        }
    }

    // 最重要的方法：外部调用这个来切换选中状态
    public setSelected(isSelected: boolean) {
        if (this.outlineNode) {
            this.outlineNode.active = isSelected; // 显示或隐藏描边
        }
    }

    // 你可以通过这个方法动态改变描边颜色
    public setOutlineColor(colorStr: string) {
        if (this.outlineNode) {
            const spriteComp = this.outlineNode.getComponent(Sprite);
            if (spriteComp) {
                // 将十六进制颜色字符串转换为cc.Color
                const color = new Color().fromHEX(colorStr);
                spriteComp.color = color;
            }
        }
    }
}