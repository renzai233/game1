import { EventMap } from '../event/EventMap';

export type Dispose = () => void;

export interface RuntimeContext<
    TRoot = unknown,
    TBusEventMap extends EventMap = EventMap,
    TUIEventMap extends EventMap = EventMap
> {
    readonly root: TRoot;
    onBus<K extends keyof TBusEventMap & string>(
        event: K,
        handler: (payload: TBusEventMap[K]) => void
    ): Dispose;
    onUI<K extends keyof TUIEventMap & string>(
        event: K,
        handler: (payload: TUIEventMap[K]) => void
    ): Dispose;
    every(seconds: number, fn: () => void): Dispose;
}

export interface RuntimeModule<TContext extends RuntimeContext = RuntimeContext> {
    readonly id: string;
    setup(ctx: TContext): void | Promise<void>;
    teardown?(): void | Promise<void>;
    onSetupFailed?(ctx: TContext, error: unknown): void | Promise<void>;
}

export interface RuntimeLogger {
    info?(message: string, ...args: unknown[]): void;
    warn?(message: string, ...args: unknown[]): void;
    error?(message: string, ...args: unknown[]): void;
}

export type RuntimeStartupPolicy = 'best-effort' | 'all-or-nothing';
export type RuntimeHostState = 'idle' | 'starting' | 'running' | 'stopping';

export interface RuntimeModuleLifecycleMetric {
    moduleId: string;
    phase: 'setup' | 'teardown' | 'setup-failed-compensation';
    durationMs: number;
    success: boolean;
    error?: unknown;
}

export interface RuntimeStartMetric {
    durationMs: number;
    totalModules: number;
    activeModuleIds: readonly string[];
    failedModuleIds: readonly string[];
    startupPolicy: RuntimeStartupPolicy;
    succeeded: boolean;
    rolledBack: boolean;
}

export interface RuntimeStopMetric {
    durationMs: number;
    totalModules: number;
    failedModuleIds: readonly string[];
}

export interface RuntimeTelemetry {
    onModuleLifecycle?(metric: RuntimeModuleLifecycleMetric): void;
    onStartCompleted?(metric: RuntimeStartMetric): void;
    onStopCompleted?(metric: RuntimeStopMetric): void;
}
