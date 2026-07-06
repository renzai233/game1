import { SdkError } from "../core/errors";
import { fail, ok, type Result } from "../core/result";
import type {
  HapticsRuntimeService,
  HapticsSettingsSnapshot,
  HapticsVibrateOutput,
  HapticsVibrationKind,
} from "./types";

export function createDisabledHapticsService(): HapticsRuntimeService {
  return new DisabledHapticsService();
}

class DisabledHapticsService implements HapticsRuntimeService {
  private readonly settings: HapticsSettingsSnapshot = { enabled: true };

  async start(): Promise<Result<void, SdkError>> {
    return ok(undefined);
  }

  async vibrate(kind: HapticsVibrationKind): Promise<Result<HapticsVibrateOutput, SdkError>> {
    return fail(createUnavailableError("Haptics service is disabled.", { kind }));
  }

  async setEnabled(): Promise<Result<HapticsSettingsSnapshot, SdkError>> {
    return fail(createUnavailableError("Haptics service is disabled."));
  }

  getSettings(): HapticsSettingsSnapshot {
    return { ...this.settings };
  }

  destroy(): void {
    return undefined;
  }
}

function createUnavailableError(
  message: string,
  metadata: Readonly<Record<string, unknown>> = {},
): SdkError {
  return new SdkError("haptics.unavailable", message, {
    moduleName: "haptics",
    metadata,
  });
}
