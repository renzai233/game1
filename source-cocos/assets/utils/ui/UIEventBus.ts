export class EventBus {
    private static _instance: EventBus;
    public static get instance(): EventBus {
        if (!this._instance) this._instance = new EventBus();
        return this._instance;
    }

    private _events: Map<string, Array<{cb: Function, context?: any}>> = new Map();
    private _onceEvents: Map<string, Array<{cb: Function, context?: any}>> = new Map();
    private _namespaces: Map<string, Set<string>> = new Map();

    public on(event: string, cb: Function, context?: any): void {
        if (!this._events.has(event)) this._events.set(event, []);
        this._events.get(event).push({ cb, context });
    }

    public once(event: string, cb: Function, context?: any): void {
        if (!this._onceEvents.has(event)) this._onceEvents.set(event, []);
        this._onceEvents.get(event).push({ cb, context });
    }

    public off(event: string, cb?: Function, context?: any): void {
        const removeListener = (events: Map<string, Array<{cb: Function, context?: any}>>) => {
            if (!events.has(event)) return;
            const arr = events.get(event);
            
            if (cb) {
                const idx = arr.findIndex(listener => 
                    listener.cb === cb && (!context || listener.context === context)
                );
                if (idx !== -1) arr.splice(idx, 1);
            } else if (context) {
                const filtered = arr.filter(listener => listener.context !== context);
                events.set(event, filtered);
            } else {
                events.delete(event);
            }
        };

        removeListener(this._events);
        removeListener(this._onceEvents);
    }

    public emit(event: string, ...args: any[]): void {
        this._emitFromMap(this._events, event, args);
        this._emitFromMap(this._onceEvents, event, args, true);
    }

    private _emitFromMap(
        events: Map<string, Array<{cb: Function, context?: any}>>, 
        event: string, 
        args: any[], 
        isOnce: boolean = false
    ): void {
        if (!events.has(event)) return;
        const listeners = events.get(event);
        
        if (isOnce) {
            events.delete(event);
        }

        listeners.forEach(({ cb, context }) => {
            try {
                cb.apply(context, args);
            } catch (error) {
                console.error(`[EventBus] 事件回调执行失败: ${event}`, error);
            }
        });
    }

    public namespace(ns: string): EventBusNamespace {
        return new EventBusNamespace(this, ns);
    }

    public clear(): void {
        this._events.clear();
        this._onceEvents.clear();
        this._namespaces.clear();
    }

    public hasEvent(event: string): boolean {
        return this._events.has(event) || this._onceEvents.has(event);
    }

    public getEventCount(event: string): number {
        const count = (this._events.get(event)?.length || 0) + 
                     (this._onceEvents.get(event)?.length || 0);
        return count;
    }
}

export class EventBusNamespace {
    constructor(
        private _eventBus: EventBus,
        private _namespace: string
    ) {}

    public on(event: string, cb: Function, context?: any): void {
        const fullEvent = `${this._namespace}:${event}`;
        this._eventBus.on(fullEvent, cb, context);
    }

    public once(event: string, cb: Function, context?: any): void {
        const fullEvent = `${this._namespace}:${event}`;
        this._eventBus.once(fullEvent, cb, context);
    }

    public off(event: string, cb?: Function, context?: any): void {
        const fullEvent = `${this._namespace}:${event}`;
        this._eventBus.off(fullEvent, cb, context);
    }

    public emit(event: string, ...args: any[]): void {
        const fullEvent = `${this._namespace}:${event}`;
        this._eventBus.emit(fullEvent, ...args);
    }

    public clear(): void {
        const eventBus = this._eventBus as any;
        if (!eventBus._namespaces.has(this._namespace)) return;
        
        const events = eventBus._namespaces.get(this._namespace);
        events.forEach((event: string) => {
            this._eventBus.off(event);
        });
        
        eventBus._._namespaces.delete(this._namespace);
    }
}
