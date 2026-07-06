// assets/scripts/levels/LevelConfiger.ts
import { SpriteFrame, Color } from 'cc';
import { PDM } from 'db://assets/utils/data/config/player/PlayerDataManager';
import { EDM } from 'db://assets/utils/data/env/ConfigManager';
import { loadResSingleAssetPromise } from 'db://assets/utils/subutils';

/**
 * 关卡配置器
 * 负责星球图片的预加载和管理
 */
export class LevelConfiger {
    // 星球图片资源路径
    private static readonly PLANET_PATHS: string[] = [];

    // 初始化星球路径数组
    private static initializePlanetPaths(): void {
        const levelHomePath = 'textures/ui/game/planets/';

        if (this.PLANET_PATHS.length > 0) return;

        // 可玩关卡从 1 开始：关卡1使用01.png，关卡2使用02.png，以此类推
        for (let i = 1; i <= 20; i++) {
            const num = i < 10 ? `0${i}` : `${i}`;
            this.PLANET_PATHS.push(`${levelHomePath}${num}/spriteFrame`);
        }

        if (EDM.isDev()) console.log(`[LevelConfiger] 初始化星球路径，共 ${this.PLANET_PATHS.length} 个关卡`);
    }

    // 预定义的星球颜色（备用方案）
    private static readonly PLANET_COLORS: Color[] = [
        new Color(255, 107, 107, 255), // 红色
        new Color(78, 205, 196, 255),  // 青色
        new Color(255, 209, 102, 255), // 黄色
        new Color(6, 214, 160, 255),   // 绿色
        new Color(17, 138, 178, 255),  // 蓝色
        new Color(7, 59, 76, 255),     // 深蓝
        new Color(239, 71, 111, 255),  // 粉色
        new Color(255, 158, 109, 255), // 橙色
        new Color(123, 223, 242, 255), // 浅蓝
        new Color(179, 136, 235, 255), // 紫色
    ];

    // 默认星球配置
    public static readonly DEFAULT_PLANET_CONFIG = {
        scale: 1.0,
        rotationSpeed: 10,      // 10度/秒
        floatAmplitude: 20,     // 20像素浮动
        floatSpeed: 1.5,        // 1.5秒完成一次浮动
    };

    private static loadedPlanets: Map<string, SpriteFrame> = new Map();
    private static isPreloading = false;
    private static isInitialized = false;

    /**
     * 初始化
     */
    public static init(): void {
        if (this.isInitialized) return;

        this.initializePlanetPaths();
        this.isInitialized = true;
        if (EDM.isDev()) console.log('[LevelConfiger] 初始化完成');
    }

    /**
     * 加载当前关卡的星球图片（优先级最高）
     */
    public static async loadCurrentPlanet(levelIndex: number): Promise<SpriteFrame | null> {
        if (!this.isInitialized) this.init();

        const path = this.getPlanetPath(levelIndex);

        // 如果已经加载，直接返回
        if (this.loadedPlanets.has(path)) {
            if (EDM.isDev()) console.log(`[LevelConfiger] 图片已加载，直接返回: ${path}`);
            return this.loadedPlanets.get(path) || null;
        }

        if (EDM.isDev()) console.log(`[LevelConfiger] 开始加载当前关卡图片: 关卡${levelIndex}, 路径: ${path}`);

        try {
            const asset = await loadResSingleAssetPromise(path);

            if (asset && asset instanceof SpriteFrame) {
                this.loadedPlanets.set(path, asset);
                if (EDM.isDev()) console.log(`[LevelConfiger] 当前关卡图片加载成功: ${path}, 尺寸: ${asset.width}x${asset.height}`);

                // 延迟开始异步预加载其他关卡，避免影响当前显示
                setTimeout(() => {
                    this.startAsyncPreload();
                }, 1000); // 延迟1秒开始异步加载

                return asset;
            } else {
                if (EDM.isDev()) console.warn(`[LevelConfiger] 当前关卡图片加载失败: ${path}, asset: ${asset}`);
                return null;
            }
        } catch (error) {
            if (EDM.isDev()) console.warn(`[LevelConfiger] 加载当前关卡图片异常: ${path}`, error);
            return null;
        }
    }

    /**
     * 开始异步预加载其他关卡图片
     */
    public static async startAsyncPreload(): Promise<void> {
        if (this.isPreloading) {
            if (EDM.isDev()) console.log('[LevelConfiger] 已在异步预加载中...');
            return;
        }

        this.isPreloading = true;

        // 使用setTimeout异步执行，不阻塞主线程
        setTimeout(async () => {
            if (EDM.isDev()) console.log('[LevelConfiger] 开始异步预加载其他关卡图片...');

            try {
                // 计算需要预加载的关卡索引
                const total = this.PLANET_PATHS.length;
                const indicesToPreload: number[] = [];

                // 预加载前后各2个关卡
                for (let i = 1; i <= 2; i++) {
                    indicesToPreload.push(this.getWrappedLevelNumber(PDM.getCurrentLevel() + i, total));
                    indicesToPreload.push(this.getWrappedLevelNumber(PDM.getCurrentLevel() - i, total));
                }

                // 去重
                const uniqueIndices = [...new Set(indicesToPreload)];

                for (const index of uniqueIndices) {
                    const path = this.getPlanetPath(index);

                    // 跳过已经加载的
                    if (this.loadedPlanets.has(path)) continue;

                    try {
                        const asset = await loadResSingleAssetPromise(path);
                        if (asset && asset instanceof SpriteFrame) {
                            this.loadedPlanets.set(path, asset);
                            if (EDM.isDev()) console.log(`[LevelConfiger] 异步预加载成功: ${path}`);
                        }
                    } catch (error) {
                        // 异步加载失败不报错，静默处理
                    }

                    // 每个资源加载后等待一下，避免卡顿
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                if (EDM.isDev()) console.log(`[LevelConfiger] 异步预加载完成，已加载 ${this.loadedPlanets.size}/${total} 张图片`);

            } catch (error) {
                if (EDM.isDev()) console.error('[LevelConfiger] 异步预加载过程发生异常:', error);
            } finally {
                this.isPreloading = false;
            }
        }, 1000); // 延迟1秒开始异步加载
    }

    /**
     * 获取星球配置
     */
    public static getPlanetConfig(levelIndex: number): any {
        const planetIndex = this.getPlanetArrayIndex(levelIndex);
        return {
            ...this.DEFAULT_PLANET_CONFIG,
            scale: 0.8 + (planetIndex % 4) * 0.1,
            rotationSpeed: 5 + (planetIndex % 6) * 2,
            // floatAmplitude: 15 + (planetIndex % 5) * 5,
            floatAmplitude: 10 + (planetIndex % 5) * 5,
            floatSpeed: 1.0 + (planetIndex % 5) * 0.3,
        };
    }

    /**
     * 获取星球颜色
     */
    public static getPlanetColor(levelIndex: number): Color {
        const planetIndex = this.getPlanetArrayIndex(levelIndex) % this.PLANET_COLORS.length;
        return this.PLANET_COLORS[planetIndex];
    }

    /**
     * 获取已加载的星球图片
     */
    public static getPlanetSpriteFrame(levelIndex: number): SpriteFrame | null {
        try {
            const path = this.getPlanetPath(levelIndex);
            return this.loadedPlanets.get(path) || null;
        } catch (error) {
            if (EDM.isDev()) console.warn('[LevelConfiger] 获取星球图片失败:', error);
            return null;
        }
    }

    /**
     * 获取星球路径
     * 可玩关卡从 1 开始：关卡1使用01.png，关卡2使用02.png，以此类推
     */
    private static getPlanetPath(levelIndex: number): string {
        if (!this.isInitialized) this.init();

        const planetIndex = this.getPlanetArrayIndex(levelIndex);
        return this.PLANET_PATHS[planetIndex];
    }

    private static getPlanetArrayIndex(levelIndex: number): number {
        const total = this.PLANET_PATHS.length || 20;
        const normalizedLevel = this.getWrappedLevelNumber(levelIndex, total);
        return (normalizedLevel - 1) % total;
    }

    private static getWrappedLevelNumber(levelIndex: number, total: number): number {
        const numericLevel = Math.floor(Number(levelIndex) || 1);
        return ((numericLevel - 1) % total + total) % total + 1;
    }

    /**
     * 清理缓存
     */
    public static clearCache(): void {
        try {
            this.loadedPlanets.clear();
            this.isInitialized = false;
            this.isPreloading = false;
            if (EDM.isDev()) console.log('[LevelConfiger] 已清理星球图片缓存');
        } catch (error) {
            if (EDM.isDev()) console.warn('[LevelConfiger] 清理缓存失败:', error);
        }
    }
}
