import { _decorator, Component, Graphics, Color, Size, CCFloat, CCInteger, Enum, CCBoolean } from 'cc';
const { ccclass, property, executeInEditMode } = _decorator;

// 稀有度定义
export enum Rarity {
    Common = 0,    // 普通 - 灰色
    Uncommon,      // 罕见 - 绿色
    Rare,          // 稀有 - 蓝色
    Epic,          // 史诗 - 紫色
    Legendary      // 传说 - 金色
}

@ccclass('RoundedBackground')
@executeInEditMode // 允许在编辑器模式下预览
export class RoundedBackground extends Component {
    // 背景尺寸
    @property({ tooltip: '背景尺寸' })
    size = new Size(200, 250);

    // 圆角半径
    @property({ type: CCFloat, tooltip: '圆角半径', min: 0, max: 50 })
    cornerRadius = 15;

    // 当前稀有度
    @property({
        type: Enum(Rarity),
        tooltip: '稀有度'
    })
    rarity: Rarity = Rarity.Common;

    @property({
        tooltip: '是否启用阴影',
        displayName: '阴影效果'
    })
    enableShadow = true;

    @property({
        tooltip: '阴影颜色',
        displayName: '阴影颜色',
        visible: function () { return this.enableShadow; }
    })
    shadowColor = new Color(0, 0, 0, 100);

    @property({
        type: CCFloat,
        tooltip: '阴影偏移X',
        displayName: '阴影X',
        min: -20,
        max: 20,
        visible: function () { return this.enableShadow; }
    })
    shadowOffsetX = 5;

    @property({
        type: CCFloat,
        tooltip: '阴影偏移Y',
        displayName: '阴影Y',
        min: -20,
        max: 20,
        visible: function () { return this.enableShadow; }
    })
    shadowOffsetY = -5;


    // 稀有度颜色映射
    private static readonly RARITY_COLORS: Record<Rarity, Color> = {
        [Rarity.Common]: new Color(33, 24, 70, 245),
        [Rarity.Uncommon]: new Color(121, 62, 207, 245),
        [Rarity.Rare]: new Color(31, 179, 220, 245),
        [Rarity.Epic]: new Color(213, 65, 187, 245),
        [Rarity.Legendary]: new Color(227, 194, 92, 245),
    };
    // const rarityColorMap: { [key: string]: Color } = {
    //     '1_silver':   new Color(192,192,192),   // 银
    //     '2_green':    new Color(0,200,0),       // 绿
    //     '3_blue':     new Color(0,128,255),     // 蓝
    //     '4_purple':   new Color(160,32,240),    // 紫
    //     '5_gold':     new Color(255,215,0),     // 金
    //     '6_platinum': new Color(229,228,226),   // 白金
    //     '7_gem':  new Color(0,255,255),     // 钻石
    //     '8_color':    new Color(255,105,180),   // 彩
    //     '9_red':      new Color(255,0,0),       // 红
    // };

    // Graphics 组件引用
    private graphics: Graphics | null = null;


    onLoad() {
        this.graphics = this.getComponent(Graphics) || this.addComponent(Graphics);
        this.drawBackground();
    }

    // 设置稀有度
    setRarity(rarity: Rarity) {
        this.rarity = rarity;
        this.drawBackground();
    }

    // 设置尺寸
    setSize(width: number, height: number) {
        this.size.width = width;
        this.size.height = height;
        this.drawBackground();
    }

    // 绘制圆角背景
    drawBackground() {
        if (!this.graphics) return;

        this.graphics.clear();

        // 先绘制阴影
        if (this.enableShadow) {
            const shadowColor = this.shadowColor.clone();
            this.graphics.fillColor = shadowColor;

            this.drawRoundedRect(
                -this.size.width / 2 + this.shadowOffsetX,
                -this.size.height / 2 + this.shadowOffsetY,
                this.size.width,
                this.size.height,
                this.cornerRadius
            );

            this.graphics.fill();
        }

        // 获取颜色
        const color = RoundedBackground.RARITY_COLORS[this.rarity];
        this.graphics.fillColor = color.clone();

        // 绘制圆角矩形
        this.drawRoundedRect(
            -this.size.width / 2,
            -this.size.height / 2,
            this.size.width,
            this.size.height,
            this.cornerRadius
        );

        // 填充
        this.graphics.fill();

    }

    // 绘制圆角矩形 (修复 arc 方法参数问题)
    private drawRoundedRect(x: number, y: number, width: number, height: number, radius: number) {
        if (!this.graphics) return;

        // 确保半径不超过尺寸的一半
        radius = Math.min(radius, Math.min(width, height) / 2);

        // 计算控制点偏移量
        const controlOffset = radius * 0.552284749831; // 贝塞尔曲线控制点偏移量

        // 1. 从左上角开始 (x + radius, y)
        this.graphics.moveTo(x + radius, y);

        // 2. 上边线
        this.graphics.lineTo(x + width - radius, y);

        // 3. 右上角贝塞尔曲线
        this.graphics.bezierCurveTo(
            x + width - radius + controlOffset, y,
            x + width, y + radius - controlOffset,
            x + width, y + radius
        );

        // 4. 右边线
        this.graphics.lineTo(x + width, y + height - radius);

        // 5. 右下角贝塞尔曲线
        this.graphics.bezierCurveTo(
            x + width, y + height - radius + controlOffset,
            x + width - radius + controlOffset, y + height,
            x + width - radius, y + height
        );

        // 6. 下边线
        this.graphics.lineTo(x + radius, y + height);

        // 7. 左下角贝塞尔曲线
        this.graphics.bezierCurveTo(
            x + radius - controlOffset, y + height,
            x, y + height - radius + controlOffset,
            x, y + height - radius
        );

        // 8. 左边线
        this.graphics.lineTo(x, y + radius);

        // 9. 左上角贝塞尔曲线
        this.graphics.bezierCurveTo(
            x, y + radius - controlOffset,
            x + radius - controlOffset, y,
            x + radius, y
        );

        // 关闭路径
        this.graphics.close();
    }

    // // 编辑器属性变化回调
    // protected onPropertyChange(prop: string) {
    //     if (prop === 'size' || prop === 'cornerRadius' || prop === 'rarity') {
    //         this.drawBackground();
    //     }
    // }
}