import type { SdkContext } from "../core/context";
import { SdkError } from "../core/errors";
import { fail, ok, type Result } from "../core/result";
import type { PlatformFacade } from "../platform";
import type { ProfileSdkOwnedModuleWriter } from "../profile/service";
import { HapticsSettingsStore } from "./settings";
import type {
  HapticsModuleConfig,
  HapticsRuntimeService,
  HapticsSettingsSnapshot,
  HapticsVibrateOutput,
  HapticsVibrationKind,
} from "./types";

export interface CreateHapticsServiceOptions {
  readonly context: SdkContext;
  readonly platform: PlatformFacade;
  readonly config: HapticsModuleConfig;
  readonly profileWriter?: ProfileSdkOwnedModuleWriter;
}

export function createHapticsService(options: CreateHapticsServiceOptions): HapticsRuntimeService {
  return new DefaultHapticsService(options);
}

class DefaultHapticsService implements HapticsRuntimeService {
  private readonly context: SdkContext;
  private readonly platform: PlatformFacade;
  private readonly settings: HapticsSettingsStore;
  private started = false;
  private destroyed = false;

  constructor(options: CreateHapticsServiceOptions) {
    this.context = options.context;
    this.platform = options.platform;
    this.settings = new HapticsSettingsStore({
      config: options.config,
      now: () => this.context.clock.now(),
      ...(options.profileWriter === undefined ? {} : { profileWriter: options.profileWriter }),
    });
  }

  async start(): Promise<Result<void, SdkError>> {
    if (this.started) {
      return ok(undefined);
    }

    if (this.destroyed) {
      return fail(this.createInvalidStateError("Destroyed haptics service cannot be started."));
    }

    const hydrated = await this.settings.hydrate();
    if (!hydrated.ok) {
      return fail(hydrated.error);
    }

    this.started = true;
    return ok(undefined);
  }

  async vibrate(kind: HapticsVibrationKind): Promise<Result<HapticsVibrateOutput, SdkError>> {
    const availability = this.requireStarted();
    if (!availability.ok) {
      return availability;
    }

    if (!this.settings.getSnapshot().enabled) {
      return ok({ status: "skipped", kind, reason: "disabled" });
    }

    const result = await this.platform.haptics.vibrate(kind);
    if (!result.ok) {
      return ok({ status: "skipped", kind, reason: "unavailable" });
    }

    return ok({ status: "played", kind });
  }

  async setEnabled(enabled: boolean): Promise<Result<HapticsSettingsSnapshot, SdkError>> {
    const availability = this.requireStarted();
    if (!availability.ok) {
      return availability;
    }

    this.settings.setEnabledInMemory(enabled);
    const persisted = await this.settings.persistSnapshot();
    if (!persisted.ok) {
      return fail(persisted.error);
    }
    return persisted;
  }

  getSettings(): HapticsSettingsSnapshot {
    return this.settings.getSnapshot();
  }

  destroy(): void {
    this.destroyed = true;
    this.started = false;
  }

  private requireStarted(): Result<void, SdkError> {
    if (this.started && !this.destroyed) {
      return ok(undefined);
    }

    return fail(this.createInvalidStateError("Haptics service is not started."));
  }

  private createInvalidStateError(message: string): SdkError {
    return new SdkError("lifecycle.invalid_state", message, {
      moduleName: "haptics",
      metadata: {
        started: this.started,
        destroyed: this.destroyed,
      },
    });
  }
}
