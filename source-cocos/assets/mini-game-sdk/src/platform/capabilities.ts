import type {
  CapabilityFailureReason,
  CapabilityResult,
  PlatformCapabilities,
  PlatformCapability,
} from "./types";

export const NOOP_PLATFORM_CAPABILITIES: PlatformCapabilities = {
  lifecycle: {
    launchOptions: false,
    onShow: false,
    onHide: false,
  },
  audio: {
    innerAudioContext: false,
  },
  haptics: {
    vibrate: false,
  },
  auth: {
    loginCode: false,
  },
  ads: {
    rewardedVideo: false,
  },
  share: {
    appMessage: false,
    menu: false,
    appMessageHandler: false,
    toFriend: false,
  },
  engagement: {
    openPage: false,
    gameClubButton: false,
    gameClubData: false,
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
};

export function capabilityFailure<TValue>(
  reason: CapabilityFailureReason,
  message: string,
  options: { readonly code?: string | undefined; readonly raw?: unknown } = {},
): CapabilityResult<TValue> {
  return {
    ok: false,
    reason,
    message,
    ...(options.code === undefined ? {} : { code: options.code }),
    ...(options.raw === undefined ? {} : { raw: options.raw }),
  };
}

export function capabilitySuccess<TValue>(value: TValue): CapabilityResult<TValue> {
  return { ok: true, value };
}

export function isCapabilityEnabled(
  capabilities: PlatformCapabilities,
  capability: PlatformCapability,
): boolean {
  switch (capability) {
    case "lifecycle.launchOptions":
      return capabilities.lifecycle.launchOptions;
    case "lifecycle.onShow":
      return capabilities.lifecycle.onShow;
    case "lifecycle.onHide":
      return capabilities.lifecycle.onHide;
    case "audio.innerAudioContext":
      return capabilities.audio.innerAudioContext;
    case "haptics.vibrate":
      return capabilities.haptics.vibrate;
    case "auth.loginCode":
      return capabilities.auth.loginCode;
    case "ads.rewardedVideo":
      return capabilities.ads.rewardedVideo;
    case "share.appMessage":
      return capabilities.share.appMessage;
    case "share.menu":
      return capabilities.share.menu;
    case "share.appMessageHandler":
      return capabilities.share.appMessageHandler;
    case "share.toFriend":
      return capabilities.share.toFriend;
    case "engagement.openPage":
      return capabilities.engagement.openPage;
    case "engagement.gameClubButton":
      return capabilities.engagement.gameClubButton;
    case "engagement.gameClubData":
      return capabilities.engagement.gameClubData;
    case "shortcut.add":
      return capabilities.shortcut.add;
    case "shortcut.check":
      return capabilities.shortcut.check;
    case "retention.sidebar":
      return capabilities.retention.sidebar;
    case "retention.revisitGuide":
      return capabilities.retention.revisitGuide;
    case "retention.reportScene":
      return capabilities.retention.reportScene;
  }
}

export function cloneCapabilities(capabilities: PlatformCapabilities): PlatformCapabilities {
  return {
    lifecycle: { ...capabilities.lifecycle },
    audio: { ...capabilities.audio },
    haptics: { ...capabilities.haptics },
    auth: { ...capabilities.auth },
    ads: { ...capabilities.ads },
    share: { ...capabilities.share },
    engagement: { ...capabilities.engagement },
    shortcut: { ...capabilities.shortcut },
    retention: { ...capabilities.retention },
  };
}
