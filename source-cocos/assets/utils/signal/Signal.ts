import { ISignal, ISignalListener, ISignalManager } from './ISignal';

/**
 * 信号实现类
 * 提供事件信号的具体实现
 */
export class Signal implements ISignalManager {
    private _listeners: Map<string, ISignalListener[]> = new Map();
    private _signalQueue: ISignal[] = [];

    /**
     * 注册信号监听器
     * @param type 信号类型
     * @param listener 监听器
     */
    public on(type: string, listener: ISignalListener): void {
        if (!this._listeners.has(type)) {
            this._listeners.set(type, []);
        }
        this._listeners.get(type)!.push(listener);
    }

    /**
     * 移除信号监听器
     * @param type 信号类型
     * @param listener 监听器
     */
    public off(type: string, listener: ISignalListener): void {
        const listeners = this._listeners.get(type);
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * 发送信号
     * @param type 信号类型
     * @param data 信号数据
     * @param source 信号源
     */
    public emit(type: string, data?: any, source?: string): void {
        const signal: ISignal = {
            type,
            data,
            timestamp: Date.now(),
            source
        };

        // 将信号加入队列，在下一帧处理
        this._signalQueue.push(signal);
    }

    /**
     * 立即发送信号
     * @param type 信号类型
     * @param data 信号数据
     * @param source 信号源
     */
    public emitImmediate(type: string, data?: any, source?: string): void {
        const signal: ISignal = {
            type,
            data,
            timestamp: Date.now(),
            source
        };

        this.processSignal(signal);
    }

    /**
     * 处理信号队列
     */
    public update(): void {
        if (this._signalQueue.length > 0) {
            const signals = [...this._signalQueue];
            this._signalQueue = [];

            signals.forEach(signal => {
                this.processSignal(signal);
            });
        }
    }

    /**
     * 处理单个信号
     * @param signal 信号
     */
    private processSignal(signal: ISignal): void {
        const listeners = this._listeners.get(signal.type);
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    listener(signal);
                } catch (error) {
                    console.error(`信号处理错误 [${signal.type}]:`, error);
                }
            });
        }
    }

    /**
     * 清除所有监听器
     */
    public clear(): void {
        this._listeners.clear();
        this._signalQueue = [];
    }

    /**
     * 获取监听器数量
     * @param type 信号类型
     */
    public getListenerCount(type: string): number {
        const listeners = this._listeners.get(type);
        return listeners ? listeners.length : 0;
    }

    /**
     * 获取所有信号类型
     */
    public getSignalTypes(): string[] {
        return Array.from(this._listeners.keys());
    }

    /**
     * 检查是否有监听器
     * @param type 信号类型
     */
    public hasListeners(type: string): boolean {
        return this.getListenerCount(type) > 0;
    }
}
