import { EDM } from '../../../utils/data/env/ConfigManager';
import type { CapabilityResult, PlatformLaunchOptions } from '../../../mini-game-sdk/src';
import { getGameSdkPlatform } from './runtime';

export type LaunchEntryType = 'feed' | 'sidebar' | 'share' | 'direct' | 'unknown';

export interface LaunchContext {
    readonly entryType: LaunchEntryType;
    readonly isCustomerAcq: boolean;
    readonly channel?: number | null;
    readonly raw?: unknown;
}

let currentLaunchOptions: PlatformLaunchOptions | null = null;
let currentLaunchContext: LaunchContext | null = null;

function toNumberOrNull(value: string | number | null | undefined): number | null {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    return Number.isNaN(numeric) ? null : numeric;
}

function failureReason(result: CapabilityResult<unknown>): string {
    if (result.ok === true) return '';
    return result.message || result.reason;
}

export function createLaunchContext(options: PlatformLaunchOptions | null): LaunchContext | null {
    if (!options) return null;

    const entryType = (options.entryType || 'unknown') as LaunchEntryType;
    const feedScene = options.query['feed_game_scene'];
    const isCustomerAcq = entryType === 'feed' && String(feedScene ?? '') === '0';

    return {
        entryType,
        isCustomerAcq,
        channel: toNumberOrNull(options.channel),
        raw: options.raw,
    };
}

export function captureLaunchContext(options?: PlatformLaunchOptions | null): LaunchContext | null {
    const launchOptions = options === undefined ? readLaunchOptions() : options;
    currentLaunchOptions = launchOptions;
    currentLaunchContext = createLaunchContext(launchOptions);
    return currentLaunchContext;
}

export function getLaunchOptions(): PlatformLaunchOptions | null {
    return currentLaunchOptions;
}

export function getLaunchContext(): LaunchContext | null {
    return currentLaunchContext;
}

export function setLaunchContext(context: LaunchContext | null): void {
    currentLaunchContext = context;
}

function readLaunchOptions(): PlatformLaunchOptions | null {
    const result = getGameSdkPlatform().lifecycle.getLaunchOptions();
    if (!result.ok) {
        if (EDM.isDev()) {
            console.warn('[shared/sdk] getLaunchOptions failed:', failureReason(result));
        }
        return null;
    }

    return result.value;
}
