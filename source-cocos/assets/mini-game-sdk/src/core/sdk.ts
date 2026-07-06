import { createAccountService, createHttpBackendSilentLoginPort, type AccountService } from "../account";
import {
  createAudioService,
} from "../audio/service";
import { createDisabledAudioService, type AudioService, type AudioRuntimeService } from "../audio";
import { createDisabledCommerceService, type CommerceService } from "../commerce";
import { createCommerceService } from "../commerce/service";
import {
  createCocosAudioLifecycleBridge,
  createDefaultAudioBackend,
} from "../cocos/audio";
import {
  createPlatformFacade,
  type CapabilityResult,
  type PlatformFacade,
  type RewardedVideoOptions,
  type RewardedVideoResult,
} from "../platform";
import {
  type ProfileService,
} from "../profile";
import { createProfileSdkOwnedModuleWriter, createProfileService } from "../profile/service";
import { createDisabledHapticsService, type HapticsRuntimeService, type HapticsService } from "../haptics";
import { createHapticsService } from "../haptics/service";
import {
  createBackendTelemetryTransport,
  createDefaultTelemetryTokenProvider,
  createTelemetryService,
  type TelemetryService,
} from "../telemetry";
import { createSystemClock, type Clock } from "./clock";
import { assertValidConfig, type BackendConfig, type MiniGameSdkConfig } from "./config";
import { createSdkContext, type SdkContext, type SdkEventMap } from "./context";
import { createEventBus, type EventBus, type Unsubscribe } from "./event-bus";
import { SdkError } from "./errors";
import { createConsoleLogger, type Logger } from "./logger";
import { SdkModuleManager, type SdkModule, type SdkModuleSnapshot } from "./module";
import { fail, ok, type Result } from "./result";
import { SDK_VERSION } from "./version";

export type SdkRuntimeState = "created" | "initialized" | "started" | "destroyed";

export interface MiniGameSdk {
  readonly context: SdkContext;
  readonly state: SdkRuntimeState;
  readonly platform: PlatformFacade;
  readonly account: AccountService;
  readonly profile: ProfileService;
  readonly telemetry: TelemetryService;
  readonly commerce: CommerceService;
  readonly audio: AudioService;
  readonly haptics: HapticsService;
  registerModule(module: SdkModule): Result<void, SdkError>;
  modules(): readonly SdkModuleSnapshot[];
  init(): Promise<Result<void, SdkError>>;
  start(): Promise<Result<void, SdkError>>;
  destroy(): Promise<Result<void, SdkError>>;
}

export interface MiniGameSdkOptions {
  readonly modules?: readonly SdkModule[];
  readonly logger?: Logger;
  readonly clock?: Clock;
  readonly events?: EventBus<SdkEventMap>;
}

class DefaultMiniGameSdk implements MiniGameSdk {
  private readonly manager = new SdkModuleManager();
  private runtimeState: SdkRuntimeState = "created";

  readonly context: SdkContext;
  readonly platform: PlatformFacade;
  readonly account: AccountService;
  readonly profile: ProfileService;
  readonly telemetry: TelemetryService;
  readonly commerce: CommerceService;
  readonly audio: AudioService;
  readonly haptics: HapticsService;
  private readonly audioRuntime: AudioRuntimeService;
  private readonly hapticsRuntime: HapticsRuntimeService;
  private readonly accountAutoLogin: boolean;
  private readonly accountHasBackendLoginPort: boolean;
  private readonly profileAutoSync: boolean;
  private readonly platformEventUnsubscribers: Unsubscribe[] = [];
  private platformEventBridgeStarted = false;
  private lastShowAtMs: number | undefined;
  private lastHideAtMs: number | undefined;

  constructor(config: MiniGameSdkConfig, options: MiniGameSdkOptions = {}) {
    assertValidConfig(config);

    const clock = options.clock ?? createSystemClock();
    const events = options.events ?? createEventBus<SdkEventMap>();
    const logger = options.logger ?? createConsoleLogger(config.logger);

    this.context = createSdkContext({
      config,
      events,
      logger,
      clock,
      sdkVersion: SDK_VERSION,
    });

    this.platform = createPlatformFacade(config.platform, {
      clock,
      rewardedVideoLifecycle: {
        onStarted: (input) => this.emitRewardedVideoStarted(input),
        onEnded: (input, result) => this.emitRewardedVideoEnded(input, result),
      },
    });
    const accountEnabled = config.modules?.account?.enabled ?? true;
    const backendLoginPort =
      config.backend === undefined ? undefined : createHttpBackendSilentLoginPort(config.backend);
    this.account = createAccountService(
      backendLoginPort === undefined
        ? {
            context: this.context,
            platform: this.platform,
            enabled: accountEnabled,
          }
        : {
            context: this.context,
            platform: this.platform,
            backendLoginPort,
            enabled: accountEnabled,
          },
    );
    this.accountAutoLogin = accountEnabled && (config.modules?.account?.autoLogin ?? false);
    this.accountHasBackendLoginPort = backendLoginPort !== undefined;
    this.profileAutoSync = config.modules?.profile?.enabled === true &&
      (config.modules.profile.autoSync ?? false);
    this.profile = createProfileService({
      context: this.context,
      account: this.account,
      ...(config.modules?.profile === undefined ? {} : { config: config.modules.profile }),
    });
    const audioConfig = config.modules?.audio;
    const audioProfileWriter = createProfileSdkOwnedModuleWriter(this.profile, {
      owner: "sdk:audio",
    });
    this.audioRuntime = audioConfig?.enabled === true
      ? createAudioService({
          context: this.context,
          platform: this.platform,
          config: audioConfig,
          profileWriter: audioProfileWriter,
          backend: createDefaultAudioBackend({
            config: audioConfig,
            platform: this.platform,
          }),
          lifecycleBridge: createCocosAudioLifecycleBridge(),
        })
      : createDisabledAudioService();
    this.audio = this.audioRuntime;
    const hapticsConfig = config.modules?.haptics;
    const hapticsProfileWriter = createProfileSdkOwnedModuleWriter(this.profile, {
      owner: "sdk:haptics",
    });
    this.hapticsRuntime = hapticsConfig?.enabled === true
      ? createHapticsService({
          context: this.context,
          platform: this.platform,
          config: hapticsConfig ?? {},
          profileWriter: hapticsProfileWriter,
        })
      : createDisabledHapticsService();
    this.haptics = this.hapticsRuntime;
    const commerceConfig = config.modules?.commerce;
    const commerceProfileWriter = createProfileSdkOwnedModuleWriter(this.profile, {
      owner: "sdk:commerce",
    });
    this.commerce = commerceConfig?.enabled === true
      ? createCommerceService({
          context: this.context,
          profile: this.profile,
          profileWriter: commerceProfileWriter,
          config: commerceConfig,
        })
      : createDisabledCommerceService({
          context: this.context,
          profile: this.profile,
          ...(commerceConfig === undefined ? {} : { config: commerceConfig }),
        });
    const telemetryConfig = config.modules?.telemetry;
    const telemetryTransport =
      telemetryConfig?.transport ?? createConfiguredTelemetryTransport(config.backend);
    const telemetryTokenProvider =
      telemetryConfig?.tokenProvider ??
      createDefaultTelemetryTokenProvider({
        ...(config.backend === undefined ? {} : { config: config.backend }),
        account: this.account,
      });
    this.telemetry = createTelemetryService({
      context: this.context,
      platform: this.platform,
      account: this.account,
      enabled: telemetryConfig?.enabled ?? true,
      autoTrackSdkEvents: telemetryConfig?.autoTrackSdkEvents ?? true,
      ...(telemetryConfig?.queue === undefined ? {} : { queue: telemetryConfig.queue }),
      ...(telemetryConfig?.trackingPlan === undefined ? {} : { trackingPlan: telemetryConfig.trackingPlan }),
      ...(telemetryConfig?.payloadValidator === undefined
        ? {}
        : { payloadValidator: telemetryConfig.payloadValidator }),
      ...(telemetryTransport === undefined ? {} : { transport: telemetryTransport }),
      tokenProvider: telemetryTokenProvider,
      ...(telemetryConfig?.storage === undefined ? {} : { storage: telemetryConfig.storage }),
      ...(telemetryConfig?.debugSinks === undefined ? {} : { debugSinks: telemetryConfig.debugSinks }),
      ...(telemetryConfig?.deviceId === undefined ? {} : { deviceId: telemetryConfig.deviceId }),
      ...(telemetryConfig?.deviceIdStorageKey === undefined
        ? {}
        : { deviceIdStorageKey: telemetryConfig.deviceIdStorageKey }),
      ...(telemetryConfig?.pendingStorageKey === undefined
        ? {}
        : { pendingStorageKey: telemetryConfig.pendingStorageKey }),
    });

    for (const module of options.modules ?? []) {
      const result = this.manager.register(module);
      if (!result.ok) {
        throw result.error;
      }
    }
  }

  get state(): SdkRuntimeState {
    return this.runtimeState;
  }

  registerModule(module: SdkModule): Result<void, SdkError> {
    if (this.runtimeState !== "created") {
      return fail(
        new SdkError("lifecycle.invalid_state", "Modules can only be registered before init.", {
          metadata: { state: this.runtimeState },
        }),
      );
    }

    return this.manager.register(module);
  }

  modules(): readonly SdkModuleSnapshot[] {
    return this.manager.snapshot();
  }

  async init(): Promise<Result<void, SdkError>> {
    if (this.runtimeState === "initialized" || this.runtimeState === "started") {
      return ok(undefined);
    }

    if (this.runtimeState === "destroyed") {
      return fail(new SdkError("lifecycle.invalid_state", "Destroyed SDK cannot be initialized."));
    }

    const result = await this.manager.initAll(this.context);
    if (!result.ok) {
      return result;
    }

    this.startPlatformEventBridge();
    this.runtimeState = "initialized";
    const eventResult = this.context.events.emit("sdk.initialized", {
      atMs: this.context.clock.now(),
    });

    if (!eventResult.ok) {
      return eventResult;
    }

    this.context.logger.info("SDK initialized", {
      sdkVersion: this.context.runtime.sdkVersion,
    });

    return ok(undefined);
  }

  async start(): Promise<Result<void, SdkError>> {
    if (this.runtimeState === "started") {
      return ok(undefined);
    }

    if (this.runtimeState === "destroyed") {
      return fail(new SdkError("lifecycle.invalid_state", "Destroyed SDK cannot be started."));
    }

    if (this.runtimeState === "created") {
      const initResult = await this.init();
      if (!initResult.ok) {
        return initResult;
      }
    }

    const result = await this.manager.startAll();
    if (!result.ok) {
      return result;
    }

    const audioStartResult = await this.audioRuntime.start();
    if (!audioStartResult.ok) {
      return audioStartResult;
    }

    const hapticsStartResult = await this.hapticsRuntime.start();
    if (!hapticsStartResult.ok) {
      return hapticsStartResult;
    }

    this.runtimeState = "started";
    const eventResult = this.context.events.emit("sdk.started", {
      atMs: this.context.clock.now(),
    });

    if (!eventResult.ok) {
      return eventResult;
    }

    this.context.logger.info("SDK started");
    await this.runAccountAutoLogin();
    await this.runProfileAutoSync();
    return ok(undefined);
  }

  async destroy(): Promise<Result<void, SdkError>> {
    if (this.runtimeState === "destroyed") {
      return ok(undefined);
    }

    const result = await this.manager.destroyAll();
    if (!result.ok) {
      return result;
    }

    const eventResult = this.context.events.emit("sdk.destroyed", {
      atMs: this.context.clock.now(),
      flushAttempted: true,
    });
    if (!eventResult.ok) {
      this.context.logger.warn("SDK destroyed event handler failed.", {
        error: eventResult.error,
      });
    }

    try {
      this.account.destroy();
      await this.audioRuntime.destroy();
      await this.hapticsRuntime.destroy();
      await this.commerce.destroy();
      await this.profile.destroy();
      await this.telemetry.destroy();
      this.stopPlatformEventBridge();
      this.platform.destroy();
    } catch (error) {
      return fail(SdkError.fromUnknown("module.destroy_failed", "Built-in SDK service destroy failed.", error));
    }

    this.runtimeState = "destroyed";
    this.context.events.clear();

    this.context.logger.info("SDK destroyed");
    if (!eventResult.ok) {
      return eventResult;
    }

    return ok(undefined);
  }

  private startPlatformEventBridge(): void {
    if (this.platformEventBridgeStarted) {
      return;
    }

    this.platformEventBridgeStarted = true;
    const launchOptions = this.platform.lifecycle.getLaunchOptions();
    if (launchOptions.ok && launchOptions.value !== null) {
      const now = this.context.clock.now();
      this.lastShowAtMs = now;
      this.emitPlatformEvent("platform.launch", {
        atMs: now,
        target: this.platform.target,
        launchOptions: launchOptions.value,
      });
    }

    this.platformEventUnsubscribers.push(
      this.platform.lifecycle.onShow((options) => {
        const now = this.context.clock.now();
        const backgroundDurationMs =
          this.lastHideAtMs === undefined ? undefined : Math.max(0, now - this.lastHideAtMs);
        this.lastShowAtMs = now;
        this.emitPlatformEvent("platform.show", {
          atMs: now,
          target: this.platform.target,
          launchOptions: options,
          ...(backgroundDurationMs === undefined ? {} : { backgroundDurationMs }),
        });
      }),
    );

    this.platformEventUnsubscribers.push(
      this.platform.lifecycle.onHide(() => {
        const now = this.context.clock.now();
        const foregroundDurationMs =
          this.lastShowAtMs === undefined ? undefined : Math.max(0, now - this.lastShowAtMs);
        this.lastHideAtMs = now;
        this.emitPlatformEvent("platform.hide", {
          atMs: now,
          target: this.platform.target,
          ...(foregroundDurationMs === undefined ? {} : { foregroundDurationMs }),
        });
      }),
    );
  }

  private stopPlatformEventBridge(): void {
    for (const unsubscribe of this.platformEventUnsubscribers) {
      try {
        unsubscribe();
      } catch {
        // Best-effort lifecycle bridge cleanup.
      }
    }
    this.platformEventUnsubscribers.length = 0;
  }

  private emitPlatformEvent<TKey extends "platform.launch" | "platform.show" | "platform.hide">(
    eventName: TKey,
    payload: SdkEventMap[TKey],
  ): void {
    const result = this.context.events.emit(eventName, payload);
    if (!result.ok) {
      this.context.logger.warn("Platform public event handler failed.", {
        error: result.error,
        eventName,
      });
    }
  }

  private emitRewardedVideoStarted(input: RewardedVideoOptions): void {
    const result = this.context.events.emit("platform.rewarded_video.started", {
      atMs: this.context.clock.now(),
      target: this.platform.target,
      placementId: input.placementId,
    });

    if (!result.ok) {
      this.context.logger.warn("Rewarded video started event handler failed.", {
        error: result.error,
      });
    }
  }

  private emitRewardedVideoEnded(
    input: RewardedVideoOptions,
    rewardedResult: CapabilityResult<RewardedVideoResult>,
  ): void {
    const result = this.context.events.emit("platform.rewarded_video.ended", {
      atMs: this.context.clock.now(),
      target: this.platform.target,
      placementId: input.placementId,
      status: rewardedResult.ok ? rewardedResult.value.status : "failed",
      ...(rewardedResult.ok ? {} : { reason: rewardedResult.reason }),
    });

    if (!result.ok) {
      this.context.logger.warn("Rewarded video ended event handler failed.", {
        error: result.error,
      });
    }
  }

  private async runAccountAutoLogin(): Promise<void> {
    if (!this.accountAutoLogin) {
      return;
    }

    if (!this.accountHasBackendLoginPort) {
      this.context.logger.warn("Account auto-login skipped because backend login is not configured.");
      return;
    }

    if (!this.platform.isCapabilitySupported("auth.loginCode")) {
      this.context.logger.info("Account auto-login skipped because platform login code is unavailable.", {
        platform: this.platform.target,
      });
      return;
    }

    const result = await this.account.silentLogin();
    if (!result.ok) {
      this.context.logger.warn("Account auto-login failed.", {
        code: result.error.code,
        message: result.error.message,
      });
    }
  }

  private async runProfileAutoSync(): Promise<void> {
    if (!this.profileAutoSync) {
      return;
    }

    const result = await this.profile.syncCloudSnapshot({
      traceId: "sdk.start.profile.auto_sync",
    });
    if (!result.ok) {
      this.context.logger.warn("Profile auto-sync failed.", {
        code: result.error.code,
        message: result.error.message,
      });
      return;
    }

    if (result.value.status === "skipped") {
      this.context.logger.info("Profile auto-sync skipped.", {
        skippedReason: result.value.skippedReason,
      });
    }
  }
}

function createConfiguredTelemetryTransport(config: BackendConfig | undefined) {
  if (
    config === undefined ||
    config.telemetryAppId === undefined ||
    config.telemetryIngestKey === undefined ||
    config.telemetryEnvironment === undefined
  ) {
    return undefined;
  }

  return createBackendTelemetryTransport(config);
}

export function createMiniGameSdk(
  config: MiniGameSdkConfig,
  options?: MiniGameSdkOptions,
): MiniGameSdk {
  return new DefaultMiniGameSdk(config, options);
}
