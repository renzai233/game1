import type { MiniGameSdkConfig, PlatformTarget, SdkEnvironment } from '../../../mini-game-sdk/src';
import { EDM } from '../../../utils/data/env/ConfigManager';
import { Platform } from '../../../utils/data/env/GameConfig.type';

export const HAPPY_SDK_GAME_ID = 'happy';
export const DEFAULT_REWARDED_PLACEMENT = 'default';
export const ACQUISITION_REPORT_SCENE_ID = 7001;

function getGlobalRecord(): Record<string, unknown> {
    return globalThis as Record<string, unknown>;
}

export function resolvePlatformTarget(): PlatformTarget {
    switch (EDM.config.platform) {
        case Platform.DOUYIN:
            return 'douyin';
        case Platform.WX:
            return 'wechat';
        case Platform.PC:
            return 'web';
        default:
            return 'noop';
    }
}

export function resolvePlatformRuntime(target: PlatformTarget): unknown {
    const globals = getGlobalRecord();
    const windowRecord = typeof window === 'undefined' ? undefined : (window as unknown as Record<string, unknown>);

    if (target === 'douyin') {
        return globals.tt ?? windowRecord?.tt;
    }

    if (target === 'wechat') {
        return globals.wx ?? windowRecord?.wx;
    }

    if (target === 'web') {
        return globalThis;
    }

    return undefined;
}

export function resolveSdkEnvironment(): SdkEnvironment {
    if (EDM.isDev()) return 'dev';
    if (EDM.isStaging()) return 'test';
    return 'prod';
}

export function createHappySdkConfig(): MiniGameSdkConfig {
    const target = resolvePlatformTarget();
    const runtime = resolvePlatformRuntime(target);
    const adUnitId = EDM.config.adUnitId;
    const douyinShare = EDM.config.platformFeatures?.douyinShare;

    return {
        app: {
            gameId: EDM.config.gameName || HAPPY_SDK_GAME_ID,
            appVersion: EDM.config.version || '0.0.0',
            environment: resolveSdkEnvironment(),
        },
        platform: {
            target,
            douyin: {
                runtime: target === 'douyin' ? runtime : undefined,
                rewardedVideo: {
                    placements: {
                        [DEFAULT_REWARDED_PLACEMENT]: adUnitId,
                    },
                },
                share: {
                    defaultChannel: douyinShare?.defaultChannel || 'invite',
                    defaultShareTemplate: douyinShare?.rewardTemplateId || undefined,
                },
                retention: {
                    reportSceneId: ACQUISITION_REPORT_SCENE_ID,
                },
            },
            wechat: {
                runtime: target === 'wechat' ? runtime : undefined,
                rewardedVideo: {
                    placements: {
                        [DEFAULT_REWARDED_PLACEMENT]: adUnitId,
                    },
                },
                share: {
                    defaultChannel: douyinShare?.defaultChannel || 'invite',
                },
            },
            web: {
                runtime: target === 'web' ? runtime : undefined,
            },
        },
        modules: {
            account: {
                enabled: false,
                autoLogin: false,
            },
            telemetry: {
                enabled: false,
                autoTrackSdkEvents: false,
            },
            profile: {
                enabled: false,
            },
        },
    };
}
