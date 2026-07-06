import { EventBus } from 'db://assets/utils/ui/UIEventBus';
import { EventChannel, EventMap } from '../../core';
import { Dispose } from '../../core/runtime/types';

type BasicUIEventBus = {
    on(event: string, cb: Function, context?: unknown): void;
    off(event: string, cb?: Function, context?: unknown): void;
    emit(event: string, ...args: unknown[]): void;
};

export class UIEventBusChannelAdapter<TEventMap extends EventMap = EventMap>
implements EventChannel<TEventMap> {
    private readonly eventBus: BasicUIEventBus;

    constructor(eventBus: BasicUIEventBus = EventBus.instance) {
        this.eventBus = eventBus;
    }

    on<K extends keyof TEventMap & string>(event: K, handler: (payload: TEventMap[K]) => void): Dispose {
        const callback = (payload: TEventMap[K]) => {
            handler(payload);
        };

        this.eventBus.on(event, callback);

        return () => {
            this.eventBus.off(event, callback);
        };
    }

    emit<K extends keyof TEventMap & string>(event: K, payload: TEventMap[K]): void {
        this.eventBus.emit(event, payload);
    }
}
