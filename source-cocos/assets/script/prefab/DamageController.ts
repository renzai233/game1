import { _decorator, Color, Component, Label, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DamageController')
export class DamageController extends Component {
    _value: number = 0; // 伤害值
    duration: number = 0; // 持续时间

    start() {}

    init(data, value) {
        this._value = value;
        const label = this.node.getChildByName('Label').getComponent(Label);
        label.string = `-${value}`;
        
        let colorStr = '#ffffff';
        if (data['damage_type'] && data['damage_type'].color) {
            colorStr = data['damage_type'].color;
        } else if (data['color']) {
            colorStr = data['color'];
        }

        // 样式升级：使用极具打击感的 Impact 字体，加粗加厚深空紫描边
        label.isBold = true;
        label.fontFamily = 'Impact, PingFang SC, Microsoft YaHei, Arial, sans-serif';
        label.enableOutline = true;
        label.outlineColor = new Color(8, 2, 38, 255);
        label.outlineWidth = 3.5;

        // 根据伤害数值区间，动态赋予渐进式霓虹色彩和浮动尺寸，增强打击反馈
        if (colorStr.toLowerCase() === '#ffffff' || colorStr.toLowerCase() === 'white') {
            if (value < 5) {
                label.color = new Color(51, 214, 255, 255); // 霓虹青
                label.fontSize = 38;
            } else if (value < 15) {
                label.color = new Color(255, 148, 27, 255); // 霓虹橙
                label.fontSize = 42;
            } else {
                label.color = new Color(255, 30, 140, 255); // 霓虹粉
                label.fontSize = 48;
            }
        } else {
            label.color = new Color(colorStr);
            if (value < 5) {
                label.fontSize = 38;
            } else if (value < 15) {
                label.fontSize = 42;
            } else {
                label.fontSize = 48;
            }
        }
        label.lineHeight = label.fontSize + 4;
    }

    update(deltaTime: number) {
        if (this.duration < 0.5) {
            this.duration += deltaTime;
        } else {
            this.node?.destroy();
        }
    }
}
