import type { PlatformTarget } from "../../core";
import { capabilityFailure, NOOP_PLATFORM_CAPABILITIES } from "../capabilities";
import { noopUnsubscribe } from "../native";
import type {
  PlatformAdapter,
  PlatformGameClubEncryptedData,
  PlatformLoginCode,
  PlatformNativeButtonHandle,
  PlatformOpenPageResult,
  PlatformShareResult,
  RewardedVideoResult,
  SidebarCapabilitySnapshot,
} from "../types";

export function createNoopPlatformAdapter(target: PlatformTarget = "noop"): PlatformAdapter {
  return {
    target,
    capabilities: NOOP_PLATFORM_CAPABILITIES,
    lifecycle: {
      getLaunchOptions: () => ({ ok: true, value: null }),
      onShow: () => noopUnsubscribe,
      onHide: () => noopUnsubscribe,
    },
    audio: {
      preferWebAudioForShortSfx: false,
      supportsInnerAudioContext: () => false,
      createInnerAudioContext: () => null,
    },
    haptics: {
      vibrate: async () => capabilityFailure("unavailable", "Platform vibration is unavailable."),
    },
    auth: {
      getLoginCode: async () =>
        capabilityFailure<PlatformLoginCode>("unavailable", "Platform login code is unavailable."),
    },
    ads: {
      showRewardedVideo: async () =>
        capabilityFailure<RewardedVideoResult>("unavailable", "Rewarded video is unavailable."),
    },
    share: {
      shareAppMessage: async () =>
        capabilityFailure<PlatformShareResult>("unavailable", "Platform share is unavailable."),
      shareToFriend: async () =>
        capabilityFailure<PlatformShareResult>("unavailable", "Platform share is unavailable."),
      showShareMenu: async () => capabilityFailure("unavailable", "Platform share menu is unavailable."),
      hideShareMenu: async () => capabilityFailure("unavailable", "Platform share menu is unavailable."),
      updateShareMenu: async () => capabilityFailure("unavailable", "Platform share menu is unavailable."),
      setShareAppMessageHandler: () => noopUnsubscribe,
    },
    engagement: {
      openPage: async () =>
        capabilityFailure<PlatformOpenPageResult>("unavailable", "Platform open page is unavailable."),
      createGameClubButton: () =>
        capabilityFailure<PlatformNativeButtonHandle>("unavailable", "Game club button is unavailable."),
      getGameClubData: async () =>
        capabilityFailure<PlatformGameClubEncryptedData>("unavailable", "Game club data is unavailable."),
    },
    shortcut: {
      addShortcut: async () => capabilityFailure("unavailable", "Shortcut add is unavailable."),
      checkShortcut: async () => capabilityFailure("unavailable", "Shortcut check is unavailable."),
    },
    retention: {
      getSidebarCapability: () =>
        capabilityFailure<SidebarCapabilitySnapshot>("unavailable", "Sidebar retention is unavailable."),
      parseSidebarLaunch: (options) => ({
        fromSidebarCard: false,
        ...(options.scene === undefined ? {} : { scene: options.scene }),
        ...(options.launchFrom === undefined ? {} : { launchFrom: options.launchFrom }),
        ...(options.location === undefined ? {} : { location: options.location }),
        ...(options.raw === undefined ? {} : { raw: options.raw }),
      }),
      checkSidebar: async () => capabilityFailure("unavailable", "Sidebar retention is unavailable."),
      openSidebar: async () => capabilityFailure("unavailable", "Sidebar retention is unavailable."),
      showRevisitGuide: async () => capabilityFailure("unavailable", "Revisit guide is unavailable."),
      reportScene: async () => capabilityFailure("unavailable", "Scene reporting is unavailable."),
    },
    destroy: () => undefined,
  };
}
