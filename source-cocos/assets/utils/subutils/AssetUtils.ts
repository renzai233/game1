/**
 * 资源加载相关工具函数
 */
import { Asset, resources, SpriteFrame, Rect, Prefab, assetManager, AudioClip, error, warn } from "cc";

/**
 * 加载resources目录下的资源
 * @param path 资源路径
 * @param callback 回调函数
 * @param type 资源类型，不传则自动判断
 */
export const loadAsset = (path: string, callback: (data: Asset | null) => void, type: any = null): void => {
    if (!path) {
        console.warn('[loadAsset] path 参数为空或undefined');
        callback && callback(null);
        return;
    }

    let assetType = type;
    if (!assetType) {
        if (path.endsWith('.prefab') || path.includes('prefab/')) {
            assetType = Prefab;
        } else {
            assetType = SpriteFrame;
        }
    }

    resources.load(path, assetType, (err: Error, data: Asset) => {
        if (err) {
            console.log(err);
            callback && callback(null);
            return;
        }
        callback && callback(data);
    });
};

/**
 * 加载分包中的单个资源
 * @param path 资源路径
 * @param callback 回调函数
 * @param type 资源类型，不传则自动判断
 */
export const loadResSingleAsset = (path: string, callback: (data: Asset | null) => void, type: any = null): void => {
    if (!path) {
        console.warn('[loadResSingleAsset] path 参数为空或undefined');
        callback && callback(null);
        return;
    }

    let assetType = type;
    if (!assetType) {
        if (path.endsWith('.prefab') || path.includes('prefab/')) {
            assetType = Prefab;
        } else if (path.endsWith('.mp3') || path.endsWith('.wav') || path.endsWith('.ogg') || path.endsWith('.m4a')) {
            assetType = AudioClip;
        } else {
            assetType = SpriteFrame;
        }
    }

    assetManager.loadBundle('res', (err, bundle) => {
        if (err) {
            error('分包加载失败:', err);
            callback && callback(null);
            return;
        }

        try {
            bundle.load(path, assetType, (err: Error, data: Asset) => {
                if (err) {
                    warn(`[loadResSingleAsset] 资源加载失败（非致命）: ${path}`, err.message);
                    callback && callback(null);
                    return;
                }
                callback && callback(data);
            });
        } catch (syncErr: any) {
            warn(`[loadResSingleAsset] 资源加载同步错误（非致命）: ${path}`, syncErr.message);
            callback && callback(null);
        }
    });
};

/**
 * 将回调式的loadResSingleAsset包装为Promise版本
 * @param path 资源路径
 * @param type 资源类型
 * @returns Promise<Asset | null>
 */
export const loadResSingleAssetPromise = (path: string, type: any = null): Promise<Asset | null> => {
    return new Promise((resolve) => {
        try {
            loadResSingleAsset(path, (data: Asset | null) => {
                resolve(data);
            }, type);
        } catch (err) {
            warn(`[loadResSingleAssetPromise] 执行异常: ${path}`, err);
            resolve(null);
        }
    });
};

/**
 * 加载并分割图集资源
 * @param path 资源路径
 * @param config 配置对象
 * @param callback 回调函数
 */
export const loadResAsset = (path: string, config: any, callback: (spriteFrames: SpriteFrame[] | null) => void): void => {
    if (!path) {
        console.warn('[loadResAsset] path 参数为空或undefined');
        callback && callback(null);
        return;
    }

    if (!config) {
        console.warn('[loadResAsset] config 参数为空或undefined');
        callback && callback(null);
        return;
    }

    assetManager.loadBundle('res', (err, bundle) => {
        if (err) {
            console.error('分包加载失败:', err);
            callback && callback(null);
            return;
        }

        bundle.load(path, SpriteFrame, (err: Error, data: Asset) => {
            if (err) {
                console.error('[loadResAsset] 加载资源失败:', err);
                callback && callback(null);
                return;
            }

            if (!data) {
                console.error('[loadResAsset] 加载的资源数据为空', path);
                callback && callback(null);
                return;
            }

            const spriteFrames = splitTextureToSpriteFrames(data as any, config);
            callback && callback(spriteFrames);
        });
    });
};

/**
 * 加载resources目录下的图集资源并分割
 * @param path 资源路径
 * @param config 配置对象
 * @param callback 回调函数
 */
export const loadAtlasAsset = (path: string, config: any, callback: (spriteFrames: SpriteFrame[] | null) => void): void => {
    if (!path) {
        console.error('[loadAtlasAsset] path 参数为空或undefined');
        callback && callback(null);
        return;
    }

    if (!config) {
        console.error('[loadAtlasAsset] config 参数为空', path);
        callback && callback(null);
        return;
    }

    resources.load(path, SpriteFrame, (err: Error, data: Asset) => {
        if (err) {
            console.error('[loadAtlasAsset] 加载资源失败:', err);
            callback && callback(null);
            return;
        }

        if (!data) {
            console.error('[loadAtlasAsset] 加载的资源数据为空', path);
            callback && callback(null);
            return;
        }

        const spriteFrames = splitTextureToSpriteFrames(data as any, config);
        callback && callback(spriteFrames);
    });
};

/**
 * 将纹理分割为多个SpriteFrame
 * @param texture 纹理
 * @param config 配置对象
 * @returns SpriteFrame数组或null
 */
const splitTextureToSpriteFrames = (texture: any, config: any): SpriteFrame[] | null => {
    if (!config.width || !config.item_width || !config.height || !config.item_height) {
        console.error('配置参数不完整', config);
        return null;
    }

    const getSpriteFrame = (x: number, y: number, width: number, height: number): SpriteFrame => {
        const spriteFrame = new SpriteFrame();
        spriteFrame.texture = texture;
        spriteFrame.rect = new Rect(x, y, width, height);
        return spriteFrame;
    };

    const xLen = Math.floor(config.width / config.item_width);
    const yLen = Math.floor(config.height / config.item_height);
    const spriteFrames: SpriteFrame[] = [];

    for (let i = 0; i < yLen; i++) {
        for (let j = 0; j < xLen; j++) {
            const sf = getSpriteFrame(
                config.item_width * j,
                config.item_height * i,
                config.item_width,
                config.item_height
            );
            spriteFrames.push(sf);
        }
    }

    return spriteFrames;
};