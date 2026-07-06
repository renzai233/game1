import { Node } from 'cc';

export type Dispose = () => void;

export interface IHomeRuntimeModule {
    readonly id: string;
    setup(ctx: HomeRuntimeContext): void | Promise<void>;
    teardown?(): void;
}

export interface HomeRuntimeContext {
    readonly root: Node;
    // Caller owns returned disposer lifecycle (usually released in module teardown).
    onBus<T = any>(event: string, handler: (payload: T) => void): Dispose;
    // Caller owns returned disposer lifecycle (usually released in module teardown).
    onUI(event: string, handler: () => void): Dispose;
    // Caller owns returned disposer lifecycle (usually released in module teardown).
    every(seconds: number, fn: () => void): Dispose;
}
