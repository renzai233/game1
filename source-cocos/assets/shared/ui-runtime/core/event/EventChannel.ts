import { Dispose } from '../runtime/types';
import { EventMap } from './EventMap';

export interface EventSubscriberChannel<TEventMap extends EventMap = EventMap> {
    on<K extends keyof TEventMap & string>(
        event: K,
        handler: (payload: TEventMap[K]) => void
    ): Dispose;
}

export interface EventPublisherChannel<TEventMap extends EventMap = EventMap> {
    emit<K extends keyof TEventMap & string>(event: K, payload: TEventMap[K]): void;
}

export type EventChannel<TEventMap extends EventMap = EventMap> =
    EventSubscriberChannel<TEventMap> & EventPublisherChannel<TEventMap>;
