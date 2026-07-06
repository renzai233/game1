import { gameBus } from 'db://assets/utils/signal/GameBus';
import { EventChannel, EventMap } from '../../core';
import { Dispose } from '../../core/runtime/types';

type BasicEventBus = {
    on(event: string, handler: Function): void;
    off(event: string, handler: Function): void;
    emit(event: string, ...args: unknown[]): void;
};

export class GameBusEventChannelAdapter<TEventMap extends EventMap = EventMap>
implements EventChannel<TEventMap> {
    private readonly bus: BasicEventBus;

    constructor(bus: BasicEventBus = gameBus) {
        this.bus = bus;
    }

    on<K extends keyof TEventMap & string>(event: K, handler: (payload: TEventMap[K]) => void): Dispose {
        const callback = (payload: TEventMap[K]) => {
            handler(payload);
        };

        this.bus.on(event, callback);

        return () => {
            this.bus.off(event, callback);
        };
    }

    emit<K extends keyof TEventMap & string>(event: K, payload: TEventMap[K]): void {
        this.bus.emit(event, payload);
    }
}
