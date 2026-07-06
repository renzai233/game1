
// 单例模式
export class Singleton {

    // 获取单例实例
    static instance<T extends {}>(this: new () => T): T {
        if (!(this as any).__instance__) {
            (this as any).__instance__ = new this();
        }
        return (this as any).__instance__;
    }
}
