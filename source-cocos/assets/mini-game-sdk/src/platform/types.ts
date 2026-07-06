import type { PlatformTarget } from "../core";
import type { ModuleBoundary } from "../core/module-boundary";

export type { PlatformTarget } from "../core";

export const PLATFORM_MODULE_BOUNDARY: ModuleBoundary = {
  name: "platform",
  targetStage: "Stage 1",
  implemented: true,
  owns: [
    "Platform facade shape",
    "Platform capability result model",
    "Douyin, Wechat, Web, and Noop adapter boundaries",
  ],
  nonGoals: [
    "No backend login or account session creation from platform layer",
    "No reward grants or profile mutations from platform layer",
    "No game-specific scene, ad, share, or reporting identifiers",
  ],
};

export type PlatformCapability =
  | "lifecycle.launchOptions"
  | "lifecycle.onShow"
  | "lifecycle.onHide"
  | "audio.innerAudioContext"
  | "haptics.vibrate"
  | "auth.loginCode"
  | "ads.rewardedVideo"
  | "share.appMessage"
  | "share.menu"
  | "share.appMessageHandler"
  | "share.toFriend"
  | "shortcut.add"
  | "shortcut.check"
  | "engagement.openPage"
  | "engagement.gameClubButton"
  | "engagement.gameClubData"
  | "retention.sidebar"
  | "retention.revisitGuide"
  | "retention.reportScene";

export type CapabilityFailureReason =
  | "unavailable"
  | "unsupported"
  | "not_configured"
  | "permission_denied"
  | "user_cancelled"
  | "busy"
  | "timeout"
  | "native_failed"
  | "invalid_response";

export type CapabilityResult<TValue = void> =
  | { readonly ok: true; readonly value: TValue }
  | {
      readonly ok: false;
      readonly reason: CapabilityFailureReason;
      readonly message?: string;
      readonly code?: string;
      readonly raw?: unknown;
    };

export interface PlatformCapabilities {
  readonly lifecycle: {
    readonly launchOptions: boolean;
    readonly onShow: boolean;
    readonly onHide: boolean;
  };
  readonly audio: {
    readonly innerAudioContext: boolean;
  };
  readonly haptics: {
    readonly vibrate: boolean;
  };
  readonly auth: {
    readonly loginCode: boolean;
  };
  readonly ads: {
    readonly rewardedVideo: boolean;
  };
  readonly share: {
    readonly appMessage: boolean;
    readonly menu: boolean;
    readonly appMessageHandler: boolean;
    readonly toFriend: boolean;
  };
  readonly engagement: {
    readonly openPage: boolean;
    readonly gameClubButton: boolean;
    readonly gameClubData: boolean;
  };
  readonly shortcut: {
    readonly add: boolean;
    readonly check: boolean;
  };
  readonly retention: {
    readonly sidebar: boolean;
    readonly revisitGuide: boolean;
    readonly reportScene: boolean;
  };
}

export type PlatformUnsubscribe = () => void;

export interface PlatformLaunchOptions {
  readonly scene?: string;
  readonly query: Readonly<Record<string, unknown>>;
  readonly launchFrom?: string;
  readonly location?: string;
  readonly referrerInfo?: Readonly<Record<string, unknown>>;
  readonly extra?: Readonly<Record<string, unknown>>;
  readonly entryType?: "feed" | "sidebar" | "share" | "direct" | "unknown";
  readonly channel?: string | number | null;
  readonly raw?: unknown;
}

export interface PlatformLifecycle {
  getLaunchOptions(): CapabilityResult<PlatformLaunchOptions | null>;
  onShow(listener: (options: PlatformLaunchOptions) => void): PlatformUnsubscribe;
  onHide(listener: () => void): PlatformUnsubscribe;
}

export interface PlatformInnerAudioContext {
  autoplay: boolean;
  src: string;
  loop: boolean;
  volume: number;
  play(): void;
  pause(): void;
  stop(): void;
  destroy(): void;
  onEnded?(listener: () => void): void;
  offEnded?(listener: () => void): void;
  onError?(listener: (error?: unknown) => void): void;
  offError?(listener: (error?: unknown) => void): void;
}

export interface PlatformAudio {
  readonly preferWebAudioForShortSfx: boolean;
  supportsInnerAudioContext(): boolean;
  createInnerAudioContext(options?: {
    readonly useWebAudioImplement?: boolean;
  }): PlatformInnerAudioContext | null;
}

export type PlatformVibrationKind = "short" | "long";

export interface PlatformHaptics {
  vibrate(kind: PlatformVibrationKind): Promise<CapabilityResult<void>>;
}

export interface PlatformLoginCodeOptions {
  readonly force?: boolean;
  readonly timeoutMs?: number;
}

export interface PlatformLoginCode {
  readonly platform: PlatformTarget;
  readonly code: string;
  readonly isLogin?: boolean;
  readonly issuedAtMs: number;
  readonly expiresAtMs?: number;
  readonly raw?: unknown;
}

export interface PlatformAuth {
  getLoginCode(options?: PlatformLoginCodeOptions): Promise<CapabilityResult<PlatformLoginCode>>;
}

export interface RewardedVideoOptions {
  readonly placementId: string;
  readonly forceReload?: boolean;
  readonly multiton?: boolean;
  readonly disableFallbackSharePage?: boolean;
}

export interface RewardedVideoResult {
  readonly completed: boolean;
  readonly status: "completed" | "closed";
  readonly placementId: string;
  readonly count?: number;
  readonly raw?: unknown;
}

export interface PlatformAds {
  showRewardedVideo(options: RewardedVideoOptions): Promise<CapabilityResult<RewardedVideoResult>>;
}

export interface PlatformShareOptions {
  readonly title?: string;
  readonly desc?: string;
  readonly imageUrl?: string;
  readonly imageUrlId?: string;
  readonly path?: string;
  readonly toCurrentGroup?: boolean;
  readonly query?: string | Readonly<Record<string, string | number | boolean | null | undefined>>;
  readonly channel?: string;
  readonly shareTemplate?: string;
  readonly toUser?: string;
  readonly extra?: Readonly<Record<string, unknown>>;
}

export interface PlatformShareResult {
  readonly completed: boolean;
  readonly channel?: string;
  readonly raw?: unknown;
}

export type PlatformShareMenuItem = "shareAppMessage" | "shareTimeline";

export interface PlatformShareMenuOptions {
  readonly withShareTicket?: boolean;
  readonly menus?: readonly PlatformShareMenuItem[];
}

export interface PlatformShareUpdateMenuOptions extends PlatformShareMenuOptions {
  readonly activityId?: string;
  readonly isUpdatableMessage?: boolean;
  readonly templateInfo?: Readonly<Record<string, unknown>>;
  readonly isPrivateMessage?: boolean;
  readonly toDoActivityId?: string;
  readonly participant?: readonly string[];
  readonly chooseType?: number;
  readonly useForChatTool?: boolean;
}

export type PlatformShareHandlerInput = Readonly<Record<string, unknown>>;
export type PlatformShareHandler = (
  input: PlatformShareHandlerInput,
) => PlatformShareOptions | Promise<PlatformShareOptions>;

export interface PlatformShare {
  shareAppMessage(options?: PlatformShareOptions): Promise<CapabilityResult<PlatformShareResult>>;
  shareToFriend(
    options: PlatformShareOptions & { readonly toUser: string },
  ): Promise<CapabilityResult<PlatformShareResult>>;
  showShareMenu(options?: PlatformShareMenuOptions): Promise<CapabilityResult<void>>;
  hideShareMenu(options?: PlatformShareMenuOptions): Promise<CapabilityResult<void>>;
  updateShareMenu(options?: PlatformShareUpdateMenuOptions): Promise<CapabilityResult<void>>;
  setShareAppMessageHandler(handler: PlatformShareHandler): PlatformUnsubscribe;
}

export interface PlatformOpenPageOptions {
  readonly pageId?: string;
  readonly openlink?: string;
  readonly query?: Readonly<Record<string, unknown>>;
  readonly extraData?: Readonly<Record<string, unknown>>;
  readonly preload?: boolean;
}

export interface PlatformOpenPageResult {
  readonly pageId?: string;
  readonly raw?: unknown;
}

export interface PlatformGameClubButtonStyle {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly backgroundColor?: string;
  readonly borderColor?: string;
  readonly borderWidth?: number;
  readonly borderRadius?: number;
  readonly color?: string;
  readonly textAlign?: "left" | "center" | "right";
  readonly fontSize?: number;
  readonly lineHeight?: number;
}

export interface PlatformGameClubButtonOptions {
  readonly type: "text" | "image";
  readonly style: PlatformGameClubButtonStyle;
  readonly icon?: "green" | "white" | "dark" | "light";
  readonly text?: string;
  readonly image?: string;
  readonly openlink?: string;
  readonly hasRedDot?: boolean;
}

export interface PlatformNativeButtonHandle {
  show(): CapabilityResult<void>;
  hide(): CapabilityResult<void>;
  destroy(): void;
  onTap(listener: (result?: unknown) => void): PlatformUnsubscribe;
}

export interface PlatformGameClubDataType {
  readonly type: number;
  readonly subKey?: string;
}

export interface PlatformGameClubDataOptions {
  readonly dataTypeList: readonly PlatformGameClubDataType[];
}

export interface PlatformGameClubEncryptedData {
  readonly cloudId?: string;
  readonly encryptedData: string;
  readonly iv: string;
  readonly signature: string;
  readonly raw?: unknown;
}

export interface PlatformEngagement {
  openPage(options: PlatformOpenPageOptions): Promise<CapabilityResult<PlatformOpenPageResult>>;
  createGameClubButton(options: PlatformGameClubButtonOptions): CapabilityResult<PlatformNativeButtonHandle>;
  getGameClubData(options: PlatformGameClubDataOptions): Promise<CapabilityResult<PlatformGameClubEncryptedData>>;
}

export interface PlatformShortcutStatus {
  readonly added: boolean;
  readonly raw?: unknown;
}

export interface PlatformShortcut {
  addShortcut(): Promise<CapabilityResult<void>>;
  checkShortcut(): Promise<CapabilityResult<PlatformShortcutStatus>>;
}

export interface SidebarCapabilitySnapshot {
  readonly supportedHost: boolean;
  readonly sceneAvailable: boolean | "unknown";
  readonly canCheckScene: boolean;
  readonly canOpenSidebar: boolean;
  readonly canShowRevisitGuide: boolean;
  readonly raw?: unknown;
}

export interface SidebarLaunchSnapshot {
  readonly fromSidebarCard: boolean;
  readonly scene?: string;
  readonly launchFrom?: string;
  readonly location?: string;
  readonly raw?: unknown;
}

export interface PlatformReportSceneOptions {
  readonly sceneId?: number;
  readonly raw?: unknown;
}

export interface PlatformRetention {
  getSidebarCapability(): CapabilityResult<SidebarCapabilitySnapshot>;
  parseSidebarLaunch(options: PlatformLaunchOptions): SidebarLaunchSnapshot;
  checkSidebar(): Promise<CapabilityResult<{ readonly available: boolean | "unknown"; readonly raw?: unknown }>>;
  openSidebar(options?: { readonly extraData?: Readonly<Record<string, unknown>> }): Promise<CapabilityResult<void>>;
  showRevisitGuide(
    options?: { readonly extraData?: Readonly<Record<string, unknown>> },
  ): Promise<CapabilityResult<void>>;
  reportScene(options?: PlatformReportSceneOptions): Promise<CapabilityResult<void>>;
}

export interface PlatformAdapter {
  readonly target: PlatformTarget;
  readonly capabilities: PlatformCapabilities;
  readonly lifecycle: PlatformLifecycle;
  readonly audio: PlatformAudio;
  readonly haptics: PlatformHaptics;
  readonly auth: PlatformAuth;
  readonly ads: PlatformAds;
  readonly share: PlatformShare;
  readonly engagement: PlatformEngagement;
  readonly shortcut: PlatformShortcut;
  readonly retention: PlatformRetention;
  destroy?(): void;
}

export interface PlatformFacade extends PlatformAdapter {
  isCapabilitySupported(capability: PlatformCapability): boolean;
  destroy(): void;
}
