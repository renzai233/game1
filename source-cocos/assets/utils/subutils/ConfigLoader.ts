// utils/ConfigLoader.ts
import { _decorator, resources, JsonAsset } from 'cc';

const { ccclass } = _decorator;

@ccclass('ConfigLoader')
export class ConfigLoader {
    private static _configCache: Map<string, any> = new Map();

    /**
     * 加载JSON配置
     * @param path resources下的路径（不含后缀）
     */
    public static async loadConfig<T>(path: string): Promise<T> {
        // 检查缓存
        if (this._configCache.has(path)) {
            return this._configCache.get(path) as T;
        }

        return new Promise<T>((resolve, reject) => {
            resources.load(path, JsonAsset, (err: any, jsonAsset: JsonAsset) => {
                if (err) {
                    reject(err);
                    return;
                }

                const config = jsonAsset.json as T;
                this._configCache.set(path, config);
                resolve(config);
            });
        });
    }

    /**
     * 清除缓存
     * @param path 路径（可选），不传则清除所有缓存
     */
    public static clearCache(path?: string): void {
        if (path) {
            this._configCache.delete(path);
        } else {
            this._configCache.clear();
        }
    }

    /**
     * 重新加载配置
     */
    public static async reloadConfig<T>(path: string): Promise<T> {
        this.clearCache(path);
        return this.loadConfig<T>(path);
    }
}