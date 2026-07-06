import { SdkError } from "../core/errors";
import type { HapticsModuleConfig } from "./types";

export function assertValidHapticsModuleConfig(config: HapticsModuleConfig | undefined): void {
  if (config?.enabled !== true) {
    return;
  }

  if (
    config.defaultSettings !== undefined &&
    typeof config.defaultSettings.enabled !== "boolean"
  ) {
    throw new SdkError(
      "config.invalid",
      "modules.haptics.defaultSettings.enabled must be boolean when set.",
    );
  }
}
