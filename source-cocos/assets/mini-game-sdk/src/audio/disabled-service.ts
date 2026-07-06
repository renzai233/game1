import { SdkError } from "../core/errors";
import { fail, ok, type Result } from "../core/result";
import {
  DEFAULT_AUDIO_BUSES,
  type AudioRuntimeService,
  type AudioService,
  type AudioSettingsSnapshot,
  type PlayBgmOutput,
  type PlaySfxOutput,
} from "./types";

export function createDisabledAudioService(): AudioRuntimeService {
  return new DisabledAudioService();
}

class DisabledAudioService implements AudioRuntimeService {
  private readonly settings = createDefaultSettings();

  async start(): Promise<Result<void, SdkError>> {
    return ok(undefined);
  }

  async preloadBoot(): Promise<Result<void, SdkError>> {
    return ok(undefined);
  }

  async preloadScene(): Promise<Result<void, SdkError>> {
    return ok(undefined);
  }

  releaseScene(): void {
    return undefined;
  }

  async playBgm(id: string): Promise<Result<PlayBgmOutput, SdkError>> {
    return fail(createUnavailableError("Audio service is disabled.", { id }));
  }

  async stopBgm(): Promise<Result<{ readonly stopped: boolean }, SdkError>> {
    return ok({ stopped: false });
  }

  async setCurrentBgmVolumeOverride(): Promise<Result<void, SdkError>> {
    return fail(createUnavailableError("Audio service is disabled."));
  }

  getCurrentBgmId(): string | null {
    return null;
  }

  async playSfx(id: string): Promise<Result<PlaySfxOutput, SdkError>> {
    return fail(createUnavailableError("Audio service is disabled.", { id }));
  }

  stopGroup(): void {
    return undefined;
  }

  async setBusVolume(bus: string): Promise<Result<AudioSettingsSnapshot, SdkError>> {
    return fail(createUnavailableError("Audio service is disabled.", { bus }));
  }

  async setBusMuted(bus: string): Promise<Result<AudioSettingsSnapshot, SdkError>> {
    return fail(createUnavailableError("Audio service is disabled.", { bus }));
  }

  getSettings(): AudioSettingsSnapshot {
    return {
      volumes: { ...this.settings.volumes },
      muted: { ...this.settings.muted },
    };
  }

  pauseForInterruption(): void {
    return undefined;
  }

  resumeAfterInterruption(): void {
    return undefined;
  }

  destroy(): void {
    return undefined;
  }
}

function createDefaultSettings(): AudioSettingsSnapshot {
  return {
    volumes: Object.fromEntries(DEFAULT_AUDIO_BUSES.map((bus) => [bus, 1])),
    muted: Object.fromEntries(DEFAULT_AUDIO_BUSES.map((bus) => [bus, false])),
  };
}

function createUnavailableError(
  message: string,
  metadata: Readonly<Record<string, unknown>> = {},
): SdkError {
  return new SdkError("audio.unavailable", message, {
    moduleName: "audio",
    metadata,
  });
}

export type { AudioService };
