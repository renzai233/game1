import { SdkError } from "./errors";
import type { LoggerConfig } from "./logger";
import type {
  TelemetryDebugSink,
  TelemetryPayloadValidator,
  TelemetryStoragePort,
  TelemetryTokenProvider,
  TelemetryTransport,
  TrackingPlan,
} from "../telemetry";
import type { ProfileModuleConfig } from "../profile";
import type { CommerceModuleConfig } from "../commerce";
import type { AudioModuleConfig } from "../audio";
import type { HapticsModuleConfig as SdkHapticsModuleConfig } from "../haptics";
import { assertValidAudioModuleConfig } from "../audio/config-validation";
import { assertValidHapticsModuleConfig } from "../haptics/config-validation";

export type SdkEnvironment = "dev" | "test" | "prod";

export interface AppConfig {
  readonly gameId: string;
  readonly appVersion: string;
  readonly environment: SdkEnvironment;
}

export type PlatformTarget = "douyin" | "wechat" | "web" | "noop";

export interface RewardedVideoPlacementConfig {
  readonly placements?: Readonly<Record<string, string>>;
}

export interface WechatRewardedVideoConfig extends RewardedVideoPlacementConfig {
  readonly timeoutMs?: number;
  readonly multiton?: boolean;
  readonly disableFallbackSharePage?: boolean;
}

export interface PlatformShareConfig {
  readonly defaultChannel?: string;
  readonly defaultShareTemplate?: string;
}

export type WechatShareMenuItem = "shareAppMessage" | "shareTimeline";

export interface WechatShareConfig extends PlatformShareConfig {
  readonly defaultTitle?: string;
  readonly defaultImageUrl?: string;
  readonly defaultImageUrlId?: string;
  readonly defaultPath?: string;
  readonly withShareTicket?: boolean;
  readonly menus?: readonly WechatShareMenuItem[];
}

export interface WechatOpenPageConfig {
  readonly openlinks?: Readonly<Record<string, string>>;
}

export interface PlatformRetentionConfig {
  readonly reportSceneId?: number;
}

export interface PlatformAudioConfig {
  readonly preferWebAudioForShortSfx?: boolean;
}

export interface DouyinPlatformConfig {
  readonly runtime?: unknown;
  readonly loginTimeoutMs?: number;
  readonly rewardedVideo?: RewardedVideoPlacementConfig;
  readonly share?: PlatformShareConfig;
  readonly retention?: PlatformRetentionConfig;
  readonly audio?: PlatformAudioConfig;
}

export interface WechatPlatformConfig {
  readonly runtime?: unknown;
  readonly loginTimeoutMs?: number;
  readonly rewardedVideo?: WechatRewardedVideoConfig;
  readonly share?: WechatShareConfig;
  readonly openPage?: WechatOpenPageConfig;
  readonly audio?: PlatformAudioConfig;
}

export interface WebPlatformConfig {
  readonly runtime?: unknown;
}

export interface NoopPlatformConfig {
  readonly runtime?: unknown;
}

export interface PlatformConfig {
  readonly target: PlatformTarget | "auto";
  readonly douyin?: DouyinPlatformConfig;
  readonly wechat?: WechatPlatformConfig;
  readonly web?: WebPlatformConfig;
  readonly noop?: NoopPlatformConfig;
}

export const DEFAULT_BACKEND_LOGIN_PATH_TEMPLATE = "/api/auth/{platform}/login";
export const DEFAULT_BACKEND_TELEMETRY_BATCH_PATH = "/telemetry/v1/batch";

export interface BackendRequestInput {
  readonly url: string;
  readonly method: "POST";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly timeoutMs?: number;
}

export interface BackendResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly text?: string;
}

export type BackendRequest = (input: BackendRequestInput) => Promise<BackendResponse>;

export interface BackendConfig {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly loginPathTemplate?: string;
  readonly telemetryBatchPath?: string;
  readonly telemetryAppId?: string;
  readonly telemetryIngestKey?: string;
  readonly telemetryEnvironment?: string;
  readonly request?: BackendRequest;
}

export interface AccountModuleConfig {
  readonly enabled?: boolean;
  readonly autoLogin?: boolean;
}

export type TelemetryQueueDropPolicy = "drop_newest" | "drop_oldest";

export interface TelemetryQueueConfig {
  readonly maxEvents?: number;
  readonly maxBatchSize?: number;
  readonly maxEventBytes?: number;
  readonly flushIntervalMs?: number;
  readonly retryLimit?: number;
  readonly retryBaseDelayMs?: number;
  readonly retryMaxDelayMs?: number;
  readonly dropPolicy?: TelemetryQueueDropPolicy;
}

export interface TelemetryModuleConfig {
  readonly enabled?: boolean;
  readonly autoTrackSdkEvents?: boolean;
  readonly queue?: TelemetryQueueConfig;
  readonly trackingPlan?: TrackingPlan;
  readonly payloadValidator?: TelemetryPayloadValidator;
  readonly transport?: TelemetryTransport;
  readonly tokenProvider?: TelemetryTokenProvider;
  readonly storage?: TelemetryStoragePort;
  readonly debugSinks?: readonly TelemetryDebugSink[];
  readonly deviceId?: string;
  readonly deviceIdStorageKey?: string;
  readonly pendingStorageKey?: string;
}

export type HapticsModuleConfig = SdkHapticsModuleConfig;

export interface ModuleConfig {
  readonly account?: AccountModuleConfig;
  readonly audio?: AudioModuleConfig;
  readonly haptics?: HapticsModuleConfig;
  readonly profile?: ProfileModuleConfig;
  readonly telemetry?: TelemetryModuleConfig;
  readonly commerce?: CommerceModuleConfig;
  readonly operations?: Readonly<Record<string, unknown>>;
  readonly guide?: Readonly<Record<string, unknown>>;
  readonly redDot?: Readonly<Record<string, unknown>>;
}

export interface MiniGameSdkConfig {
  readonly app: AppConfig;
  readonly platform?: PlatformConfig;
  readonly backend?: BackendConfig;
  readonly modules?: ModuleConfig;
  readonly logger?: LoggerConfig;
}

const ENVIRONMENTS: ReadonlySet<string> = new Set<SdkEnvironment>(["dev", "test", "prod"]);
const PLATFORM_TARGETS: ReadonlySet<string> = new Set<PlatformTarget | "auto">([
  "auto",
  "douyin",
  "wechat",
  "web",
  "noop",
]);

export function assertValidConfig(config: MiniGameSdkConfig): void {
  if (config.app.gameId.trim().length === 0) {
    throw new SdkError("config.invalid", "app.gameId is required.");
  }

  if (config.app.appVersion.trim().length === 0) {
    throw new SdkError("config.invalid", "app.appVersion is required.");
  }

  if (!ENVIRONMENTS.has(config.app.environment)) {
    throw new SdkError("config.invalid", "app.environment must be dev, test, or prod.", {
      metadata: { environment: config.app.environment },
    });
  }

  if (config.platform !== undefined && !PLATFORM_TARGETS.has(config.platform.target)) {
    throw new SdkError("config.invalid", "platform.target is invalid.", {
      metadata: { target: config.platform.target },
    });
  }

  if (config.backend !== undefined && config.backend.baseUrl.trim().length === 0) {
    throw new SdkError("config.invalid", "backend.baseUrl must be non-empty when backend is set.");
  }

  if (config.backend !== undefined) {
    assertOptionalNonEmpty("backend.loginPathTemplate", config.backend.loginPathTemplate);
    assertOptionalNonEmpty("backend.telemetryBatchPath", config.backend.telemetryBatchPath);
    assertOptionalNonEmpty("backend.telemetryAppId", config.backend.telemetryAppId);
    assertOptionalNonEmpty("backend.telemetryIngestKey", config.backend.telemetryIngestKey);
    assertOptionalNonEmpty("backend.telemetryEnvironment", config.backend.telemetryEnvironment);
  }

  const profileReceiptLimit = config.modules?.profile?.commandReceiptRetentionLimit;
  if (
    profileReceiptLimit !== undefined &&
    (!Number.isInteger(profileReceiptLimit) || profileReceiptLimit <= 0)
  ) {
    throw new SdkError(
      "config.invalid",
      "modules.profile.commandReceiptRetentionLimit must be a positive integer when set.",
      { metadata: { commandReceiptRetentionLimit: profileReceiptLimit } },
    );
  }

  assertOptionalPositiveInteger(
    "modules.commerce.ledgerRetentionLimit",
    config.modules?.commerce?.ledgerRetentionLimit,
  );
  assertOptionalPositiveInteger(
    "modules.commerce.commandReceiptRetentionLimit",
    config.modules?.commerce?.commandReceiptRetentionLimit,
  );
  assertOptionalPositiveInteger(
    "modules.commerce.inactiveClaimOpportunityRetentionLimit",
    config.modules?.commerce?.inactiveClaimOpportunityRetentionLimit,
  );
  assertOptionalPositiveInteger(
    "modules.commerce.claimedTombstoneRetentionLimit",
    config.modules?.commerce?.claimedTombstoneRetentionLimit,
  );

  assertOptionalNonEmpty("modules.telemetry.pendingStorageKey", config.modules?.telemetry?.pendingStorageKey);

  assertOptionalPositiveInteger(
    "platform.wechat.rewardedVideo.timeoutMs",
    config.platform?.wechat?.rewardedVideo?.timeoutMs,
  );

  assertOptionalStringRecordValues(
    "platform.wechat.openPage.openlinks",
    config.platform?.wechat?.openPage?.openlinks,
  );

  assertValidAudioModuleConfig(config.modules?.audio);
  assertValidHapticsModuleConfig(config.modules?.haptics);
}

function assertOptionalNonEmpty(fieldName: string, value: string | undefined): void {
  if (value !== undefined && value.trim().length === 0) {
    throw new SdkError("config.invalid", `${fieldName} must be non-empty when set.`);
  }
}

function assertOptionalPositiveInteger(fieldName: string, value: number | undefined): void {
  if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
    throw new SdkError("config.invalid", `${fieldName} must be a positive integer when set.`, {
      metadata: { [fieldName]: value },
    });
  }
}

function assertOptionalStringRecordValues(
  fieldName: string,
  value: Readonly<Record<string, string>> | undefined,
): void {
  if (value === undefined) {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (key.trim().length === 0 || entry.trim().length === 0) {
      throw new SdkError("config.invalid", `${fieldName} keys and values must be non-empty when set.`, {
        metadata: { key },
      });
    }
  }
}
