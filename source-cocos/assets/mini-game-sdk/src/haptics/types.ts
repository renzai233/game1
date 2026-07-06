import type { SdkError } from "../core/errors";
import type { ModuleBoundary } from "../core/module-boundary";
import type { Result } from "../core/result";

export const HAPTICS_MODULE_ID = "sdk.haptics";
export const HAPTICS_SETTINGS_PROFILE_MODULE_ID = "sdk.haptics.settings";
export const HAPTICS_SETTINGS_PROFILE_OWNER = "sdk:haptics";
export const HAPTICS_SETTINGS_PROFILE_MODULE_VERSION = 1;
export const CURRENT_HAPTICS_SETTINGS_SCHEMA_VERSION = 1;

export const HAPTICS_MODULE_BOUNDARY: ModuleBoundary = {
  name: "haptics",
  targetStage: "Stage 2+",
  implemented: true,
  owns: [
    "Haptics runtime public API and settings profile module",
    "User-controlled vibration enablement and safe platform fallback policy",
    "SDK-owned haptics profile contract without game-specific trigger points",
  ],
  nonGoals: [
    "No game-specific vibration trigger semantics",
    "No haptics settings inside audio settings",
    "No scene, UI, or host project event hub dependency",
  ],
};

export type HapticsVibrationKind = "short" | "long";

export interface HapticsSettingsSnapshot {
  readonly enabled: boolean;
}

export interface HapticsSettingsProfileData {
  readonly schemaVersion: typeof CURRENT_HAPTICS_SETTINGS_SCHEMA_VERSION;
  readonly enabled: boolean;
  readonly updatedAtMs: number;
}

export interface HapticsModuleConfig {
  readonly enabled?: boolean;
  readonly defaultSettings?: HapticsSettingsSnapshot;
}

export type HapticsVibrateOutput =
  | { readonly status: "played"; readonly kind: HapticsVibrationKind }
  | {
      readonly status: "skipped";
      readonly kind: HapticsVibrationKind;
      readonly reason: "disabled" | "unavailable";
    };

export interface HapticsService {
  vibrate(kind: HapticsVibrationKind): Promise<Result<HapticsVibrateOutput, SdkError>>;
  setEnabled(enabled: boolean): Promise<Result<HapticsSettingsSnapshot, SdkError>>;
  getSettings(): HapticsSettingsSnapshot;
  destroy(): void | Promise<void>;
}

export interface HapticsRuntimeService extends HapticsService {
  start(): Promise<Result<void, SdkError>>;
}
