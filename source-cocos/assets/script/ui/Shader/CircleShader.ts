import { _decorator, Component, Graphics, Color, CCBoolean, CCFloat, CCInteger } from 'cc';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';
const { ccclass, property } = _decorator;

@ccclass('SimpleCircleDrawer')
export class SimpleCircleDrawer extends Component {
    // 添加颜色属性（带默认值）
    @property({
        tooltip: '圆形的填充颜色',
        displayName: '填充颜色'
    })
    fillColor: Color = new Color(255, 255, 255, 255); // 默认白色

    // 添加边框颜色属性
    @property({
        tooltip: '圆形的边框颜色',
        displayName: '边框颜色',
        visible: function (this: SimpleCircleDrawer) {
            return this.drawBorder; // 当启用边框时显示此属性
        }
    })
    borderColor: Color = new Color(0, 0, 0, 255); // 默认黑色边框

    // 添加是否绘制边框属性
    @property({
        tooltip: '是否绘制边框',
        displayName: '绘制边框'
    })
    drawBorder: boolean = false;

    // 添加边框宽度属性
    @property({
        type: CCFloat,
        tooltip: '边框宽度（像素）',
        displayName: '边框宽度',
        min: 0.1,
        max: 10,
        visible: function (this: SimpleCircleDrawer) {
            return this.drawBorder; // 当启用边框时显示此属性
        }
    })
    borderWidth: number = 1;

    // 添加半径属性
    @property({
        type: CCInteger,
        tooltip: '圆形半径（像素）',
        displayName: '半径',
        min: 1,
        max: 500
    })
    radius: number = 50;

    start() {
        this.drawCircle();
    }

    updateColor() {
        this.drawCircle();
    }

    // 绘制圆形的方法
    private drawCircle() {
        const g = this.getComponent(Graphics) || this.addComponent(Graphics);
        g.clear();

        // 设置填充颜色
        g.fillColor = this.fillColor.clone();

        // 绘制圆形
        g.circle(0, 0, this.radius);

        // 填充圆形
        g.fill();

        // 如果需要绘制边框
        if (this.drawBorder) {
            // 设置边框颜色
            g.strokeColor = this.borderColor.clone();

            // 设置边框宽度
            g.lineWidth = this.borderWidth;

            // 绘制边框
            g.stroke();
        }
        
        // 确保图形更新
        g.markForUpdateRenderData();
    }

    /**
     * 根据英雄稀有度设置颜色
     * @param rarity 英雄稀有度字符串（如'common', 'rare', 'epic'等）
     */
    public setColorByRarity(rarity: string) {
        if (EDM.isDev()) console.log('[SimpleCircleDrawer][setColorByRarity] 设置颜色，稀有度:', rarity, '类型:', typeof rarity);

        // 处理稀有度字符串
        let rarityStr = '';
        if (typeof rarity === 'string') {
            rarityStr = rarity.toLowerCase().trim();
            // 处理常见的稀有度格式
            if (['common', 'c', 'base', 'normal', '1'].includes(rarityStr)) {
                rarityStr = 'common';
            } else if (rarityStr === 'r' || rarityStr.includes('rare') || rarityStr === '2') {
                rarityStr = 'rare';
            } else if (rarityStr.includes('epic') || rarityStr === '3') {
                rarityStr = 'epic';
            } else if (rarityStr.includes('legendary') || rarityStr === '4') {
                rarityStr = 'legendary';
            } else if (rarityStr.includes('sr') || rarityStr === '5') {
                rarityStr = 'sr';
            } else if (rarityStr.includes('ssr') || rarityStr === '6') {
                rarityStr = 'ssr';
            }
        } else if (typeof rarity === 'number') {
            // 数字转字符串
            switch (rarity) {
                case 1: rarityStr = 'common'; break;
                case 2: rarityStr = 'rare'; break;
                case 3: rarityStr = 'epic'; break;
                case 4: rarityStr = 'legendary'; break;
                case 5: rarityStr = 'sr'; break;
                case 6: rarityStr = 'ssr'; break;
                default: rarityStr = 'common'; break;
            }
        }

        console.log('[SimpleCircleDrawer][setColorByRarity] 处理后的稀有度:', rarityStr);

        // 根据稀有度设置不同的颜色
        switch (rarityStr) {
            case 'common':
                this.fillColor = new Color(27, 17, 65, 255); // 灰色 #8A8A8A
                this.borderColor = new Color(33, 215, 255, 255);
                break;
            case 'rare':
                this.fillColor = new Color(153, 78, 255, 255); // 浅绿色 #B9DD94
                this.borderColor = new Color(255, 219, 96, 255);
                break;
            case 'epic':
                this.fillColor = new Color(33, 215, 255, 255); // 蓝色 #4A7BC8
                this.borderColor = new Color(238, 250, 255, 255);
                break;
            case 'legendary':
                this.fillColor = new Color(255, 76, 214, 255); // 紫色 #B464DC
                this.borderColor = new Color(33, 215, 255, 255); // #8A4AA8
                break;
            case 'sr':
                this.fillColor = new Color(255, 219, 96, 255); // 金色 #FFD732
                this.borderColor = new Color(255, 76, 214, 255); // #FFA500
                break;
            case 'ssr':
                this.fillColor = new Color(255, 64, 108, 255); // 红色 #FF6B6B
                this.borderColor = new Color(255, 219, 96, 255); // #D44A4A
                break;
            default:
                // 默认使用灰色
                if (EDM.isDev()) if (EDM.isDev()) if (EDM.isDev()) if (EDM.isDev()) if (EDM.isDev()) if (EDM.isDev()) if (EDM.isDev()) if (EDM.isDev()) if (EDM.isDev()) console.warn('[SimpleCircleDrawer][setColorByRarity] 未知稀有度，使用默认颜色:', rarityStr);
                this.fillColor = new Color(27, 17, 65, 255);
                this.borderColor = new Color(33, 215, 255, 255);
                break;
        }
        // 更新绘制
        this.drawCircle();
    }

    // 十六进制颜色字符串转换为Color对象
    private hexToColor(hex: string): Color {
        // 移除#号
        hex = hex.replace(/^#/, '');

        // 解析RGB值
        let r, g, b;
        if (hex.length === 3) {
            // 短格式 #RGB
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            // 长格式 #RRGGBB
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        } else {
            // 默认白色
            return new Color(255, 255, 255, 255);
        }

        return new Color(r, g, b, 255);
    }
}