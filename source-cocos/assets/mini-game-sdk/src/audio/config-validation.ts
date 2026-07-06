import { SdkError } from "../core/errors";
import type { AudioConfig, AudioModuleConfig, AudioPreloadStrategy } from "./types";

const AUDIO_PRELOAD_VALUES: ReadonlySet<AudioPreloadStrategy> = new Set([
  "boot",
  "scene",
  "lazy",
]);

export function assertValidAudioModuleConfig(config: AudioModuleConfig | undefined): void {
  if (config?.enabled !== true) {
    return;
  }

  assertOptionalNonEmpty("modules.audio.defaultBundle", config.defaultBundle);
  for (const bus of config.buses ?? []) {
    if (bus.trim().length === 0) {
      throw new SdkError("config.invalid", "modules.audio.buses entries must be non-empty.");
    }
  }

  const ids = new Set<string>();
  for (const item of config.catalog ?? []) {
    assertValidAudioCatalogItem(item, config, ids);
  }

  assertValidSettingsSnapshot("modules.audio.defaultSettings", config.defaultSettings);
}

function assertValidAudioCatalogItem(
  item: AudioConfig,
  moduleConfig: AudioModuleConfig,
  ids: Set<string>,
): void {
  if (item.id.trim().length === 0) {
    throw new SdkError("config.invalid", "modules.audio.catalog[].id must be non-empty.");
  }

  if (ids.has(item.id)) {
    throw new SdkError("config.invalid", "modules.audio.catalog id must be unique.", {
      metadata: { id: item.id },
    });
  }
  ids.add(item.id);

  if ((item.enabled ?? true) !== true) {
    return;
  }

  if (item.path.trim().length === 0) {
    throw new SdkError("config.invalid", "modules.audio.catalog[].path must be non-empty.", {
      metadata: { id: item.id },
    });
  }

  if ((item.bundle ?? moduleConfig.defaultBundle) === undefined) {
    throw new SdkError(
      "config.invalid",
      "modules.audio.catalog[] requires bundle or modules.audio.defaultBundle.",
      { metadata: { id: item.id } },
    );
  }

  assertOptionalNonEmpty("modules.audio.catalog[].bundle", item.bundle, item.id);
  assertOptionalNonEmpty("modules.audio.catalog[].bus", item.bus, item.id);
  assertOptional01("modules.audio.catalog[].volume", item.volume, item.id);
  assertOptionalNonNegativeInteger("modules.audio.catalog[].maxInstances", item.maxInstances, item.id);
  assertOptionalNonNegativeInteger("modules.audio.catalog[].cooldownMs", item.cooldownMs, item.id);
  assertOptionalFiniteNumber("modules.audio.catalog[].priority", item.priority, item.id);
  assertOptionalNonNegativeInteger("modules.audio.catalog[].fadeInMs", item.fadeInMs, item.id);
  assertOptionalNonNegativeInteger("modules.audio.catalog[].fadeOutMs", item.fadeOutMs, item.id);

  if (item.preload !== undefined && !AUDIO_PRELOAD_VALUES.has(item.preload)) {
    throw new SdkError("config.invalid", "modules.audio.catalog[].preload is invalid.", {
      metadata: { id: item.id, preload: item.preload },
    });
  }

  for (const scene of item.scenes ?? []) {
    if (scene.trim().length === 0) {
      throw new SdkError("config.invalid", "modules.audio.catalog[].scenes entries must be non-empty.", {
        metadata: { id: item.id },
      });
    }
  }
}

function assertValidSettingsSnapshot(
  fieldName: string,
  snapshot: AudioModuleConfig["defaultSettings"],
): void {
  if (snapshot === undefined) {
    return;
  }

  for (const [bus, volume] of Object.entries(snapshot.volumes)) {
    if (bus.trim().length === 0 || !Number.isFinite(volume) || volume < 0 || volume > 1) {
      throw new SdkError("config.invalid", `${fieldName}.volumes entries must be valid bus volumes.`, {
        metadata: { bus, volume },
      });
    }
  }

  for (const [bus, muted] of Object.entries(snapshot.muted)) {
    if (bus.trim().length === 0 || typeof muted !== "boolean") {
      throw new SdkError("config.invalid", `${fieldName}.muted entries must be valid bus muted flags.`, {
        metadata: { bus, muted },
      });
    }
  }
}

function assertOptionalNonEmpty(fieldName: string, value: string | undefined, id?: string): void {
  if (value !== undefined && value.trim().length === 0) {
    throw new SdkError(
      "config.invalid",
      `${fieldName} must be non-empty when set.`,
      id === undefined ? {} : { metadata: { id } },
    );
  }
}

function assertOptional01(fieldName: string, value: number | undefined, id: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) {
    throw new SdkError("config.invalid", `${fieldName} must be between 0 and 1 when set.`, {
      metadata: { id, value },
    });
  }
}

function assertOptionalFiniteNumber(fieldName: string, value: number | undefined, id: string): void {
  if (value !== undefined && !Number.isFinite(value)) {
    throw new SdkError("config.invalid", `${fieldName} must be finite when set.`, {
      metadata: { id, value },
    });
  }
}

function assertOptionalNonNegativeInteger(
  fieldName: string,
  value: number | undefined,
  id: string,
): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw new SdkError("config.invalid", `${fieldName} must be a non-negative integer when set.`, {
      metadata: { id, value },
    });
  }
}
