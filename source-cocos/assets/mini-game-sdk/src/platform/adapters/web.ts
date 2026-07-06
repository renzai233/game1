import { capabilityFailure, capabilitySuccess, NOOP_PLATFORM_CAPABILITIES } from "../capabilities";
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

interface VibrationNavigator {
  vibrate?: (pattern: number | readonly number[]) => boolean;
}

export function createWebPlatformAdapter(): PlatformAdapter {
  return {
    target: "web",
    capabilities: {
      ...NOOP_PLATFORM_CAPABILITIES,
      lifecycle: {
        launchOptions: true,
        onShow: false,
        onHide: false,
      },
      audio: {
        innerAudioContext: false,
      },
      haptics: {
        vibrate: typeof (globalThis.navigator as VibrationNavigator | undefined)?.vibrate === "function",
      },
    },
    lifecycle: {
      getLaunchOptions: () => capabilitySuccess(null),
      onShow: () => noopUnsubscribe,
      onHide: () => noopUnsubscribe,
    },
    audio: {
      preferWebAudioForShortSfx: false,
      supportsInnerAudioContext: () => false,
      createInnerAudioContext: () => null,
    },
    haptics: {
      vibrate: async (kind) => {
        const nav = globalThis.navigator as VibrationNavigator | undefined;
        if (typeof nav?.vibrate !== "function") {
          return capabilityFailure("unavailable", "Web vibration is unavailable.");
        }

        try {
          const accepted = nav.vibrate(kind === "short" ? 30 : 400);
          return accepted
            ? capabilitySuccess(undefined)
            : capabilityFailure("native_failed", "navigator.vibrate returned false.");
        } catch (error) {
          return capabilityFailure("native_failed", "navigator.vibrate failed.", { raw: error });
        }
      },
    },
    auth: {
      getLoginCode: async () =>
        capabilityFailure<PlatformLoginCode>("unavailable", "Web login code is unavailable."),
    },
    ads: {
      showRewardedVideo: async () =>
        capabilityFailure<RewardedVideoResult>("unavailable", "Web rewarded video is unavailable."),
    },
    share: {
      shareAppMessage: async () =>
        capabilityFailure<PlatformShareResult>("unavailable", "Web platform share is unavailable."),
      shareToFriend: async () =>
        capabilityFailure<PlatformShareResult>("unavailable", "Web platform share is unavailable."),
      showShareMenu: async () => capabilityFailure("unavailable", "Web share menu is unavailable."),
      hideShareMenu: async () => capabilityFailure("unavailable", "Web share menu is unavailable."),
      updateShareMenu: async () => capabilityFailure("unavailable", "Web share menu is unavailable."),
      setShareAppMessageHandler: () => noopUnsubscribe,
    },
    engagement: {
      openPage: async () =>
        capabilityFailure<PlatformOpenPageResult>("unavailable", "Web open page is unavailable."),
      createGameClubButton: () =>
        capabilityFailure<PlatformNativeButtonHandle>("unavailable", "Web game club button is unavailable."),
      getGameClubData: async () =>
        capabilityFailure<PlatformGameClubEncryptedData>("unavailable", "Web game club data is unavailable."),
    },
    shortcut: {
      addShortcut: async () => capabilityFailure("unavailable", "Web shortcut add is unavailable."),
      checkShortcut: async () => capabilityFailure("unavailable", "Web shortcut check is unavailable."),
    },
    retention: {
      getSidebarCapability: () =>
        capabilityFailure<SidebarCapabilitySnapshot>("unavailable", "Web sidebar retention is unavailable."),
      parseSidebarLaunch: (options) => ({
        fromSidebarCard: false,
        ...(options.scene === undefined ? {} : { scene: options.scene }),
        ...(options.launchFrom === undefined ? {} : { launchFrom: options.launchFrom }),
        ...(options.location === undefined ? {} : { location: options.location }),
        ...(options.raw === undefined ? {} : { raw: options.raw }),
      }),
      checkSidebar: async () => capabilityFailure("unavailable", "Web sidebar retention is unavailable."),
      openSidebar: async () => capabilityFailure("unavailable", "Web sidebar retention is unavailable."),
      showRevisitGuide: async () => capabilityFailure("unavailable", "Web revisit guide is unavailable."),
      reportScene: async () => capabilityFailure("unavailable", "Web scene reporting is unavailable."),
    },
    destroy: () => undefined,
  };
}
