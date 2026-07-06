import {
    createMiniGameSdk,
    type MiniGameSdk,
    type PlatformFacade as SdkPlatformFacade,
    type PlatformTarget,
    type Result,
    type SdkError,
} from '../../../mini-game-sdk/src';
import { createHappySdkConfig } from './config';

export type GameSdkRuntimeStatus = 'idle' | 'starting' | 'ready' | 'failed' | 'destroyed';

export interface GameSdkRuntimeSnapshot {
    readonly status: GameSdkRuntimeStatus;
    readonly sdk: MiniGameSdk | null;
    readonly error: SdkError | null;
}

export class GameSdkRuntime {
    private _sdk: MiniGameSdk | null = null;
    private _status: GameSdkRuntimeStatus = 'idle';
    private _error: SdkError | null = null;
    private _readyPromise: Promise<Result<MiniGameSdk, SdkError>> | null = null;

    get snapshot(): GameSdkRuntimeSnapshot {
        return {
            status: this._status,
            sdk: this._sdk,
            error: this._error,
        };
    }

    get sdk(): MiniGameSdk {
        const sdk = this.ensureSdk();
        if (this._status === 'idle') {
            void this.start();
        }
        return sdk;
    }

    get platform(): SdkPlatformFacade {
        return this.sdk.platform;
    }

    get target(): PlatformTarget {
        return this.platform.target;
    }

    start(): Promise<Result<MiniGameSdk, SdkError>> {
        const sdk = this.ensureSdk();

        if (this._status === 'ready' && sdk.state === 'started') {
            return Promise.resolve({ ok: true, value: sdk });
        }

        if (this._readyPromise) {
            return this._readyPromise;
        }

        this._status = 'starting';
        this._error = null;
        this._readyPromise = this.startSdk(sdk);
        return this._readyPromise;
    }

    getSdk(): MiniGameSdk | null {
        return this._sdk;
    }

    async destroy(): Promise<Result<void, SdkError>> {
        const sdk = this._sdk;
        this._sdk = null;
        this._readyPromise = null;
        this._error = null;
        this._status = 'destroyed';

        if (!sdk) {
            return { ok: true, value: undefined };
        }

        return sdk.destroy();
    }

    private ensureSdk(): MiniGameSdk {
        if (this._sdk && this._status !== 'destroyed') {
            return this._sdk;
        }

        this._sdk = createMiniGameSdk(createHappySdkConfig());
        this._status = 'idle';
        this._error = null;
        this._readyPromise = null;
        return this._sdk;
    }

    private async startSdk(sdk: MiniGameSdk): Promise<Result<MiniGameSdk, SdkError>> {
        const result = await sdk.start();
        if (result.ok === true) {
            this._status = 'ready';
            this._error = null;
            return { ok: true, value: sdk };
        }

        const failure = result as { readonly error: SdkError };
        this._status = 'failed';
        this._error = failure.error;
        this._readyPromise = null;
        console.warn('[GameSdkRuntime] SDK start failed:', failure.error);
        return { ok: false, error: failure.error };
    }
}

export const gameSdkRuntime = new GameSdkRuntime();

export function startGameSdk(): Promise<Result<MiniGameSdk, SdkError>> {
    return gameSdkRuntime.start();
}

export async function requireGameSdk(): Promise<MiniGameSdk> {
    const result = await gameSdkRuntime.start();
    if (result.ok !== true) {
        const failure = result as { readonly error: SdkError };
        throw failure.error;
    }

    return result.value;
}

export function getGameSdk(): MiniGameSdk | null {
    return gameSdkRuntime.getSdk();
}

export function ensureGameSdk(): MiniGameSdk {
    return gameSdkRuntime.sdk;
}

export function getGameSdkPlatform(): SdkPlatformFacade {
    return gameSdkRuntime.platform;
}

export function getPlatformTarget(): PlatformTarget {
    return gameSdkRuntime.target;
}
