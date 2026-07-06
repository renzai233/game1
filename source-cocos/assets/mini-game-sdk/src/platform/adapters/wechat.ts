import type { Clock } from "../../core/clock";
import type { WechatPlatformConfig } from "../../core/config";
import { createSystemClock } from "../../core/clock";
import { capabilityFailure, cloneCapabilities } from "../capabilities";
import {
  createNativeAds,
  createNativeAudio,
  createNativeAuth,
  createNativeHaptics,
  createNativeLifecycle,
  createNativeRetention,
  createNativeShortcut,
  destroyNativeRewardedAds,
  type NativeRewardedAd,
} from "./native-common";
import type { PlatformAdapter, PlatformCapabilities, SidebarCapabilitySnapshot } from "../types";
import {
  createWechatEngagement,
  createWechatShare,
  destroyWechatHandles,
  type WechatGameClubButton,
  type WechatPageManager,
} from "./wechat-capabilities";

export interface WechatPlatformAdapterOptions {
  readonly runtime?: unknown;
  readonly config?: WechatPlatformConfig | undefined;
  readonly clock?: Clock;
  readonly rewardedVideoLifecycle?: Parameters<typeof createNativeAds>[0]["lifecycle"];
}

export function createWechatPlatformAdapter(options: WechatPlatformAdapterOptions = {}): PlatformAdapter {
  const runtime = options.runtime ?? options.config?.runtime;
  const clock = options.clock ?? createSystemClock();
  const state = { busy: false };
  const rewardedAdCache = new Map<string, NativeRewardedAd>();
  const capabilities = wechatCapabilities(runtime);
  const retention = createNativeRetention({ runtime, unsupported: true });
  const shortcut = createNativeShortcut({ runtime, unsupported: true });
  const engagementState = {
    runtime,
    openPage: options.config?.openPage,
    pageManagers: new Set<WechatPageManager>(),
    buttonHandles: new Set<WechatGameClubButton>(),
  };

  return {
    target: "wechat",
    capabilities,
    lifecycle: createNativeLifecycle("wechat", runtime),
    audio: createNativeAudio({
      runtime,
      preferWebAudioForShortSfx: options.config?.audio?.preferWebAudioForShortSfx,
    }),
    haptics: createNativeHaptics(runtime),
    auth: createNativeAuth({
      target: "wechat",
      runtime,
      clock,
      timeoutMs: options.config?.loginTimeoutMs,
      passForce: false,
    }),
    ads: createNativeAds({
      target: "wechat",
      runtime,
      placements: options.config?.rewardedVideo,
      timeoutMs: options.config?.rewardedVideo?.timeoutMs,
      multiton: options.config?.rewardedVideo?.multiton,
      disableFallbackSharePage: options.config?.rewardedVideo?.disableFallbackSharePage,
      showFirst: true,
      retainAdInstance: true,
      adCache: rewardedAdCache,
      state,
      lifecycle: options.rewardedVideoLifecycle,
    }),
    share: {
      ...createWechatShare({
        runtime,
        defaults: options.config?.share,
      }),
      shareToFriend: async () =>
        capabilityFailure("unsupported", "Direct friend share is unsupported on Wechat adapter."),
    },
    engagement: createWechatEngagement(engagementState),
    shortcut,
    retention: {
      ...retention,
      getSidebarCapability: () =>
        capabilityFailure<SidebarCapabilitySnapshot>("unsupported", "Retention is unsupported on Wechat adapter."),
    },
    destroy: () => {
      state.busy = false;
      destroyNativeRewardedAds(rewardedAdCache);
      destroyWechatHandles(engagementState);
    },
  };
}

function wechatCapabilities(runtime: unknown): PlatformCapabilities {
  const record = runtimeRecord(runtime);
  return cloneCapabilities({
    lifecycle: {
      launchOptions: typeof record["getLaunchOptionsSync"] === "function",
      onShow: typeof record["onShow"] === "function",
      onHide: typeof record["onHide"] === "function",
    },
    audio: {
      innerAudioContext: typeof record["createInnerAudioContext"] === "function",
    },
    haptics: {
      vibrate: typeof record["vibrateShort"] === "function" || typeof record["vibrateLong"] === "function",
    },
    auth: {
      loginCode: typeof record["login"] === "function",
    },
    ads: {
      rewardedVideo: typeof record["createRewardedVideoAd"] === "function",
    },
    share: {
      appMessage: typeof record["shareAppMessage"] === "function",
      menu:
        typeof record["showShareMenu"] === "function" ||
        typeof record["hideShareMenu"] === "function" ||
        typeof record["updateShareMenu"] === "function",
      appMessageHandler: typeof record["onShareAppMessage"] === "function",
      toFriend: false,
    },
    engagement: {
      openPage: typeof record["createPageManager"] === "function",
      gameClubButton: typeof record["createGameClubButton"] === "function",
      gameClubData: typeof record["getGameClubData"] === "function",
    },
    shortcut: {
      add: false,
      check: false,
    },
    retention: {
      sidebar: false,
      revisitGuide: false,
      reportScene: false,
    },
  });
}

function runtimeRecord(runtime: unknown): Record<string, unknown> {
  return typeof runtime === "object" && runtime !== null ? (runtime as Record<string, unknown>) : {};
}
