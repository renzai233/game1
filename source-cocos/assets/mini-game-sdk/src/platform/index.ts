import type { Clock } from "../core/clock";
import type { PlatformConfig, PlatformTarget } from "../core/config";
import { createSystemClock } from "../core/clock";
import { createDouyinPlatformAdapter, type DouyinPlatformAdapterOptions } from "./adapters/douyin";
import { createNoopPlatformAdapter } from "./adapters/noop";
import { createWebPlatformAdapter } from "./adapters/web";
import { createWechatPlatformAdapter, type WechatPlatformAdapterOptions } from "./adapters/wechat";
import { DefaultPlatformFacade } from "./facade";
import { selectPlatformRuntime } from "./runtime";
import type { PlatformFacade } from "./types";

export type {
  CapabilityFailureReason,
  CapabilityResult,
  PlatformAdapter,
  PlatformAudio,
  PlatformAds,
  PlatformAuth,
  PlatformCapabilities,
  PlatformCapability,
  PlatformEngagement,
  PlatformFacade,
  PlatformGameClubButtonOptions,
  PlatformGameClubButtonStyle,
  PlatformGameClubDataOptions,
  PlatformGameClubDataType,
  PlatformGameClubEncryptedData,
  PlatformHaptics,
  PlatformLaunchOptions,
  PlatformLifecycle,
  PlatformInnerAudioContext,
  PlatformLoginCode,
  PlatformLoginCodeOptions,
  PlatformNativeButtonHandle,
  PlatformOpenPageOptions,
  PlatformOpenPageResult,
  PlatformReportSceneOptions,
  PlatformRetention,
  PlatformShortcut,
  PlatformShortcutStatus,
  PlatformShare,
  PlatformShareHandler,
  PlatformShareHandlerInput,
  PlatformShareMenuItem,
  PlatformShareMenuOptions,
  PlatformShareOptions,
  PlatformShareResult,
  PlatformShareUpdateMenuOptions,
  PlatformTarget,
  PlatformUnsubscribe,
  PlatformVibrationKind,
  RewardedVideoOptions,
  RewardedVideoResult,
  SidebarCapabilitySnapshot,
  SidebarLaunchSnapshot,
} from "./types";
export { PLATFORM_MODULE_BOUNDARY } from "./types";
export { createDouyinPlatformAdapter, createNoopPlatformAdapter, createWebPlatformAdapter, createWechatPlatformAdapter };

export interface CreatePlatformFacadeOptions {
  readonly clock?: Clock;
  readonly rewardedVideoLifecycle?: DouyinPlatformAdapterOptions["rewardedVideoLifecycle"];
}

export function createPlatformFacade(
  config: PlatformConfig | undefined,
  options: CreatePlatformFacadeOptions = {},
): PlatformFacade {
  const selection = selectPlatformRuntime(config);
  const clock = options.clock ?? createSystemClock();

  switch (selection.target) {
    case "douyin":
      return new DefaultPlatformFacade(
        createDouyinPlatformAdapter({
          runtime: selection.runtime,
          config: config?.douyin,
          clock,
          rewardedVideoLifecycle: options.rewardedVideoLifecycle,
        } satisfies DouyinPlatformAdapterOptions),
      );
    case "wechat":
      return new DefaultPlatformFacade(
        createWechatPlatformAdapter({
          runtime: selection.runtime,
          config: config?.wechat,
          clock,
          rewardedVideoLifecycle: options.rewardedVideoLifecycle,
        } satisfies WechatPlatformAdapterOptions),
      );
    case "web":
      return new DefaultPlatformFacade(createWebPlatformAdapter());
    case "noop":
      return new DefaultPlatformFacade(createNoopPlatformAdapter("noop"));
  }
}

export function createNoopPlatformFacade(target: PlatformTarget = "noop"): PlatformFacade {
  return new DefaultPlatformFacade(createNoopPlatformAdapter(target));
}
