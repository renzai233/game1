import { _decorator, Node, Prefab, instantiate } from 'cc';
import { tween } from 'cc';
import { HeroItemController } from './HeroItemController';

/**
 * 英雄项对象池管理器
 * 用于优化英雄列表的性能，减少频繁的创建和销毁
 */
export class HeroItemPool {
    private static _instance: HeroItemPool;
    private _pool: Node[] = [];
    private _prefab: Prefab | null = null;
    private _maxPoolSize: number = 20;

    public static get instance(): HeroItemPool {
        if (!this._instance) {
            this._instance = new HeroItemPool();
        }
        return this._instance;
    }

    /**
     * 初始化对象池
     */
    public init(prefab: Prefab, maxPoolSize: number = 20): void {
        this._prefab = prefab;
        this._maxPoolSize = maxPoolSize;
    }

    /**
     * 从对象池获取英雄项节点
     */
    public getItem(): Node {
        if (this._pool.length > 0) {
            const item = this._pool.pop()!;
            item.active = true;
            console.log(`[HeroItemPool] 从对象池获取节点: ${item.name}`);
            return item;
        } else if (this._prefab) {
            const item = instantiate(this._prefab);
            console.log(`[HeroItemPool] 从预制体创建新节点: ${item.name}`);
            return item;
        } else {
            console.error('[HeroItemPool] 预制体未设置，返回空节点');
            return new Node();
        }
    }

    /**
     * 将英雄项节点返回到对象池
     */
    public returnItem(node: Node): void {
        if (!node) return;

        // 清理 HeroItemController 的状态，防止数据残留
        const controller = node.getComponent(HeroItemController);
        if (controller) {
            // 清理英雄数据
            (controller as any)._heroData = null;
            (controller as any)._currentHeroIconPath = null;
            (controller as any)._currentAttrIconPath = null;
            // 停止所有可能的动画
            if ((controller as any).heroIcon) {
                tween((controller as any).heroIcon).stop();
            }
            if ((controller as any).heroLevel) {
                tween((controller as any).heroLevel).stop();
            }
            if ((controller as any).upgradeNotification) {
                tween((controller as any).upgradeNotification).stop();
            }
            if ((controller as any).upgradeButton) {
                tween((controller as any).upgradeButton.node).stop();
            }
        }

        // 重置节点状态
        node.active = false;
        node.removeFromParent();

        // 如果对象池未满，则回收节点
        if (this._pool.length < this._maxPoolSize) {
            this._pool.push(node);
        } else {
            node.destroy();
        }
    }

    /**
     * 清空对象池
     */
    public clear(): void {
        this._pool.forEach(node => {
            if (node && node.isValid) {
                node.destroy();
            }
        });
        this._pool.length = 0;
    }

    /**
     * 获取对象池状态
     */
    public getStatus(): { poolSize: number; maxSize: number } {
        return {
            poolSize: this._pool.length,
            maxSize: this._maxPoolSize
        };
    }
} 
