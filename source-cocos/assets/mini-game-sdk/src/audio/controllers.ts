import { SdkError } from "../core/errors";
import { fail, ok, type Result } from "../core/result";
import type {
  AudioBackend,
  AudioBackendHandle,
  AudioConfig,
  PlayBgmOutput,
  PlaySfxOutput,
} from "./types";

interface BgmState {
  readonly config: AudioConfig;
  readonly handle: AudioBackendHandle;
  readonly baseVolume: number;
  currentVolume: number;
}

interface SfxInstance {
  readonly id: number;
  readonly config: AudioConfig;
  readonly handle: AudioBackendHandle;
  readonly group: string;
  readonly priority: number;
}

function waitMs(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, milliseconds));
  });
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, Math.min(1, value));
}

export class BgmController {
  private current: BgmState | null = null;
  private switchToken = 0;
  private pausedForInterruption = false;
  private volumeOverride: number | null = null;
  private volumeTransitionToken = 0;

  constructor(
    private readonly backend: AudioBackend,
    private readonly resolveVolume: (config: AudioConfig, overrideVolume?: number) => number,
  ) {}

  async play(config: AudioConfig, fadeMs?: number): Promise<Result<PlayBgmOutput, SdkError>> {
    if ((config.enabled ?? true) !== true) {
      return fail(createAudioConfigDisabledError(config.id));
    }

    const token = this.switchToken + 1;
    this.switchToken = token;
    const baseVolume = config.volume ?? 1;
    const duration = fadeMs ?? config.fadeInMs ?? 0;

    if (this.current?.config.id === config.id) {
      this.cancelCurrentVolumeTransition();
      this.setStateVolume(this.current, this.resolveTargetVolume(config, baseVolume));
      return ok({ status: "unchanged", id: config.id });
    }

    const previous = this.current;
    this.cancelCurrentVolumeTransition();
    this.current = null;
    this.volumeOverride = null;
    if (previous !== null) {
      await this.fadeOutAndDestroy(previous, fadeMs ?? previous.config.fadeOutMs ?? 0);
    }

    if (this.switchToken !== token) {
      return ok({ status: "started", id: config.id });
    }

    const initialVolume = duration > 0 ? 0 : this.resolveTargetVolume(config, baseVolume);
    const played = await this.backend.play(config, {
      loop: true,
      volume: initialVolume,
    });
    if (!played.ok) {
      return played;
    }

    const handle = played.value;
    if (handle === null || this.switchToken !== token) {
      handle?.destroy();
      return fail(createAudioPlayFailedError(config.id, "BGM backend did not create a handle."));
    }

    const current: BgmState = {
      config,
      handle,
      baseVolume,
      currentVolume: initialVolume,
    };
    this.current = current;
    if (duration > 0) {
      await this.fadeCurrentTo(current, 0, this.resolveTargetVolume(config, baseVolume), duration);
    } else {
      this.setStateVolume(current, this.resolveTargetVolume(config, baseVolume));
    }

    return ok({ status: "started", id: config.id });
  }

  async stop(fadeMs?: number): Promise<Result<{ readonly stopped: boolean }, SdkError>> {
    this.switchToken += 1;
    const current = this.current;
    this.cancelCurrentVolumeTransition();
    this.current = null;
    this.volumeOverride = null;
    this.pausedForInterruption = false;
    if (current === null) {
      return ok({ stopped: false });
    }

    await this.fadeOutAndDestroy(current, fadeMs ?? current.config.fadeOutMs ?? 0);
    return ok({ stopped: true });
  }

  refreshVolume(): void {
    const current = this.current;
    if (current === null) {
      return;
    }

    this.cancelCurrentVolumeTransition();
    this.setStateVolume(
      current,
      this.resolveTargetVolume(current.config, current.baseVolume),
    );
  }

  async setVolumeOverride(volume: number | null, fadeMs = 0): Promise<void> {
    this.volumeOverride = volume === null ? null : clamp01(volume);

    const current = this.current;
    if (current === null) {
      return;
    }

    const target = this.resolveTargetVolume(current.config, current.baseVolume);
    if (fadeMs <= 0) {
      this.cancelCurrentVolumeTransition();
      this.setStateVolume(current, target);
      return;
    }

    await this.fadeCurrentTo(current, current.currentVolume, target, fadeMs);
  }

  pauseForInterruption(): void {
    const current = this.current;
    if (current === null) {
      return;
    }
    this.pausedForInterruption = true;
    current.handle.pause();
  }

  resumeAfterInterruption(): void {
    const current = this.current;
    if (current === null || !this.pausedForInterruption) {
      return;
    }
    this.pausedForInterruption = false;
    current.handle.resume();
    this.refreshVolume();
  }

  getCurrentId(): string | null {
    return this.current?.config.id ?? null;
  }

  destroyCurrentImmediately(): void {
    this.switchToken += 1;
    const current = this.current;
    this.current = null;
    this.volumeOverride = null;
    this.pausedForInterruption = false;
    this.cancelCurrentVolumeTransition();
    current?.handle.destroy();
  }

  private async fadeOutAndDestroy(state: BgmState, fadeMs: number): Promise<void> {
    if (fadeMs > 0) {
      await this.fadeTo(state, state.currentVolume, 0, fadeMs);
    }
    state.handle.destroy();
  }

  private cancelCurrentVolumeTransition(): void {
    this.volumeTransitionToken += 1;
  }

  private resolveTargetVolume(config: AudioConfig, baseVolume: number): number {
    if (this.volumeOverride !== null) {
      return this.volumeOverride;
    }

    return this.resolveVolume(config, baseVolume);
  }

  private setStateVolume(state: BgmState, volume: number): void {
    const normalized = clamp01(volume);
    state.currentVolume = normalized;
    state.handle.setVolume(normalized);
  }

  private async fadeCurrentTo(
    state: BgmState,
    from: number,
    to: number,
    durationMs: number,
  ): Promise<void> {
    const token = this.volumeTransitionToken + 1;
    this.volumeTransitionToken = token;
    await this.fadeTo(
      state,
      from,
      to,
      durationMs,
      () => this.current === state && this.volumeTransitionToken === token,
    );
  }

  private async fadeTo(
    state: BgmState,
    from: number,
    to: number,
    durationMs: number,
    shouldContinue?: () => boolean,
  ): Promise<void> {
    const duration = Math.max(0, durationMs);
    if (shouldContinue !== undefined && !shouldContinue()) {
      return;
    }

    if (duration <= 0) {
      this.setStateVolume(state, to);
      return;
    }

    const steps = Math.max(1, Math.ceil(duration / 50));
    for (let step = 1; step <= steps; step += 1) {
      if (shouldContinue !== undefined && !shouldContinue()) {
        return;
      }
      const progress = step / steps;
      this.setStateVolume(state, from + (to - from) * progress);
      await waitMs(duration / steps);
    }
  }
}

export class SfxController {
  private readonly lastPlayAt = new Map<string, number>();
  private readonly instances: SfxInstance[] = [];

  constructor(
    private readonly backend: AudioBackend,
    private readonly now: () => number,
    private readonly resolveVolume: (config: AudioConfig, overrideVolume?: number) => number,
  ) {}

  async play(
    config: AudioConfig,
    group = "default",
    volume?: number,
  ): Promise<Result<PlaySfxOutput, SdkError>> {
    if ((config.enabled ?? true) !== true) {
      return fail(createAudioConfigDisabledError(config.id));
    }

    const now = this.now();
    const cooldownMs = config.cooldownMs ?? 0;
    const lastPlayAt = this.lastPlayAt.get(config.id) ?? 0;
    if (cooldownMs > 0 && now - lastPlayAt < cooldownMs) {
      return ok({ status: "skipped", id: config.id, reason: "cooldown" });
    }

    if (!this.reserveInstance(config)) {
      return ok({ status: "skipped", id: config.id, reason: "max_instances" });
    }

    this.lastPlayAt.set(config.id, now);
    const played = await this.backend.play(config, {
      loop: false,
      volume: this.resolveVolume(config, volume ?? config.volume ?? 1),
      onEnded: (endedHandle) => {
        this.removeInstanceById(endedHandle.id);
      },
    });
    if (!played.ok) {
      return fail(played.error);
    }

    const handle = played.value;
    if (handle === null) {
      return fail(createAudioPlayFailedError(config.id, "SFX backend did not create a handle."));
    }

    this.instances.push({
      id: handle.id,
      config,
      handle,
      group,
      priority: config.priority ?? 0,
    });
    return ok({ status: "played", id: config.id, handleId: handle.id });
  }

  stopGroup(group: string): void {
    for (const instance of Array.from(this.instances)) {
      if (instance.group === group) {
        this.destroyInstance(instance);
      }
    }
  }

  stopAll(): void {
    for (const instance of Array.from(this.instances)) {
      this.destroyInstance(instance);
    }
  }

  private reserveInstance(config: AudioConfig): boolean {
    const maxInstances = Math.max(1, config.maxInstances ?? 1);
    let sameIdCount = 0;
    let lowestPriorityInstance: SfxInstance | null = null;

    for (const instance of this.instances) {
      if (instance.config.id !== config.id) {
        continue;
      }

      sameIdCount += 1;
      if (lowestPriorityInstance === null || instance.priority < lowestPriorityInstance.priority) {
        lowestPriorityInstance = instance;
      }
    }

    if (sameIdCount < maxInstances) {
      return true;
    }

    const incomingPriority = config.priority ?? 0;
    if (lowestPriorityInstance === null || lowestPriorityInstance.priority > incomingPriority) {
      return false;
    }

    this.destroyInstance(lowestPriorityInstance);
    return true;
  }

  private destroyInstance(instance: SfxInstance): void {
    this.removeInstanceById(instance.id);
    instance.handle.destroy();
  }

  private removeInstanceById(id: number): void {
    const index = this.instances.findIndex((item) => item.id === id);
    if (index >= 0) {
      this.instances.splice(index, 1);
    }
  }
}

function createAudioConfigDisabledError(id: string): SdkError {
  return new SdkError("audio.config_disabled", "Audio config is disabled.", {
    moduleName: "audio",
    metadata: { id },
  });
}

function createAudioPlayFailedError(id: string, message: string): SdkError {
  return new SdkError("audio.play_failed", message, {
    moduleName: "audio",
    metadata: { id },
  });
}
