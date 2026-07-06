import { Component, Node } from 'cc';
import { EventSubscriberChannel, EventMap, RuntimeContext } from '../../core';

export interface CocosRuntimeContextOptions<
    TBusEventMap extends EventMap = EventMap,
    TUIEventMap extends EventMap = EventMap
> {
    root: Node;
    scheduler: Component;
    busChannel: EventSubscriberChannel<TBusEventMap>;
    uiChannel: EventSubscriberChannel<TUIEventMap>;
}

export function createCocosRuntimeContext<
    TBusEventMap extends EventMap = EventMap,
    TUIEventMap extends EventMap = EventMap
>(
    options: CocosRuntimeContextOptions<TBusEventMap, TUIEventMap>
): RuntimeContext<Node, TBusEventMap, TUIEventMap> {
    const { root, scheduler, busChannel, uiChannel } = options;

    return {
        root,
        onBus: (event, handler) => {
            return busChannel.on(event, handler);
        },
        onUI: (event, handler) => {
            return uiChannel.on(event, handler);
        },
        every: (seconds, fn) => {
            scheduler.schedule(fn, seconds);
            return () => scheduler.unschedule(fn);
        }
    };
}
