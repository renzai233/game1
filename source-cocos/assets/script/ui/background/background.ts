import { _decorator, Component, Node, Prefab, instantiate, randomRangeInt, Vec3, UITransform, Sprite, Color, Graphics, view } from "cc";
import { EDM } from "db://assets/utils/data/env/ConfigManager";
const { ccclass, property } = _decorator;

/**
 * Background类负责游戏背景的渲染与滚动等逻辑
 * 包含渐变背景、滚动图标和装饰元素的组合显示
 */
@ccclass("Background")
export class Background extends Component {
    // 背景预制体数组，用于随机选择不同的背景装饰元素
    @property(Prefab) private backgroundPrefabs: Prefab[] = [];
    @property({tooltip: '是否显示滚动图标'})
    public showScrollingIcons: boolean = true;

    // 目标节点（通常为玩家），用于跟随其位置滚动背景
    private targetNode: Node;
    // 存储所有实例化的背景块节点，二维数组结构
    private instancedBackgrounds: Node[][] = [];

    // 背景块的行数
    private rows = 3;
    // 背景块的列数
    private columns = 3;
    // 每个背景块的像素尺寸
    private nodeSize = 256;

    // 玩家当前所在的背景格子X坐标
    private playerGridPosX = 0;
    // 玩家当前所在的背景格子Y坐标
    private playerGridPosY = 0;

    // 渐变背景节点
    private gradientBackground: Node;
    // 当前背景主题色
    private currentThemeColor: Color;

    // 滚动图标相关
    private iconNodes: Node[][] = [];
    private iconSize = 150; // 图标大小
    private iconSpacing = 200; // 图标间距
    private scrollSpeed = 0.5; // 滚动速度
    private scrollOffset = 0; // 滚动偏移
    private iconGridReady = false;
    private iconGridParams: {maxIndex: number, createdRow: number, createdCol: number, rowCount: number, colCount: number} = null;

    /**
     * 生命周期方法，场景加载后自动调用
     * 自动初始化背景系统
     */
    start() {
        // 确保节点层级设置正确
        this.node.layer = 33554432; // UI_2D 层

        // 如果没有目标节点，使用当前节点作为目标（用于静态背景显示）
        if (!this.targetNode) {
            this.targetNode = this.node;
        }

        // 延迟一帧初始化，确保场景完全加载
        this.scheduleOnce(() => {
            this.init(this.targetNode);
        }, 0);
    }

    /**
     * 初始化背景系统，生成渐变背景、滚动图标和装饰元素
     * @param targetNode 需要跟随的目标节点（如玩家）
     */
    public init(targetNode: Node): void {
        this.targetNode = targetNode;

        // 确保有背景预制体
        if (this.backgroundPrefabs.length === 0) {
            console.warn('[Background] 没有配置背景预制体！');
            return;
        }

        // 清空之前的背景块
        this.instancedBackgrounds = [];

        // 移除所有子节点
        this.node.removeAllChildren();

        // 生成随机主题色
        this.generateRandomThemeColor();

        // 创建渐变背景
        this.createGradientBackground();

        // 创建滚动图标
        this.createScrollingIcons();

        // 创建装饰元素
        this.createDecorationElements();
    }

    /**
     * 生成随机主题色，用于背景渐变
     */
    private generateRandomThemeColor(): void {
        // 预定义的主题色方案
        const themeColors = [
            { primary: new Color(255, 182, 193, 255), secondary: new Color(255, 20, 147, 255) }, // 粉色系
            { primary: new Color(173, 216, 230, 255), secondary: new Color(0, 191, 255, 255) },   // 蓝色系
            { primary: new Color(144, 238, 144, 255), secondary: new Color(34, 139, 34, 255) },   // 绿色系
            { primary: new Color(255, 218, 185, 255), secondary: new Color(255, 140, 0, 255) },   // 橙色系
            { primary: new Color(221, 160, 221, 255), secondary: new Color(138, 43, 226, 255) },  // 紫色系
            { primary: new Color(255, 228, 196, 255), secondary: new Color(255, 69, 0, 255) },    // 珊瑚色系
            { primary: new Color(176, 224, 230, 255), secondary: new Color(70, 130, 180, 255) },  // 钢蓝色系
            { primary: new Color(255, 240, 245, 255), secondary: new Color(219, 112, 147, 255) }, // 淡粉色系
            { primary: new Color(240, 248, 255, 255), secondary: new Color(100, 149, 237, 255) }, // 爱丽丝蓝
            { primary: new Color(255, 250, 240, 255), secondary: new Color(255, 215, 0, 255) },   // 金色系
            { primary: new Color(245, 245, 245, 255), secondary: new Color(169, 169, 169, 255) }, // 银灰色系
            { primary: new Color(255, 228, 225, 255), secondary: new Color(220, 20, 60, 255) }    // 深红色系
        ];

        // 随机选择一个主题色方案
        const randomTheme = themeColors[Math.floor(Math.random() * themeColors.length)];
        this.currentThemeColor = randomTheme.primary;

        // 创建渐变背景节点
        this.createGradientBackgroundWithColors(randomTheme.primary, randomTheme.secondary);
    }

    /**
     * 创建渐变背景
     */
    private createGradientBackground(): void {
        // 这个方法现在由createGradientBackgroundWithColors处理
    }

    /**
     * 使用指定颜色创建渐变背景
     * @param color1 起始颜色
     * @param color2 结束颜色
     */
    private createGradientBackgroundWithColors(color1: Color, color2: Color): void {
        // 创建渐变背景节点
        this.gradientBackground = new Node('GradientBackground');
        this.gradientBackground.setParent(this.node);
        this.gradientBackground.layer = 33554432;
        this.gradientBackground.setPosition(0, 0, -1); // 放在最底层

        // 设置渐变背景的大小
        const transform = this.gradientBackground.getComponent(UITransform) || this.gradientBackground.addComponent(UITransform);
        transform.setContentSize(EDM.config.viewWidth, EDM.config.viewHeight);

        // 使用Graphics组件创建渐变背景
        const graphics = this.gradientBackground.addComponent(Graphics);

        // 创建简单的渐变背景，只保留基础渐变
        this.createSimpleGradient(graphics, color1, color2);
    }

    /**
     * 创建简单的渐变背景（只保留基础渐变，取消3个圆形）
     * @param graphics Graphics组件
     * @param color1 主色调
     * @param color2 辅助色
     */
    private createSimpleGradient(graphics: Graphics, color1: Color, color2: Color): void {
        const width = EDM.config.viewWidth;
        const height = EDM.config.viewHeight;

        // 只保留基础渐变背景
        const baseColor = new Color(
            Math.floor(color1.r * 0.8 + color2.r * 0.2),
            Math.floor(color1.g * 0.8 + color2.g * 0.2),
            Math.floor(color1.b * 0.8 + color2.b * 0.2),
            255
        );

        graphics.fillColor = baseColor;
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
    }

    /**
     * 创建滚动图标（以屏幕中心为原点，对称分布，确保全屏覆盖）
     */
    private createScrollingIcons(): void {
        // 若关闭开关，直接返回
        if (!this.showScrollingIcons) {
            this.iconNodes = [];
            return;
        }
        const width = view.getVisibleSize().width;
        const height = view.getVisibleSize().height;
        this.iconNodes = [];
        const diag = Math.sqrt(width * width + height * height);
        const maxIndex = Math.ceil(diag / this.iconSpacing) + 2;
        const rowCount = maxIndex * 2 + 1;
        const colCount = maxIndex * 2 + 1;
        // 懒加载参数
        this.iconGridReady = false;
        this.iconGridParams = {maxIndex, createdRow: 0, createdCol: 0, rowCount, colCount};
        // 先初始化二维数组
        for (let row = 0; row < rowCount; row++) {
            this.iconNodes[row] = [];
        }
    }

    /**
     * 分帧创建滚动图标节点，优先中心区域
     */
    private lazyCreateScrollingIcons(): void {
        if (this.iconGridReady || !this.showScrollingIcons || !this.iconGridParams) return;
        const width = view.getVisibleSize().width;
        const height = view.getVisibleSize().height;
        const diag = Math.sqrt(width * width + height * height);
        const cos45 = 0.7071, sin45 = 0.7071;
        const {maxIndex, rowCount, colCount} = this.iconGridParams;
        let {createdRow, createdCol} = this.iconGridParams;
        // 每帧最多创建N个节点，避免卡顿
        let created = 0, maxPerFrame = 20;
        for (; createdRow < rowCount; createdRow++) {
            for (; createdCol < colCount; createdCol++) {
                const rowIdx = createdRow - maxIndex;
                const colIdx = createdCol - maxIndex;
                const iconNode = new Node(`Icon_${rowIdx}_${colIdx}`);
                iconNode.setParent(this.node);
                iconNode.layer = 33554432;
                const graphics = iconNode.addComponent(Graphics);
                const iconType = Math.floor(Math.random() * 5);
                this.drawIcon(graphics, iconType);
                const x = colIdx * this.iconSpacing * cos45 + rowIdx * this.iconSpacing * cos45;
                const y = colIdx * this.iconSpacing * sin45 - rowIdx * this.iconSpacing * sin45;
                iconNode.setPosition(x, y, 0);
                this.iconNodes[createdRow][createdCol] = iconNode;
                created++;
                if (created >= maxPerFrame) {
                    this.iconGridParams.createdRow = createdRow;
                    this.iconGridParams.createdCol = createdCol + 1;
                    if (this.iconGridParams.createdCol >= colCount) {
                        this.iconGridParams.createdRow++;
                        this.iconGridParams.createdCol = 0;
                    }
                    return;
                }
            }
            createdCol = 0;
        }
        this.iconGridReady = true;
    }

    /**
     * 绘制图标
     * @param graphics Graphics组件
     * @param iconType 图标类型 (0:皇冠, 1:女皇冠, 2:魔法师帽子, 3:五角星, 4:盾牌)
     */
    private drawIcon(graphics: Graphics, iconType: number): void {
        const size = this.iconSize;
        const halfSize = size / 2;

        // 设置图标颜色（比背景稍深的主题色）
        const iconColor = new Color(
            Math.max(0, this.currentThemeColor.r - 40),
            Math.max(0, this.currentThemeColor.g - 40),
            Math.max(0, this.currentThemeColor.b - 40),
            120 // 半透明
        );

        graphics.fillColor = iconColor;
        graphics.strokeColor = iconColor;
        graphics.lineWidth = 2;

        switch (iconType) {
            case 0: // 皇冠
                this.drawCrown(graphics, halfSize);
                break;
            case 1: // 女皇冠
                this.drawQueenCrown(graphics, halfSize);
                break;
            case 2: // 魔法师帽子
                this.drawWizardHat(graphics, halfSize);
                break;
            case 3: // 五角星
                this.drawStar(graphics, halfSize);
                break;
            case 4: // 盾牌
                this.drawShield(graphics, halfSize);
                break;
        }
    }

    /**
     * 绘制皇冠
     */
    private drawCrown(graphics: Graphics, size: number): void {
        // 皇冠主体
        graphics.rect(-size * 0.8, -size * 0.3, size * 1.6, size * 0.6);
        graphics.fill();

        // 皇冠尖顶
        for (let i = 0; i < 5; i++) {
            const x = -size * 0.6 + i * size * 0.3;
            graphics.moveTo(x, size * 0.3);
            graphics.lineTo(x + size * 0.15, size * 0.6);
            graphics.lineTo(x + size * 0.3, size * 0.3);
            graphics.stroke();
        }

        // 宝石
        graphics.circle(0, 0, size * 0.1);
        graphics.fill();
    }

    /**
     * 绘制女皇冠
     */
    private drawQueenCrown(graphics: Graphics, size: number): void {
        // 弧形皇冠
        graphics.arc(0, -size * 0.2, size * 0.8, 0, Math.PI, false);
        graphics.stroke();

        // 装饰性尖顶
        for (let i = 0; i < 3; i++) {
            const x = -size * 0.4 + i * size * 0.4;
            graphics.moveTo(x, -size * 0.2);
            graphics.lineTo(x + size * 0.2, -size * 0.6);
            graphics.lineTo(x + size * 0.4, -size * 0.2);
            graphics.stroke();
        }

        // 装饰性圆点
        for (let i = 0; i < 5; i++) {
            const x = -size * 0.6 + i * size * 0.3;
            graphics.circle(x, -size * 0.1, size * 0.05);
            graphics.fill();
        }
    }

    /**
     * 绘制魔法师帽子
     */
    private drawWizardHat(graphics: Graphics, size: number): void {
        // 帽子主体（三角形）
        graphics.moveTo(-size * 0.6, size * 0.3);
        graphics.lineTo(0, -size * 0.8);
        graphics.lineTo(size * 0.6, size * 0.3);
        graphics.close();
        graphics.fill();

        // 帽子底部
        graphics.rect(-size * 0.7, size * 0.2, size * 1.4, size * 0.2);
        graphics.fill();

        // 装饰性星星
        graphics.circle(0, -size * 0.4, size * 0.08);
        graphics.fill();
    }

    /**
     * 绘制五角星
     */
    private drawStar(graphics: Graphics, size: number): void {
        const points = 5;
        const outerRadius = size * 0.8;
        const innerRadius = size * 0.4;

        graphics.moveTo(0, -outerRadius);

        for (let i = 1; i <= points * 2; i++) {
            const angle = (i * Math.PI) / points;
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const x = Math.sin(angle) * radius;
            const y = -Math.cos(angle) * radius;
            graphics.lineTo(x, y);
        }

        graphics.close();
        graphics.fill();
    }

    /**
     * 绘制盾牌
     */
    private drawShield(graphics: Graphics, size: number): void {
        // 盾牌主体（椭圆形）
        graphics.ellipse(0, 0, size * 0.8, size * 1.0);
        graphics.fill();

        // 盾牌边框
        graphics.ellipse(0, 0, size * 0.8, size * 1.0);
        graphics.stroke();

        // 盾牌内部装饰
        graphics.ellipse(0, 0, size * 0.4, size * 0.5);
        graphics.stroke();

        // 盾牌顶部装饰
        graphics.circle(0, -size * 0.7, size * 0.1);
        graphics.fill();
    }

    /**
     * 创建装饰元素（背景预制体）
     */
    private createDecorationElements(): void {
        const viewWidth = EDM.config.viewWidth;
        const viewHeight = EDM.config.viewHeight;

        for (let i = 0; i < this.rows; i++) {
            const rowNodes: Node[] = [];
            for (let u = 0; u < this.columns; u++) {
                // 随机选择一个背景预制体实例化
                const randomIndex = randomRangeInt(0, this.backgroundPrefabs.length);

                const backgroundNode = instantiate(this.backgroundPrefabs[randomIndex]);

                if (!backgroundNode) {
                    console.error('[Background] 背景预制体实例化失败，索引:', randomIndex);
                    continue;
                }

                backgroundNode.setParent(this.node);
                backgroundNode.layer = 33554432; // 确保子节点也是 UI_2D 层

                // 重置背景块的位置和大小
                backgroundNode.setPosition(0, 0, 0);

                // 设置背景块的大小
                const transform = backgroundNode.getComponent(UITransform) || backgroundNode.addComponent(UITransform);
                transform.setContentSize(this.nodeSize, this.nodeSize);

                // 计算装饰元素位置
                const x = (u - 1) * this.nodeSize; // 居中排列
                const y = (1 - i) * this.nodeSize;  // 从上到下排列

                backgroundNode.setPosition(x, y, 0);

                // 调整装饰元素的颜色以配合主题
                this.adjustDecorationColor(backgroundNode);

                rowNodes.push(backgroundNode);
            }

            this.instancedBackgrounds.push(rowNodes);
        }
    }

    /**
     * 调整装饰元素的颜色以配合主题色
     * @param decorationNode 装饰元素节点
     */
    private adjustDecorationColor(decorationNode: Node): void {
        // 遍历所有子节点，调整Sprite组件的颜色
        const adjustNodeColor = (node: Node) => {
            const sprite = node.getComponent(Sprite);
            if (sprite) {
                // 根据主题色调整装饰元素的颜色，使其更加协调
                // 使用更自然的颜色混合算法
                const themeInfluence = 0.15; // 降低主题色影响，保持装饰元素原有特征
                const adjustedColor = new Color(
                    Math.min(255, Math.max(0, sprite.color.r * (1 - themeInfluence) + this.currentThemeColor.r * themeInfluence)),
                    Math.min(255, Math.max(0, sprite.color.g * (1 - themeInfluence) + this.currentThemeColor.g * themeInfluence)),
                    Math.min(255, Math.max(0, sprite.color.b * (1 - themeInfluence) + this.currentThemeColor.b * themeInfluence)),
                    sprite.color.a
                );
                sprite.color = adjustedColor;
            }

            // 递归处理子节点
            for (const child of node.children) {
                adjustNodeColor(child);
            }
        };

        adjustNodeColor(decorationNode);
    }

    /**
     * 每帧调用，驱动背景滚动逻辑
     */
    public gameTick(): void {
        this.updateScrollingIcons();
        this.tryTileX();
        this.tryTileY();
    }

    /**
     * 每帧更新，调用滚动逻辑
     */
    update() {
        this.gameTick();
    }

    /**
     * 更新滚动图标的位置（整体平移，保证有序分布）
     */
    private updateScrollingIcons(): void {
        // 若关闭开关，隐藏所有图标
        if (!this.showScrollingIcons) {
            for (const row of this.iconNodes) {
                for (const iconNode of row) {
                    if (iconNode) iconNode.active = false;
                }
            }
            return;
        }
        // 分帧补全节点
        this.lazyCreateScrollingIcons();
        if (!this.iconGridReady) return;
        this.scrollOffset += this.scrollSpeed;
        if (this.scrollOffset >= this.iconSpacing) {
            this.scrollOffset -= this.iconSpacing;
        }
        const cos45 = 0.7071, sin45 = 0.7071;
        const rowCount = this.iconNodes.length;
        const colCount = this.iconNodes[0]?.length || 0;
        for (let row = 0; row < rowCount; row++) {
            for (let col = 0; col < colCount; col++) {
                const rowIdx = row - Math.floor(rowCount / 2);
                const colIdx = col - Math.floor(colCount / 2);
                const iconNode = this.iconNodes[row][col];
                if (!iconNode) continue;
                // 右上到左下方向（↙）
                let x = colIdx * this.iconSpacing * cos45 + rowIdx * this.iconSpacing * cos45 - this.scrollOffset * cos45;
                let y = colIdx * this.iconSpacing * sin45 - rowIdx * this.iconSpacing * sin45 - this.scrollOffset * sin45;
                iconNode.setPosition(x, y, 0);
                iconNode.active = true;
            }
        }
    }

    /**
     * 检查并处理X方向上的背景块平铺与循环
     */
    private tryTileX(): void {
        // 计算玩家当前所在的背景格子X坐标
        const playerGridPosX = Math.round((this.targetNode.worldPosition.x - EDM.config.viewWidth / 2) / this.nodeSize);

        if (playerGridPosX < this.playerGridPosX) {
            // 玩家向左移动，最右侧一列移到最左侧
            const columnIndex = this.columns - 1;
            for (let i = 0; i < this.rows; i++) {
                const instancedNode = this.instancedBackgrounds[i][columnIndex];
                const newPosition: Vec3 = instancedNode.worldPosition;
                newPosition.x -= this.columns * this.nodeSize;

                instancedNode.setWorldPosition(newPosition);

                this.instancedBackgrounds[i].splice(columnIndex, 1);
                this.instancedBackgrounds[i].unshift(instancedNode);
            }
        } else if (this.playerGridPosX < playerGridPosX) {
            // 玩家向右移动，最左侧一列移到最右侧
            const columnIndex = 0;
            for (let i = 0; i < this.rows; i++) {
                const instancedNode = this.instancedBackgrounds[i][columnIndex];
                const newPosition: Vec3 = instancedNode.worldPosition;
                newPosition.x += this.columns * this.nodeSize;

                instancedNode.setWorldPosition(newPosition);

                this.instancedBackgrounds[i].splice(columnIndex, 1);
                this.instancedBackgrounds[i].push(instancedNode);
            }
        }

        // 更新玩家所在格子X坐标
        this.playerGridPosX = playerGridPosX;
    }

    /**
     * 检查并处理Y方向上的背景块平铺与循环
     */
    private tryTileY(): void {
        // 计算玩家当前所在的背景格子Y坐标
        const playerGridPosY = Math.round((this.targetNode.worldPosition.y - EDM.config.viewHeight / 2) / this.nodeSize);

        if (playerGridPosY < this.playerGridPosY) {
            // 玩家向下移动，最下方一行移到最上方
            const rowIndex = this.rows - 1;
            const nodesInRow: Node[] = [];
            for (let i = 0; i < this.columns; i++) {
                const instancedNode = this.instancedBackgrounds[rowIndex][i];
                const newPosition: Vec3 = instancedNode.worldPosition;
                newPosition.y -= this.rows * this.nodeSize;

                instancedNode.setWorldPosition(newPosition);
                nodesInRow.push(instancedNode);
            }

            this.instancedBackgrounds.splice(rowIndex, 1);
            this.instancedBackgrounds.unshift(nodesInRow);
        } else if (this.playerGridPosY < playerGridPosY) {
            // 玩家向上移动，最上方一行移到最下方
            const rowIndex = 0;
            const nodesInRow: Node[] = [];
            for (let i = 0; i < this.columns; i++) {
                const instancedNode = this.instancedBackgrounds[rowIndex][i];
                const newPosition: Vec3 = instancedNode.worldPosition;
                newPosition.y += this.rows * this.nodeSize;

                instancedNode.setWorldPosition(newPosition);
                nodesInRow.push(instancedNode);
            }

            this.instancedBackgrounds.splice(rowIndex, 1);
            this.instancedBackgrounds.push(nodesInRow);
        }

        // 更新玩家所在格子Y坐标
        this.playerGridPosY = playerGridPosY;
    }

    /**
     * 动态改变背景主题
     * 可以在游戏过程中调用此方法来改变背景颜色
     */
    public changeBackgroundTheme(): void {
        // 生成新的随机主题色
        this.generateRandomThemeColor();

        // 重新创建滚动图标
        this.createScrollingIcons();

        // 重新调整所有装饰元素的颜色
        for (let i = 0; i < this.instancedBackgrounds.length; i++) {
            for (let j = 0; j < this.instancedBackgrounds[i].length; j++) {
                const decorationNode = this.instancedBackgrounds[i][j];
                if (decorationNode) {
                    this.adjustDecorationColor(decorationNode);
                }
            }
        }
    }
}
