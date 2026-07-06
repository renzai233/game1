import { Component, Node } from 'cc';
import {
    EventSubscriberChannel,
    EventMap,
    RuntimeContext,
    RuntimeHost,
    RuntimeLogger,
    RuntimeModule,
    RuntimeHostState,
    RuntimeStartupPolicy,
    RuntimeTelemetry
} from '../../core';
import { createCocosRuntimeContext } from './createCocosRuntimeContext';

export interface CocosRuntimeBridgeOptions<
    TBusEventMap extends EventMap = EventMap,
    TUIEventMap extends EventMap = EventMap
> {
    root: Node;
    scheduler: Component;
    modules: RuntimeModule<RuntimeContext<Node, TBusEventMap, TUIEventMap>>[];
    busChannel: EventSubscriberChannel<TBusEventMap>;
    uiChannel: EventSubscriberChannel<TUIEventMap>;
    logger?: RuntimeLogger;
    startupPolicy?: RuntimeStartupPolicy;
    telemetry?: RuntimeTelemetry;
}

export class CocosRuntimeBridge<
    TBusEventMap extends EventMap = EventMap,
    TUIEventMap extends EventMap = EventMap
> {
    private readonly host: RuntimeHost<RuntimeContext<Node, TBusEventMap, TUIEventMap>>;

    constructor(options: CocosRuntimeBridgeOptions<TBusEventMap, TUIEventMap>) {
        this.host = new RuntimeHost({
            modules: options.modules,
            createContext: () => createCocosRuntimeContext({
                root: options.root,
                scheduler: options.scheduler,
                busChannel: options.busChannel,
                uiChannel: options.uiChannel
            }),
            logger: options.logger,
            startupPolicy: options.startupPolicy,
            telemetry: options.telemetry
        });
    }

    isStarted(): boolean {
        return this.host.isStarted();
    }

    getState(): RuntimeHostState {
        return this.host.getState();
    }

    getFailedModuleIds(): readonly string[] {
        return this.host.getFailedModuleIds();
    }

    getActiveModuleIds(): readonly string[] {
        return this.host.getActiveModuleIds();
    }

    async start(): Promise<void> {
        await this.host.start();
    }

    async stop(): Promise<void> {
        await this.host.stop();
    }
}
