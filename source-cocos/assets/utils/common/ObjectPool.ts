// 通用对象池实现
import { Node, Prefab, instantiate, Component } from 'cc';

export class ObjectPool<T extends Node | Component> {
    private _pool: T[] = [];
    private _createFunc: () => T;
    private _maxSize: number;

    constructor(createFunc: () => T, maxSize: number = 50) {
        this._createFunc = createFunc;
        this._maxSize = maxSize;
    }

    get(): T {
        while (this._pool.length > 0) {
            const obj = this._pool.pop();
            // Node 类型有效性检测
            if (obj instanceof Node) {
                if (obj.isValid) return obj;
            } else if ((obj as any).node && (obj as any).node.isValid) {
                return obj;
            }
            // 无效则丢弃
        }
        return this._createFunc();
    }

    put(obj: T) {
        if (this._pool.length < this._maxSize) {
            this._pool.push(obj);
        } else {
            if (obj instanceof Node) {
                obj.destroy();
            } else if ((obj as any).node && (obj as any).node instanceof Node) {
                (obj as any).node.destroy();
            }
        }
    }

    clear() {
        while (this._pool.length > 0) {
            const obj = this._pool.pop();
            if (obj instanceof Node) {
                obj.destroy();
            } else if ((obj as any).node && (obj as any).node instanceof Node) {
                (obj as any).node.destroy();
            }
        }
    }

    size() {
        return this._pool.length;
    }
} 