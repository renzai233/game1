import type { SdkContext, SdkEventMap } from "../core/context";
import { SdkError } from "../core/errors";
import type { Unsubscribe } from "../core/event-bus";
import { fail, ok, type Result } from "../core/result";
import type { PlatformFacade } from "../platform";
import type { ProfileSdkOwnedModuleWriter } from "../profile/service";
import { BgmController, SfxController } from "./controllers";
import { AudioSettingsStore, resolveAudioConfigBus } from "./settings";
import type {
  AudioBackend,
  AudioConfig,
  AudioModuleConfig,
  AudioRuntimeService,
  AudioSettingsSnapshot,
  PlayBgmOptions,
  PlayBgmOutput,
  PlaySfxOptions,
  PlaySfxOutput,
} from "./types";

type InterruptionReason = "lifecycle" | "rewarded_video" | "manual";

export interface CreateAudioServiceOptions {
  readonly context: SdkContext;
  readonly platform: PlatformFacade;
  readonly config: AudioModuleConfig;
  readonly profileWriter?: ProfileSdkOwnedModuleWriter;
  readonly backend?: AudioBackend;
  readonly lifecycleBridge?: AudioLifecycleBridge;
}

export interface AudioLifecycleBridgeHandlers {
  onHide(): void;
  onShow(): void;
}

export interface AudioLifecycleBridge {
  install(
    handlers: AudioLifecycleBridgeHandlers,
  ): readonly Unsubscribe[] | Promise<readonly Unsubscribe[]>;
}

interface QueuedBgmRequest {
  readonly id: string;
  readonly options: PlayBgmOptions;
  readonly reason: "interrupted" | "autoplay_locked";
}

const WEB_AUTOPLAY_UNLOCK_EVENTS = [
  "pointerdown",
  "mousedown",
  "touchstart",
  "touchend",
  "click",
  "keydown",
] as const;

export function createAudioService(options: CreateAudioServiceOptions): AudioRuntimeService {
  return new DefaultAudioService(options);
}

class DefaultAudioService implements AudioRuntimeService {
  private readonly context: SdkContext;
  private readonly platform: PlatformFacade;
  private readonly config: AudioModuleConfig;
  private readonly backend: AudioBackend;
  private readonly lifecycleBridge: AudioLifecycleBridge | undefined;
  private readonly catalog = new Map<string, AudioConfig>();
  private readonly settings: AudioSettingsStore;
  private readonly bgm: BgmController;
  private readonly sfx: SfxController;
  private readonly preloadedScenes = new Set<string>();
  private readonly activeInterruptions = new Set<InterruptionReason>();
  private readonly unsubscribers: Unsubscribe[] = [];
  private bootPreloadPromise: Promise<Result<void, SdkError>> | null = null;
  private queuedBgm: QueuedBgmRequest | null = null;
  private started = false;
  private destroyed = false;
  private webAutoplayUnlockInstalled = false;
  private webAutoplayUnlocked: boolean;

  constructor(options: CreateAudioServiceOptions) {
    this.context = options.context;
    this.platform = options.platform;
    this.config = options.config;
    this.backend = options.backend ?? createUnavailableAudioBackend();
    this.lifecycleBridge = options.lifecycleBridge;
    this.webAutoplayUnlocked = !this.shouldUseWebAutoplayUnlock();

    for (const item of options.config.catalog ?? []) {
      this.catalog.set(item.id, item);
    }

    this.settings = new AudioSettingsStore({
      config: options.config,
      now: () => this.context.clock.now(),
      ...(options.profileWriter === undefined ? {} : { profileWriter: options.profileWriter }),
    });
    this.bgm = new BgmController(this.backend, (config, volume) =>
      this.settings.resolveVolume(resolveAudioConfigBus(config, "bgm"), volume ?? config.volume ?? 1),
    );
    this.sfx = new SfxController(this.backend, () => this.context.clock.now(), (config, volume) =>
      this.settings.resolveVolume(resolveAudioConfigBus(config, "sfx"), volume ?? config.volume ?? 1),
    );
  }

  async start(): Promise<Result<void, SdkError>> {
    if (this.started) {
      return ok(undefined);
    }

    if (this.destroyed) {
      return fail(this.createInvalidStateError("Destroyed audio service cannot be started."));
    }

    const hydrated = await this.settings.hydrate();
    if (!hydrated.ok) {
      return fail(hydrated.error);
    }

    await this.installEventHandlers();
    this.installWebAutoplayUnlockHandlers();
    this.started = true;
    return ok(undefined);
  }

  async preloadBoot(): Promise<Result<void, SdkError>> {
    const availability = this.requireStarted();
    if (!availability.ok) {
      return availability;
    }

    if (this.bootPreloadPromise === null) {
      this.bootPreloadPromise = this.preloadConfigs(this.getBootAudioConfigs());
    }
    return this.bootPreloadPromise;
  }

  async preloadScene(scene: string): Promise<Result<void, SdkError>> {
    const availability = this.requireStarted();
    if (!availability.ok) {
      return availability;
    }

    if (this.preloadedScenes.has(scene)) {
      return ok(undefined);
    }
    this.preloadedScenes.add(scene);
    return this.preloadConfigs(this.getSceneAudioConfigs(scene));
  }

  releaseScene(scene: string): void {
    if (!this.started || this.destroyed) {
      return;
    }

    this.preloadedScenes.delete(scene);
    for (const config of this.getSceneAudioConfigs(scene)) {
      if (config.preload !== "boot" && this.bgm.getCurrentId() !== config.id) {
        this.backend.release(config);
      }
    }
  }

  async playBgm(id: string, options: PlayBgmOptions = {}): Promise<Result<PlayBgmOutput, SdkError>> {
    const availability = this.requireStarted();
    if (!availability.ok) {
      return availability;
    }

    const configResult = this.getPlayableAudioConfig(id);
    if (!configResult.ok) {
      return fail(configResult.error);
    }

    if (this.activeInterruptions.size > 0) {
      this.queuedBgm = { id, options, reason: "interrupted" };
      void this.backend.preload(configResult.value);
      return ok({ status: "queued", id, reason: "interrupted" });
    }

    if (this.isWebAutoplayLocked()) {
      this.queuedBgm = { id, options, reason: "autoplay_locked" };
      void this.backend.preload(configResult.value);
      return ok({ status: "queued", id, reason: "autoplay_locked" });
    }

    return this.bgm.play(configResult.value, options.fadeMs);
  }

  async stopBgm(options: PlayBgmOptions = {}): Promise<Result<{ readonly stopped: boolean }, SdkError>> {
    const availability = this.requireStarted();
    if (!availability.ok) {
      return availability;
    }

    this.queuedBgm = null;
    return this.bgm.stop(options.fadeMs);
  }

  async setCurrentBgmVolumeOverride(
    volume: number | null,
    fadeMs = 0,
  ): Promise<Result<void, SdkError>> {
    const availability = this.requireStarted();
    if (!availability.ok) {
      return availability;
    }

    await this.bgm.setVolumeOverride(volume, fadeMs);
    return ok(undefined);
  }

  getCurrentBgmId(): string | null {
    return this.bgm.getCurrentId();
  }

  async playSfx(id: string, options: PlaySfxOptions = {}): Promise<Result<PlaySfxOutput, SdkError>> {
    const availability = this.requireStarted();
    if (!availability.ok) {
      return availability;
    }

    const configResult = this.getPlayableAudioConfig(id);
    if (!configResult.ok) {
      return fail(configResult.error);
    }

    if (this.activeInterruptions.size > 0) {
      return ok({ status: "skipped", id, reason: "interrupted" });
    }

    if (this.isWebAutoplayLocked()) {
      return ok({ status: "skipped", id, reason: "autoplay_locked" });
    }

    const volume = this.settings.resolveVolume(
      resolveAudioConfigBus(configResult.value, "sfx"),
      options.volume ?? configResult.value.volume ?? 1,
    );
    if (volume <= 0) {
      return ok({ status: "skipped", id, reason: "muted" });
    }

    return this.sfx.play(configResult.value, options.group, options.volume);
  }

  stopGroup(group: string): void {
    this.sfx.stopGroup(group);
  }

  async setBusVolume(bus: string, volume: number): Promise<Result<AudioSettingsSnapshot, SdkError>> {
    const availability = this.requireStarted();
    if (!availability.ok) {
      return availability;
    }

    const updated = this.settings.setBusVolumeInMemory(bus, volume);
    if (!updated.ok) {
      return fail(updated.error);
    }

    this.bgm.refreshVolume();
    const persisted = await this.settings.persistSnapshot("set_bus_volume", bus);
    if (!persisted.ok) {
      return fail(persisted.error);
    }
    return persisted;
  }

  async setBusMuted(bus: string, muted: boolean): Promise<Result<AudioSettingsSnapshot, SdkError>> {
    const availability = this.requireStarted();
    if (!availability.ok) {
      return availability;
    }

    const updated = this.settings.setBusMutedInMemory(bus, muted);
    if (!updated.ok) {
      return fail(updated.error);
    }

    this.bgm.refreshVolume();
    const persisted = await this.settings.persistSnapshot("set_bus_muted", bus);
    if (!persisted.ok) {
      return fail(persisted.error);
    }
    return persisted;
  }

  getSettings(): AudioSettingsSnapshot {
    return this.settings.getSnapshot();
  }

  pauseForInterruption(): void {
    this.addInterruption("manual");
  }

  resumeAfterInterruption(): void {
    this.removeInterruption("manual");
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.started = false;
    this.queuedBgm = null;
    this.sfx.stopAll();
    this.bgm.destroyCurrentImmediately();
    this.backend.releaseAll();
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      try {
        unsubscribe();
      } catch {
        // Best-effort cleanup.
      }
    }
    this.removeWebAutoplayUnlockHandlers();
  }

  private async preloadConfigs(configs: readonly AudioConfig[]): Promise<Result<void, SdkError>> {
    for (const config of configs) {
      const result = await this.backend.preload(config);
      if (!result.ok) {
        return result;
      }
    }
    return ok(undefined);
  }

  private async installEventHandlers(): Promise<void> {
    if (this.config.pauseOnLifecycleHide !== false) {
      this.unsubscribers.push(this.context.events.on("platform.hide", () => this.addInterruption("lifecycle")));
      this.unsubscribers.push(this.context.events.on("platform.show", () => this.removeInterruption("lifecycle")));

      const bridge = this.lifecycleBridge;
      if (bridge !== undefined) {
        try {
          const unsubscribers = await bridge.install({
            onHide: () => this.addInterruption("lifecycle"),
            onShow: () => this.removeInterruption("lifecycle"),
          });
          this.unsubscribers.push(...unsubscribers);
        } catch (error) {
          this.context.logger.warn("Audio lifecycle bridge installation failed.", {
            error,
          });
        }
      }
    }

    if (this.config.pauseOnRewardedVideo !== false) {
      this.unsubscribers.push(
        this.context.events.on("platform.rewarded_video.started", () => this.addInterruption("rewarded_video")),
      );
      this.unsubscribers.push(
        this.context.events.on("platform.rewarded_video.ended", () => this.removeInterruption("rewarded_video")),
      );
    }
  }

  private addInterruption(reason: InterruptionReason): void {
    if (this.destroyed) {
      return;
    }

    const wasEmpty = this.activeInterruptions.size === 0;
    this.activeInterruptions.add(reason);
    if (!wasEmpty) {
      return;
    }

    this.bgm.pauseForInterruption();
    this.sfx.stopAll();
  }

  private removeInterruption(reason: InterruptionReason): void {
    if (this.destroyed || !this.activeInterruptions.has(reason)) {
      return;
    }

    this.activeInterruptions.delete(reason);
    if (this.activeInterruptions.size > 0) {
      return;
    }

    const queued = this.queuedBgm;
    this.queuedBgm = null;
    if (queued !== null) {
      void this.playBgm(queued.id, queued.options);
      return;
    }

    this.bgm.resumeAfterInterruption();
  }

  private getPlayableAudioConfig(id: string): Result<AudioConfig, SdkError> {
    const config = this.catalog.get(id);
    if (config === undefined) {
      return fail(
        new SdkError("audio.config_not_found", "Audio config was not found.", {
          moduleName: "audio",
          metadata: { id },
        }),
      );
    }

    if ((config.enabled ?? true) !== true) {
      return fail(
        new SdkError("audio.config_disabled", "Audio config is disabled.", {
          moduleName: "audio",
          metadata: { id },
        }),
      );
    }

    return ok(config);
  }

  private getBootAudioConfigs(): readonly AudioConfig[] {
    return Array.from(this.catalog.values()).filter((config) =>
      (config.enabled ?? true) === true && config.preload === "boot"
    );
  }

  private getSceneAudioConfigs(scene: string): readonly AudioConfig[] {
    return Array.from(this.catalog.values()).filter((config) =>
      (config.enabled ?? true) === true && config.scenes?.includes(scene) === true
    );
  }

  private requireStarted(): Result<void, SdkError> {
    if (this.started && !this.destroyed) {
      return ok(undefined);
    }

    return fail(this.createInvalidStateError("Audio service is not started."));
  }

  private createInvalidStateError(message: string): SdkError {
    return new SdkError("lifecycle.invalid_state", message, {
      moduleName: "audio",
      metadata: {
        started: this.started,
        destroyed: this.destroyed,
      },
    });
  }

  private shouldUseWebAutoplayUnlock(): boolean {
    return this.platform.target === "web" && this.config.webAutoplayUnlock !== false;
  }

  private isWebAutoplayLocked(): boolean {
    return this.shouldUseWebAutoplayUnlock() && !this.webAutoplayUnlocked;
  }

  private installWebAutoplayUnlockHandlers(): void {
    if (this.webAutoplayUnlockInstalled || !this.isWebAutoplayLocked()) {
      return;
    }

    const document = globalThis.document;
    if (document === undefined) {
      return;
    }

    this.webAutoplayUnlockInstalled = true;
    for (const eventName of WEB_AUTOPLAY_UNLOCK_EVENTS) {
      document.addEventListener(eventName, this.handleWebAutoplayUnlock, {
        capture: true,
        once: true,
        passive: true,
      });
    }
  }

  private removeWebAutoplayUnlockHandlers(): void {
    if (!this.webAutoplayUnlockInstalled) {
      return;
    }

    const document = globalThis.document;
    if (document !== undefined) {
      for (const eventName of WEB_AUTOPLAY_UNLOCK_EVENTS) {
        document.removeEventListener(eventName, this.handleWebAutoplayUnlock, {
          capture: true,
        });
      }
    }
    this.webAutoplayUnlockInstalled = false;
  }

  private readonly handleWebAutoplayUnlock = (): void => {
    this.webAutoplayUnlocked = true;
    this.removeWebAutoplayUnlockHandlers();
    void this.preloadBoot();
    const queued = this.queuedBgm?.reason === "autoplay_locked" ? this.queuedBgm : null;
    if (queued !== null) {
      this.queuedBgm = null;
      void this.playBgm(queued.id, queued.options);
    }
  };
}

function createUnavailableAudioBackend(): AudioBackend {
  return {
    preload: async (config) => fail(createUnavailableBackendError(config.id)),
    play: async (config) => fail(createUnavailableBackendError(config.id)),
    release: () => undefined,
    releaseAll: () => undefined,
  };
}

function createUnavailableBackendError(id: string): SdkError {
  return new SdkError("audio.unavailable", "Audio backend is unavailable.", {
    moduleName: "audio",
    metadata: { id },
  });
}

export type { SdkEventMap };
