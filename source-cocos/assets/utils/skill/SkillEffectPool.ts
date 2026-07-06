import { Node, Prefab, instantiate, Component } from 'cc';
import { ObjectPool } from 'db://assets/utils/common/ObjectPool';

/**
 * 技能特效对象池管理器
 * 统一管理所有技能特效的对象池，避免频繁创建和销毁
 */
export class SkillEffectPool {
    private static _instance: SkillEffectPool;
    
    /** 技能特效对象池映射 */
    private _effectPools: Map<string, ObjectPool<Node>> = new Map();
    
    /** 技能子弹对象池映射 */
    private _bulletPools: Map<string, ObjectPool<Node>> = new Map();
    
    /** 默认对象池大小 */
    private _defaultPoolSize: number = 50;

    private constructor() {}

    static get instance(): SkillEffectPool {
        if (!this._instance) {
            this._instance = new SkillEffectPool();
        }
        return this._instance;
    }

    /**
     * 注册技能特效对象池
     * @param effectName 特效名称
     * @param prefab 特效预制体
     * @param poolSize 对象池大小
     */
    registerEffectPool(effectName: string, prefab: Prefab, poolSize: number = 50): void {
        if (this._effectPools.has(effectName)) {
            console.warn(`[SkillEffectPool] 特效对象池 ${effectName} 已存在`);
            return;
        }

        const createFunc = () => instantiate(prefab);
        const pool = new ObjectPool<Node>(createFunc, poolSize);
        
        // 预创建一些对象
        for (let i = 0; i < Math.min(10, poolSize); i++) {
            pool.put(createFunc());
        }
        
        this._effectPools.set(effectName, pool);
    }

    /**
     * 注册技能子弹对象池
     * @param bulletName 子弹名称
     * @param prefab 子弹预制体
     * @param poolSize 对象池大小
     */
    registerBulletPool(bulletName: string, prefab: Prefab, poolSize: number = 50): void {
        if (this._bulletPools.has(bulletName)) {
            console.warn(`[SkillEffectPool] 子弹对象池 ${bulletName} 已存在`);
            return;
        }

        const createFunc = () => instantiate(prefab);
        const pool = new ObjectPool<Node>(createFunc, poolSize);
        
        // 预创建一些对象
        for (let i = 0; i < Math.min(10, poolSize); i++) {
            pool.put(createFunc());
        }
        
        this._bulletPools.set(bulletName, pool);
    }

    /**
     * 获取技能特效
     * @param effectName 特效名称
     * @returns 特效节点
     */
    getEffect(effectName: string): Node | null {
        const pool = this._effectPools.get(effectName);
        if (!pool) {
            console.warn(`[SkillEffectPool] 特效对象池 ${effectName} 不存在`);
            return null;
        }
        return pool.get();
    }

    /**
     * 获取技能子弹
     * @param bulletName 子弹名称
     * @returns 子弹节点
     */
    getBullet(bulletName: string): Node | null {
        const pool = this._bulletPools.get(bulletName);
        if (!pool) {
            console.warn(`[SkillEffectPool] 子弹对象池 ${bulletName} 不存在`);
            return null;
        }
        return pool.get();
    }

    /**
     * 回收技能特效
     * @param effectName 特效名称
     * @param effect 特效节点
     */
    recycleEffect(effectName: string, effect: Node): void {
        const pool = this._effectPools.get(effectName);
        if (!pool) {
            console.warn(`[SkillEffectPool] 特效对象池 ${effectName} 不存在，直接销毁`);
            effect.destroy();
            return;
        }
        pool.put(effect);
    }

    /**
     * 回收技能子弹
     * @param bulletName 子弹名称
     * @param bullet 子弹节点
     */
    recycleBullet(bulletName: string, bullet: Node): void {
        const pool = this._bulletPools.get(bulletName);
        if (!pool) {
            console.warn(`[SkillEffectPool] 子弹对象池 ${bulletName} 不存在，直接销毁`);
            bullet.destroy();
            return;
        }
        pool.put(bullet);
    }

    /**
     * 获取特效对象池大小
     * @param effectName 特效名称
     * @returns 对象池大小
     */
    getEffectPoolSize(effectName: string): number {
        const pool = this._effectPools.get(effectName);
        return pool ? pool.size() : 0;
    }

    /**
     * 获取子弹对象池大小
     * @param bulletName 子弹名称
     * @returns 对象池大小
     */
    getBulletPoolSize(bulletName: string): number {
        const pool = this._bulletPools.get(bulletName);
        return pool ? pool.size() : 0;
    }

    /**
     * 清理所有对象池
     */
    clearAllPools(): void {
        for (const [name, pool] of this._effectPools) {
            pool.clear();
        }
    }

    /**
     * 清理指定特效对象池
     * @param effectName 特效名称
     */
    clearEffectPool(effectName: string): void {
        const pool = this._effectPools.get(effectName);
        if (pool) {
            pool.clear();
            this._effectPools.delete(effectName);
        }
    }

    /**
     * 清理指定子弹对象池
     * @param bulletName 子弹名称
     */
    clearBulletPool(bulletName: string): void {
        const pool = this._bulletPools.get(bulletName);
        if (pool) {
            pool.clear();
            this._bulletPools.delete(bulletName);
        }
    }

    /**
     * 获取所有对象池信息
     */
    getPoolInfo(): { effects: string[], bullets: string[] } {
        return {
            effects: Array.from(this._effectPools.keys()),
            bullets: Array.from(this._bulletPools.keys())
        };
    }
}

// 导出单例实例
export const skillEffectPool = SkillEffectPool.instance; 