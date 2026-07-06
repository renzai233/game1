import { _decorator, assetManager, JsonAsset, Prefab, Texture2D, AudioClip, SpriteFrame, instantiate, director } from 'cc';
import { ShopManager } from '../../../shop';
import { HDM } from '../hero/HeroDataManager';
import { BAG_ITEMS_CONFIG } from 'db://assets/script/bag/BagConfig';
const { ccclass, property } = _decorator;

export enum ResourcePriority {
    CRITICAL = 0,
    HIGH = 1,
    NORMAL = 2,
    LOW = 3
}

export interface IPreloadTask {
    path: string;
    type: ResourceType;
    bundleName?: string;
    priority: ResourcePriority;
    retryCount?: number;
    maxRetries?: number;
}

export interface IPreloadProgress {
    total: number;
    loaded: number;
    failed: number;
    percentage: number;
    currentTask?: string;
}

// 定义支持的资源类型枚举
export enum ResourceType {
    JSON = 'json',
    PREFAB = 'prefab',
    TEXTURE = 'texture',
    AUDIO_CLIP = 'audioClip',
    SPRITE_FRAME = 'spriteFrame',
    // 可以根据需要扩展其他类型
}

// 定义资源类型与Cocos Creator资源类的映射
// 使用更明确的类型声明，避免TypeScript类型推断问题
interface IAssetClassMap {
    [ResourceType.JSON]: typeof JsonAsset;
    [ResourceType.PREFAB]: typeof Prefab;
    [ResourceType.TEXTURE]: typeof Texture2D;
    [ResourceType.AUDIO_CLIP]: typeof AudioClip;
    [ResourceType.SPRITE_FRAME]: typeof SpriteFrame;
}

// 创建资源类型到资源类的映射表
const ResourceTypeToAssetClass: IAssetClassMap = {
    [ResourceType.JSON]: JsonAsset,
    [ResourceType.PREFAB]: Prefab,
    [ResourceType.TEXTURE]: Texture2D,
    [ResourceType.AUDIO_CLIP]: AudioClip,
    [ResourceType.SPRITE_FRAME]: SpriteFrame,
};

// 通过路径后缀自动推断资源类型
function inferResourceType(path: string): ResourceType {
    const ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
    const typeMap: { [key: string]: ResourceType } = {
        'json': ResourceType.JSON,
        'prefab': ResourceType.PREFAB,
        'png': ResourceType.SPRITE_FRAME, // 注意：图片通常加载为SpriteFrame
        'jpg': ResourceType.SPRITE_FRAME,
        'jpeg': ResourceType.SPRITE_FRAME,
        'mp3': ResourceType.AUDIO_CLIP,
        'wav': ResourceType.AUDIO_CLIP,
        'ogg': ResourceType.AUDIO_CLIP,
    };
    return typeMap[ext] || ResourceType.JSON; // 默认回退到JSON
}

// 资源缓存项的类型定义
interface ResourceCacheItem {
    asset: any; // 实际资源对象
    refCount: number; // 引用计数
    bundleName?: string; // 所属Bundle
    type: ResourceType;
}

@ccclass('ResourceManager')
export class ResourceManager {
    private static _instance: ResourceManager;

    // 资源缓存
    private _resourceCache: Map<string, ResourceCacheItem> = new Map();

    // Bundle缓存
    private _bundleCache: Map<string, any> = new Map();

    // 加载中队列，防止重复请求
    private _loadingPromises: Map<string, Promise<any>> = new Map();

    // 预加载任务队列（按优先级分组）
    private _preloadQueue: Map<ResourcePriority, IPreloadTask[]> = new Map([
        [ResourcePriority.CRITICAL, []],
        [ResourcePriority.HIGH, []],
        [ResourcePriority.NORMAL, []],
        [ResourcePriority.LOW, []]
    ]);

    // 预加载进度
    private _preloadProgress: IPreloadProgress = {
        total: 0,
        loaded: 0,
        failed: 0,
        percentage: 0
    };

    // 预加载进度回调
    private _progressCallbacks: Set<(progress: IPreloadProgress) => void> = new Set();

    // 预加载是否正在运行
    private _isPreloading: boolean = false;

    // 最大并发加载数
    private readonly MAX_CONCURRENT_LOADS = 3;

    // 当前并发加载数
    private _currentConcurrentLoads = 0;

    // 懒加载资源注册表
    private _lazyLoadRegistry: Map<string, IPreloadTask> = new Map();

    // 懒加载是否已启用
    private _lazyLoadEnabled: boolean = true;

    // 资源预加载配置
    private _preloadConfig: any = null;

    // 获取单例
    static getInstance(): ResourceManager {
        if (!ResourceManager._instance) {
            ResourceManager._instance = new ResourceManager();
        }
        return ResourceManager._instance;
    }

    /**
     * 初始化资源预加载配置
     */
    public initPreloadConfig(config: any): void {
        this._preloadConfig = config;

        if (config) {
            if (config.maxConcurrentLoads) {
                (this as any).MAX_CONCURRENT_LOADS = config.maxConcurrentLoads;
            }

            if (typeof config.enableLazyLoad === 'boolean') {
                this._lazyLoadEnabled = config.enableLazyLoad;
            }

            console.log('[ResourceManager] 资源预加载配置已初始化', config);
        }
    }

    /**
     * 核心：统一资源加载方法
     * @param path 资源路径，如 "ui/panel/HomePanel"
     * @param type 资源类型。如不指定，则根据路径推断
     * @param bundleName 所在Asset Bundle名称，不传则从'resources'或主包加载
     */
    public async load<T>(path: string, type?: ResourceType, bundleName?: string): Promise<T> {
        const inferredType = type || inferResourceType(path);
        const cacheKey = this._getCacheKey(path, bundleName);

        // 1. 检查缓存
        const cachedItem = this._resourceCache.get(cacheKey);
        if (cachedItem && cachedItem.asset) {
            cachedItem.refCount++; // 增加引用计数
            console.log(`[ResourceManager] 从缓存读取 (ref=${cachedItem.refCount}): ${cacheKey}`);
            return cachedItem.asset as T;
        }

        // 2. 防重复加载
        if (this._loadingPromises.has(cacheKey)) {
            console.log(`[ResourceManager] 等待已存在的加载请求: ${cacheKey}`);
            return this._loadingPromises.get(cacheKey) as Promise<T>;
        }

        // 3. 执行加载
        const loadPromise = this._doLoad(path, inferredType, bundleName, cacheKey);
        this._loadingPromises.set(cacheKey, loadPromise);

        try {
            const asset = await loadPromise;
            return asset as T;
        } finally {
            this._loadingPromises.delete(cacheKey);
        }
    }

    // 专门加载JSON配置的便捷方法
    public async loadConfig<T>(configPath: string, bundleName?: string): Promise<T> {
        const jsonAsset = await this.load<JsonAsset>(configPath, ResourceType.JSON, bundleName);
        // 这里可以加入数据校验和转换逻辑
        return this._validateAndTransform<T>(jsonAsset.json, configPath);
    }

    private async _doLoad(path: string, type: ResourceType, bundleName: string | undefined, cacheKey: string): Promise<any> {
        try {
            let bundle: any = null;
            const assetClass = ResourceTypeToAssetClass[type];

            if (!assetClass) {
                throw new Error(`不支持的资源类型: ${type}`);
            }

            // 获取或加载Bundle
            if (bundleName) {
                bundle = await this._getBundle(bundleName);
            }

            // 实际加载资源
            let asset: any;
            if (bundle) {
                asset = await this._loadFromBundle(bundle, path, assetClass);
            } else {
                // 智能判断资源位置：textures 资源在 res bundle 中，其他在 resources bundle 中
                if (path.startsWith('textures/')) {
                    asset = await this._loadFromResBundle(path, assetClass);
                } else {
                    asset = await this._loadFromResources(path, assetClass);
                }
            }

            // 存入缓存
            this._resourceCache.set(cacheKey, {
                asset: asset,
                refCount: 1,
                bundleName: bundleName,
                type: type
            });

            console.log(`[ResourceManager] 资源加载并缓存成功: ${cacheKey}`);
            return asset;

        } catch (error) {
            console.error(`[ResourceManager] 资源加载失败: ${cacheKey}`, error);
            // 可以在这里触发全局错误事件，或返回兜底资源
            throw error;
        }
    }

    private async _getBundle(bundleName: string): Promise<any> {
        let bundle = this._bundleCache.get(bundleName);
        if (!bundle) {
            bundle = await new Promise((resolve, reject) => {
                assetManager.loadBundle(bundleName, (err: Error | null, b: any) => {
                    if (err || !b) {
                        reject(err || new Error(`Bundle加载失败: ${bundleName}`));
                    } else {
                        resolve(b);
                    }
                });
            });
            this._bundleCache.set(bundleName, bundle);
        }
        return bundle;
    }

    private async _loadFromBundle(bundle: any, path: string, assetClass: any): Promise<any> {
        return new Promise((resolve, reject) => {
            bundle.load(path, assetClass, (err: Error | null, asset: any) => {
                if (err || !asset) {
                    reject(err || new Error(`资源从Bundle加载失败: ${path}`));
                } else {
                    resolve(asset);
                }
            });
        });
    }

    private async _loadFromResources(path: string, assetClass: any): Promise<any> {
        return new Promise((resolve, reject) => {
            assetManager.resources.load(path, assetClass, (err: Error | null, asset: any) => {
                if (err || !asset) {
                    reject(err || new Error(`资源从Resources加载失败: ${path}`));
                } else {
                    resolve(asset);
                }
            });
        });
    }

    private async _loadFromResBundle(path: string, assetClass: any): Promise<any> {
        try {
            const bundle = await this._getBundle('res');
            return new Promise((resolve, reject) => {
                bundle.load(path, assetClass, (err: Error | null, asset: any) => {
                    if (err || !asset) {
                        reject(err || new Error(`资源从res bundle加载失败: ${path}`));
                    } else {
                        resolve(asset);
                    }
                });
            });
        } catch (error) {
            throw new Error(`res bundle加载失败: ${error}`);
        }
    }

    private _getCacheKey(path: string, bundleName?: string): string {
        return bundleName ? `${bundleName}:${path}` : `main:${path}`;
    }

    // 保留之前的配置校验和转换逻辑
    private _validateAndTransform<T>(rawData: any, configPath: string): T {
        // 不再自动转换数组为字典，保持原始数据格式
        return rawData as T;
    }

    /**
     * 释放资源引用。当引用计数为0时，从缓存中移除并销毁资源。
     * @param path 资源路径
     * @param bundleName 所属Bundle名
     * @param force 是否强制释放，无视引用计数
     */
    public release(path: string, bundleName?: string, force: boolean = false): void {
        const cacheKey = this._getCacheKey(path, bundleName);
        const item = this._resourceCache.get(cacheKey);

        if (!item) return;

        item.refCount--;

        if (force || item.refCount <= 0) {
            // 销毁资源
            const asset = item.asset;
            if (asset && typeof asset.destroy === 'function') {
                asset.destroy();
            }
            this._resourceCache.delete(cacheKey);
            console.log(`[ResourceManager] 资源已释放: ${cacheKey}`);
        } else {
            console.log(`[ResourceManager] 资源引用减少 (ref=${item.refCount}): ${cacheKey}`);
        }
    }

    /**
     * 预加载一个资源Bundle（用于进入场景前提前加载）
     */
    public async preloadBundle(bundleName: string): Promise<void> {
        if (this._bundleCache.has(bundleName)) {
            return;
        }
        try {
            const bundle = await this._getBundle(bundleName);
            console.log(`[ResourceManager] Bundle预加载成功: ${bundleName}`);
        } catch (error) {
            console.warn(`[ResourceManager] Bundle预加载失败: ${bundleName}`, error);
        }
    }

    /**
     * 清理整个Bundle的缓存（切换大场景时调用）
     */
    public releaseBundle(bundleName: string): void {
        // 释放该Bundle下的所有资源
        const keysToDelete: string[] = [];
        for (const [key, item] of this._resourceCache.entries()) {
            if (item.bundleName === bundleName) {
                keysToDelete.push(key);
            }
        }

        keysToDelete.forEach(key => {
            const item = this._resourceCache.get(key);
            if (item) {
                const asset = item.asset;
                if (asset && typeof asset.destroy === 'function') {
                    asset.destroy();
                }
                this._resourceCache.delete(key);
            }
        });

        // 释放Bundle引用
        const bundle = this._bundleCache.get(bundleName);
        if (bundle) {
            // 注意：在Cocos Creator中，通常不需要手动释放Bundle
            // 除非你知道这个Bundle不会再被使用
            this._bundleCache.delete(bundleName);
            console.log(`[ResourceManager] Bundle缓存已移除: ${bundleName}`);
        }
    }

    /**
     * 获取缓存统计信息（用于调试）
     */
    public getCacheStats(): { total: number, byType: Record<string, number> } {
        const byType: Record<string, number> = {};
        let total = 0;

        for (const item of this._resourceCache.values()) {
            total++;
            const typeStr = item.type.toString();
            byType[typeStr] = (byType[typeStr] || 0) + 1;
        }

        return { total, byType };
    }

    /**
     * 预加载面板资源
     * 用于在进入主页后预加载导航栏面板的资源，避免点击时重复加载
     */
    public async preloadPanelResources(): Promise<void> {
        console.log('[ResourceManager] 开始预加载面板资源...');

        try {
            await this.addPreloadTasks();
            await this.startPreloading();

            console.log('[ResourceManager] 面板资源预加载完成');
        } catch (error) {
            console.error('[ResourceManager] 面板资源预加载失败:', error);
        }
    }

    /**
     * 添加预加载任务到队列
     */
    private async addPreloadTasks(): Promise<void> {
        try {
            const heroes = HDM.getHeroList();

            heroes.forEach((hero: any) => {
                if (hero && hero.id) {
                    const portraitPath = HDM.getHeroPathById(hero.id, 'portrait');
                    if (portraitPath) {
                        this.addPreloadTask({
                            path: portraitPath,
                            type: ResourceType.SPRITE_FRAME,
                            bundleName: 'res',
                            priority: ResourcePriority.HIGH,
                            maxRetries: 2
                        });
                    }
                }
            });

            BAG_ITEMS_CONFIG.forEach((item: any) => {
                if (item && item.icon) {
                    this.addPreloadTask({
                        path: item.icon,
                        type: ResourceType.SPRITE_FRAME,
                        bundleName: 'res',
                        priority: ResourcePriority.NORMAL,
                        maxRetries: 1
                    });
                }
            });

            console.log(`[ResourceManager] 已添加预加载任务到队列`);
        } catch (error) {
            console.error('[ResourceManager] 添加预加载任务失败:', error);
        }
    }

    /**
     * 添加单个预加载任务
     */
    public addPreloadTask(task: IPreloadTask): void {
        const queue = this._preloadQueue.get(task.priority);
        if (queue) {
            queue.push(task);
            this._preloadProgress.total++;
            this._updateProgress();
        }
    }

    /**
     * 开始预加载
     */
    public async startPreloading(): Promise<void> {
        if (this._isPreloading) {
            console.warn('[ResourceManager] 预加载已在进行中');
            return;
        }

        this._isPreloading = true;
        this._resetProgress();

        console.log('[ResourceManager] 开始执行预加载任务...');

        try {
            await this._processPreloadQueue();
            console.log('[ResourceManager] 预加载任务全部完成');
        } catch (error) {
            console.error('[ResourceManager] 预加载任务执行失败:', error);
        } finally {
            this._isPreloading = false;
        }
    }

    /**
     * 处理预加载队列
     */
    private async _processPreloadQueue(): Promise<void> {
        const priorities = [
            ResourcePriority.CRITICAL,
            ResourcePriority.HIGH,
            ResourcePriority.NORMAL,
            ResourcePriority.LOW
        ];

        for (const priority of priorities) {
            const queue = this._preloadQueue.get(priority);
            if (!queue || queue.length === 0) continue;

            console.log(`[ResourceManager] 开始处理优先级 ${priority} 的任务 (${queue.length} 个)`);

            await this._processQueueWithConcurrency(queue);
        }
    }

    /**
     * 使用并发控制处理队列
     */
    private async _processQueueWithConcurrency(queue: IPreloadTask[]): Promise<void> {
        const promises: Promise<void>[] = [];

        for (const task of queue) {
            while (this._currentConcurrentLoads >= this.MAX_CONCURRENT_LOADS) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            this._currentConcurrentLoads++;
            this._preloadProgress.currentTask = task.path;
            this._updateProgress();

            const promise = this._loadPreloadTask(task).finally(() => {
                this._currentConcurrentLoads--;
            });

            promises.push(promise);
        }

        await Promise.all(promises);
    }

    /**
     * 加载单个预加载任务
     */
    private async _loadPreloadTask(task: IPreloadTask): Promise<void> {
        const cacheKey = this._getCacheKey(task.path, task.bundleName);

        if (this._resourceCache.has(cacheKey)) {
            this._preloadProgress.loaded++;
            this._updateProgress();
            return;
        }

        try {
            await this.load(task.path, task.type, task.bundleName);
            this._preloadProgress.loaded++;
            console.log(`[ResourceManager] 预加载成功: ${task.path}`);
        } catch (error) {
            task.retryCount = (task.retryCount || 0) + 1;
            const maxRetries = task.maxRetries || 0;

            if (task.retryCount <= maxRetries) {
                console.warn(`[ResourceManager] 预加载失败，重试 (${task.retryCount}/${maxRetries}): ${task.path}`, error);
                await new Promise(resolve => setTimeout(resolve, 100 * task.retryCount));
                await this._loadPreloadTask(task);
            } else {
                console.error(`[ResourceManager] 预加载失败，已达最大重试次数: ${task.path}`, error);
                this._preloadProgress.failed++;
            }
        } finally {
            this._updateProgress();
        }
    }

    /**
     * 重置预加载进度
     */
    private _resetProgress(): void {
        this._preloadProgress = {
            total: 0,
            loaded: 0,
            failed: 0,
            percentage: 0
        };

        for (const queue of this._preloadQueue.values()) {
            this._preloadProgress.total += queue.length;
        }

        this._updateProgress();
    }

    /**
     * 更新预加载进度
     */
    private _updateProgress(): void {
        const total = this._preloadProgress.total;
        if (total > 0) {
            this._preloadProgress.percentage = Math.floor(
                ((this._preloadProgress.loaded + this._preloadProgress.failed) / total) * 100
            );
        }

        this._progressCallbacks.forEach(callback => {
            try {
                callback({ ...this._preloadProgress });
            } catch (error) {
                console.error('[ResourceManager] 进度回调执行失败:', error);
            }
        });
    }

    /**
     * 注册预加载进度回调
     */
    public onPreloadProgress(callback: (progress: IPreloadProgress) => void): void {
        this._progressCallbacks.add(callback);
    }

    /**
     * 移除预加载进度回调
     */
    public offPreloadProgress(callback: (progress: IPreloadProgress) => void): void {
        this._progressCallbacks.delete(callback);
    }

    /**
     * 获取当前预加载进度
     */
    public getPreloadProgress(): IPreloadProgress {
        return { ...this._preloadProgress };
    }

    /**
     * 清空预加载队列
     */
    public clearPreloadQueue(): void {
        for (const priority of Object.values(ResourcePriority)) {
            const queue = this._preloadQueue.get(priority as ResourcePriority);
            if (queue) {
                queue.length = 0;
            }
        }
        this._resetProgress();
        console.log('[ResourceManager] 预加载队列已清空');
    }

    /**
     * 标记资源为持久化，防止被意外释放
     * 用于预加载的面板资源，确保切换场景时不会被销毁
     */
    public markResourceAsPersistent(path: string, bundleName?: string): void {
        const cacheKey = this._getCacheKey(path, bundleName);
        const item = this._resourceCache.get(cacheKey);

        if (item) {
            item.refCount = Number.MAX_SAFE_INTEGER;
            console.log(`[ResourceManager] 资源已标记为持久化: ${cacheKey}`);
        }
    }

    /**
     * 注册懒加载资源
     * 资源不会立即加载，而是在首次访问时才加载
     */
    public registerLazyLoad(
        path: string,
        type: ResourceType,
        bundleName?: string,
        priority: ResourcePriority = ResourcePriority.LOW
    ): void {
        const cacheKey = this._getCacheKey(path, bundleName);
        
        if (this._lazyLoadRegistry.has(cacheKey)) {
            console.warn(`[ResourceManager] 懒加载资源已注册: ${cacheKey}`);
            return;
        }

        this._lazyLoadRegistry.set(cacheKey, {
            path,
            type,
            bundleName,
            priority,
            maxRetries: 1
        });

        console.log(`[ResourceManager] 已注册懒加载资源: ${cacheKey}`);
    }

    /**
     * 批量注册懒加载资源
     */
    public registerLazyLoads(tasks: Array<{ path: string; type: ResourceType; bundleName?: string; priority?: ResourcePriority }>): void {
        tasks.forEach(task => {
            this.registerLazyLoad(task.path, task.type, task.bundleName, task.priority);
        });
    }

    /**
     * 触发懒加载
     * 当资源被实际需要时，调用此方法加载资源
     */
    public async triggerLazyLoad(path: string, bundleName?: string): Promise<void> {
        if (!this._lazyLoadEnabled) {
            return;
        }

        const cacheKey = this._getCacheKey(path, bundleName);
        const task = this._lazyLoadRegistry.get(cacheKey);

        if (!task) {
            console.warn(`[ResourceManager] 懒加载资源未注册: ${cacheKey}`);
            return;
        }

        if (this._resourceCache.has(cacheKey)) {
            console.log(`[ResourceManager] 懒加载资源已缓存: ${cacheKey}`);
            return;
        }

        try {
            console.log(`[ResourceManager] 开始懒加载: ${cacheKey}`);
            await this.load(task.path, task.type, task.bundleName);
            console.log(`[ResourceManager] 懒加载成功: ${cacheKey}`);
        } catch (error) {
            console.error(`[ResourceManager] 懒加载失败: ${cacheKey}`, error);
            throw error;
        }
    }

    /**
     * 启用/禁用懒加载
     */
    public setLazyLoadEnabled(enabled: boolean): void {
        this._lazyLoadEnabled = enabled;
        console.log(`[ResourceManager] 懒加载已${enabled ? '启用' : '禁用'}`);
    }

    /**
     * 预加载所有懒加载资源
     * 用于在适当的时机（如网络环境良好时）预加载懒加载资源
     */
    public async preloadAllLazyResources(): Promise<void> {
        if (this._lazyLoadRegistry.size === 0) {
            console.log('[ResourceManager] 没有懒加载资源需要预加载');
            return;
        }

        console.log(`[ResourceManager] 开始预加载所有懒加载资源 (${this._lazyLoadRegistry.size} 个)`);

        const tasks: Promise<void>[] = [];

        for (const [cacheKey, task] of this._lazyLoadRegistry.entries()) {
            if (!this._resourceCache.has(cacheKey)) {
                tasks.push(
                    this.load(task.path, task.type, task.bundleName)
                        .then(() => {
                            console.log(`[ResourceManager] 懒加载资源预加载成功: ${cacheKey}`);
                        })
                        .catch((error) => {
                            console.error(`[ResourceManager] 懒加载资源预加载失败: ${cacheKey}`, error);
                        })
                );
            }
        }

        await Promise.all(tasks);
        console.log('[ResourceManager] 所有懒加载资源预加载完成');
    }

    /**
     * 获取懒加载资源统计信息
     */
    public getLazyLoadStats(): { total: number; loaded: number; pending: number } {
        let loaded = 0;
        let pending = 0;

        for (const [cacheKey] of this._lazyLoadRegistry.entries()) {
            if (this._resourceCache.has(cacheKey)) {
                loaded++;
            } else {
                pending++;
            }
        }

        return {
            total: this._lazyLoadRegistry.size,
            loaded,
            pending
        };
    }

    /**
     * 清空懒加载注册表
     */
    public clearLazyLoadRegistry(): void {
        this._lazyLoadRegistry.clear();
        console.log('[ResourceManager] 懒加载注册表已清空');
    }
}

// 导出单例访问的便捷函数
export function resManager(): ResourceManager {
    return ResourceManager.getInstance();
}