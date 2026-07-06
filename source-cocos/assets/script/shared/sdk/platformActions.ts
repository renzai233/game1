import type {
    CapabilityResult,
    PlatformLaunchOptions,
    PlatformShareOptions,
    PlatformShareResult,
    PlatformShortcutStatus,
    PlatformUnsubscribe,
    RewardedVideoResult,
    SidebarLaunchSnapshot,
} from '../../../mini-game-sdk/src';
import { DEFAULT_REWARDED_PLACEMENT } from './config';
import { getGameSdkPlatform } from './runtime';

export function canShowRewardedVideo(): boolean {
    return getGameSdkPlatform().capabilities.ads.rewardedVideo;
}

export function canShowDouyinSidebarEntry(): boolean {
    const platform = getGameSdkPlatform();
    return platform.target === 'douyin' && platform.capabilities.retention.sidebar;
}

export function canShareAppMessage(): boolean {
    return getGameSdkPlatform().capabilities.share.appMessage;
}

export function canAddShortcut(): boolean {
    const platform = getGameSdkPlatform();
    return platform.target === 'douyin' && platform.capabilities.shortcut.add;
}

export async function showRewardedVideo(
    placementId = DEFAULT_REWARDED_PLACEMENT,
): Promise<CapabilityResult<RewardedVideoResult>> {
    return getGameSdkPlatform().ads.showRewardedVideo({ placementId });
}

export async function shareAppMessage(
    options?: PlatformShareOptions,
): Promise<CapabilityResult<PlatformShareResult>> {
    return getGameSdkPlatform().share.shareAppMessage(options);
}

export async function addShortcut(): Promise<CapabilityResult<void>> {
    return getGameSdkPlatform().shortcut.addShortcut();
}

export async function checkShortcut(): Promise<CapabilityResult<PlatformShortcutStatus>> {
    return getGameSdkPlatform().shortcut.checkShortcut();
}

export function getPlatformLaunchOptions(): CapabilityResult<PlatformLaunchOptions | null> {
    return getGameSdkPlatform().lifecycle.getLaunchOptions();
}

export function onPlatformShow(listener: (options: PlatformLaunchOptions) => void): PlatformUnsubscribe {
    return getGameSdkPlatform().lifecycle.onShow(listener);
}

export function parseSidebarLaunch(options: PlatformLaunchOptions): SidebarLaunchSnapshot {
    return getGameSdkPlatform().retention.parseSidebarLaunch(options);
}

export async function openSidebar(
    options?: { readonly extraData?: Readonly<Record<string, unknown>> },
): Promise<CapabilityResult<void>> {
    return getGameSdkPlatform().retention.openSidebar(options);
}

export async function checkSidebar(): Promise<
    CapabilityResult<{ readonly available: boolean | 'unknown'; readonly raw?: unknown }>
> {
    return getGameSdkPlatform().retention.checkSidebar();
}
