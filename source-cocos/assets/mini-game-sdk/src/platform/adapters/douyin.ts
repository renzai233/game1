import type { Clock } from "../../core/clock";
import type { DouyinPlatformConfig } from "../../core/config";
import { createSystemClock } from "../../core/clock";
import { capabilityFailure, cloneCapabilities } from "../capabilities";
import {
  createNativeAds,
  createNativeAudio,
  createNativeAuth,
  createNativeHaptics,
  createNativeLifecycle,
  createNativeRetention,
  createNativeShare,
  createNativeShortcut,
} from "./native-common";
import type {
  PlatformAdapter,
  PlatformCapabilities,
  PlatformGameClubEncryptedData,
  PlatformNativeButtonHandle,
  PlatformOpenPageResult,
} from "../types";

export interface DouyinPlatformAdapterOptions {
  readonly runtime?: unknown;
  readonly config?: DouyinPlatformConfig | undefined;
  readonly clock?: Clock;
  readonly rewardedVideoLifecycle?: Parameters<typeof createNativeAds>[0]["lifecycle"];
}

export function createDouyinPlatformAdapter(options: DouyinPlatformAdapterOptions = {}): PlatformAdapter {
  const runtime = options.runtime ?? options.config?.runtime;
  const clock = options.clock ?? createSystemClock();
  const state = { busy: false };
  const capabilities = douyinCapabilities(runtime, options.config);

  return {
    target: "douyin",
    capabilities,
    lifecycle: createNativeLifecycle("douyin", runtime),
    audio: createNativeAudio({
      runtime,
      preferWebAudioForShortSfx: options.config?.audio?.preferWebAudioForShortSfx,
    }),
    haptics: createNativeHaptics(runtime),
    auth: createNativeAuth({
      target: "douyin",
      runtime,
      clock,
      timeoutMs: options.config?.loginTimeoutMs,
      passForce: true,
    }),
    ads: createNativeAds({
      target: "douyin",
      runtime,
      placements: options.config?.rewardedVideo,
      state,
      lifecycle: options.rewardedVideoLifecycle,
    }),
    share: createNativeShare({
      runtime,
      defaults: options.config?.share,
      supportsDirectFriend: true,
    }),
    engagement: {
      openPage: async () =>
        capabilityFailure<PlatformOpenPageResult>("unsupported", "Open page is unsupported on Douyin adapter."),
      createGameClubButton: () =>
        capabilityFailure<PlatformNativeButtonHandle>("unsupported", "Game club button is unsupported on Douyin adapter."),
      getGameClubData: async () =>
        capabilityFailure<PlatformGameClubEncryptedData>("unsupported", "Game club data is unsupported on Douyin adapter."),
    },
    shortcut: createNativeShortcut({
      runtime,
    }),
    retention: createNativeRetention({
      runtime,
      reportSceneId: options.config?.retention?.reportSceneId,
    }),
    destroy: () => {
      state.busy = false;
    },
  };
}

function douyinCapabilities(runtime: unknown, config: DouyinPlatformConfig | undefined): PlatformCapabilities {
  const record = runtimeRecord(runtime);
  const capabilities = cloneCapabilities({
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
      menu: false,
      appMessageHandler: false,
      toFriend: typeof record["shareAppMessage"] === "function",
    },
    engagement: {
      openPage: false,
      gameClubButton: false,
      gameClubData: false,
    },
    shortcut: {
      add: typeof record["addShortcut"] === "function",
      check: typeof record["checkShortcut"] === "function",
    },
    retention: {
      sidebar:
        typeof record["checkScene"] === "function" ||
        typeof record["navigateToScene"] === "function" ||
        typeof record["showRevisitGuide"] === "function",
      revisitGuide: typeof record["showRevisitGuide"] === "function",
      reportScene: typeof record["reportScene"] === "function",
    },
  });

  return capabilities;
}

function runtimeRecord(runtime: unknown): Record<string, unknown> {
  return typeof runtime === "object" && runtime !== null ? (runtime as Record<string, unknown>) : {};
}
