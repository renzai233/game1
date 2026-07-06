import { SdkError } from "../core/errors";
import { fail, ok, type Result } from "../core/result";
import type { ProfileJsonObject, ProfileModuleEnvelope } from "../profile";
import type { ProfileSdkOwnedModuleWriter } from "../profile/service";
import {
  AUDIO_SETTINGS_PROFILE_MODULE_ID,
  AUDIO_SETTINGS_PROFILE_MODULE_VERSION,
  AUDIO_SETTINGS_PROFILE_OWNER,
  CURRENT_AUDIO_SETTINGS_SCHEMA_VERSION,
  DEFAULT_AUDIO_BUSES,
  type AudioConfig,
  type AudioModuleConfig,
  type AudioSettingsProfileData,
  type AudioSettingsSnapshot,
} from "./types";

export interface AudioSettingsStoreOptions {
  readonly config?: AudioModuleConfig;
  readonly profileWriter?: ProfileSdkOwnedModuleWriter;
  readonly now: () => number;
}

interface ProfilePersistenceState {
  expectedModuleRevision: number | null;
}

let nextAudioSettingsCommandId = 1;

export class AudioSettingsStore {
  private readonly profileWriter: ProfileSdkOwnedModuleWriter | undefined;
  private readonly now: () => number;
  private settings: AudioSettingsSnapshot;
  private persistence: ProfilePersistenceState = {
    expectedModuleRevision: null,
  };

  constructor(options: AudioSettingsStoreOptions) {
    const buses = collectAudioBuses(options.config);
    this.profileWriter = options.profileWriter;
    this.now = options.now;
    this.settings = normalizeSettingsSnapshot(options.config?.defaultSettings, buses);
  }

  async hydrate(): Promise<Result<void, SdkError>> {
    const writer = this.profileWriter;
    if (writer === undefined) {
      return ok(undefined);
    }

    const snapshot = await writer.getSnapshot();
    if (!snapshot.ok) {
      return ok(undefined);
    }

    const record = snapshot.value.record;
    if (record === null) {
      return ok(undefined);
    }

    const module = record.modules[AUDIO_SETTINGS_PROFILE_MODULE_ID];
    if (module === undefined) {
      this.persistence = { expectedModuleRevision: null };
      return ok(undefined);
    }

    const read = readAudioSettingsProfileModule(module);
    if (!read.ok) {
      return fail(read.error);
    }

    this.persistence = { expectedModuleRevision: module.moduleRevision };
    this.settings = mergeSettings(this.settings, read.value);
    return ok(undefined);
  }

  getSnapshot(): AudioSettingsSnapshot {
    return cloneSettings(this.settings);
  }

  resolveVolume(bus: string, baseVolume = 1): number {
    const targetBus = normalizeAudioBus(bus) ?? "sfx";
    const settings = this.settings;
    if (settings.muted["master"] === true || settings.muted[targetBus] === true) {
      return 0;
    }

    return clamp01(baseVolume) * readVolume(settings, "master") * readVolume(settings, targetBus);
  }

  setBusVolumeInMemory(bus: string, volume: number): Result<AudioSettingsSnapshot, SdkError> {
    const normalizedBus = normalizeAudioBus(bus);
    if (normalizedBus === null) {
      return fail(createInvalidBusError(bus));
    }

    this.settings = {
      volumes: {
        ...this.settings.volumes,
        [normalizedBus]: clamp01(volume),
      },
      muted: withDefaultMuted(this.settings.muted, normalizedBus),
    };
    return ok(this.getSnapshot());
  }

  setBusMutedInMemory(bus: string, muted: boolean): Result<AudioSettingsSnapshot, SdkError> {
    const normalizedBus = normalizeAudioBus(bus);
    if (normalizedBus === null) {
      return fail(createInvalidBusError(bus));
    }

    this.settings = {
      volumes: withDefaultVolumes(this.settings.volumes, normalizedBus),
      muted: {
        ...this.settings.muted,
        [normalizedBus]: muted,
      },
    };
    return ok(this.getSnapshot());
  }

  async persistSnapshot(
    commandType: "set_bus_volume" | "set_bus_muted",
    bus: string,
  ): Promise<Result<AudioSettingsSnapshot, SdkError>> {
    const writer = this.profileWriter;
    const snapshot = this.getSnapshot();
    if (writer === undefined) {
      return fail(createPersistenceUnavailableError("Profile SDK-owned writer is unavailable.", snapshot));
    }

    const data = createProfileData(snapshot, this.now());
    const saved = await writer.saveModule({
      commandKey: createAudioSettingsCommandKey(commandType, bus, this.now()),
      commandType: `audio.settings.${commandType}`,
      moduleId: AUDIO_SETTINGS_PROFILE_MODULE_ID,
      moduleVersion: AUDIO_SETTINGS_PROFILE_MODULE_VERSION,
      expectedModuleRevision: this.persistence.expectedModuleRevision,
      owner: AUDIO_SETTINGS_PROFILE_OWNER,
      data: toProfileJsonAudioSettings(data),
    });

    if (!saved.ok) {
      return fail(createPersistenceUnavailableError("Audio settings profile save failed.", snapshot, saved.error));
    }

    const currentModule =
      saved.value.kind === "applied" ? saved.value.module : saved.value.currentModule;
    this.persistence = {
      expectedModuleRevision: currentModule?.moduleRevision ?? this.persistence.expectedModuleRevision,
    };

    return ok(snapshot);
  }
}

export function collectAudioBuses(config: AudioModuleConfig | undefined): readonly string[] {
  const buses = new Set<string>(DEFAULT_AUDIO_BUSES);
  for (const bus of config?.buses ?? []) {
    const normalized = normalizeAudioBus(bus);
    if (normalized !== null) {
      buses.add(normalized);
    }
  }

  for (const item of config?.catalog ?? []) {
    const bus = normalizeAudioBus(item.bus ?? (item.loop === true ? "music" : "sfx"));
    if (bus !== null) {
      buses.add(bus);
    }
  }

  for (const bus of Object.keys(config?.defaultSettings?.volumes ?? {})) {
    const normalized = normalizeAudioBus(bus);
    if (normalized !== null) {
      buses.add(normalized);
    }
  }

  for (const bus of Object.keys(config?.defaultSettings?.muted ?? {})) {
    const normalized = normalizeAudioBus(bus);
    if (normalized !== null) {
      buses.add(normalized);
    }
  }

  return Array.from(buses);
}

export function normalizeSettingsSnapshot(
  input: AudioSettingsSnapshot | undefined,
  buses: readonly string[],
): AudioSettingsSnapshot {
  const volumes: Record<string, number> = {};
  const muted: Record<string, boolean> = {};

  for (const bus of buses) {
    volumes[bus] = clamp01(input?.volumes[bus] ?? 1);
    muted[bus] = input?.muted[bus] ?? false;
  }

  return { volumes, muted };
}

export function resolveAudioConfigBus(config: AudioConfig, kind: "bgm" | "sfx"): string {
  return normalizeAudioBus(config.bus) ?? (kind === "bgm" ? "music" : "sfx");
}

function mergeSettings(
  base: AudioSettingsSnapshot,
  persisted: AudioSettingsSnapshot,
): AudioSettingsSnapshot {
  const buses = new Set([
    ...Object.keys(base.volumes),
    ...Object.keys(base.muted),
    ...Object.keys(persisted.volumes),
    ...Object.keys(persisted.muted),
  ]);
  const volumes: Record<string, number> = {};
  const muted: Record<string, boolean> = {};

  for (const bus of buses) {
    volumes[bus] = clamp01(persisted.volumes[bus] ?? base.volumes[bus] ?? 1);
    muted[bus] = persisted.muted[bus] ?? base.muted[bus] ?? false;
  }

  return { volumes, muted };
}

function readAudioSettingsProfileModule(
  module: ProfileModuleEnvelope,
): Result<AudioSettingsSnapshot, SdkError> {
  if (module.moduleId !== AUDIO_SETTINGS_PROFILE_MODULE_ID) {
    return fail(createPersistenceInvalidError("Audio settings profile module id is invalid."));
  }

  if (module.owner !== AUDIO_SETTINGS_PROFILE_OWNER) {
    return fail(createPersistenceInvalidError("Audio settings profile module owner is invalid."));
  }

  if (module.moduleVersion !== AUDIO_SETTINGS_PROFILE_MODULE_VERSION) {
    return fail(createPersistenceInvalidError("Audio settings profile module version is incompatible."));
  }

  return readAudioSettingsProfileData(module.data);
}

function readAudioSettingsProfileData(value: unknown): Result<AudioSettingsSnapshot, SdkError> {
  if (!isRecord(value)) {
    return fail(createPersistenceInvalidError("Audio settings profile data must be an object."));
  }

  if (value["schemaVersion"] !== CURRENT_AUDIO_SETTINGS_SCHEMA_VERSION) {
    return fail(createPersistenceInvalidError("Audio settings profile schemaVersion is incompatible."));
  }

  const volumes = readNumberRecord(value["volumes"], "volumes");
  if (!volumes.ok) {
    return fail(volumes.error);
  }

  const muted = readBooleanRecord(value["muted"], "muted");
  if (!muted.ok) {
    return fail(muted.error);
  }

  if (!Number.isFinite(value["updatedAtMs"])) {
    return fail(createPersistenceInvalidError("Audio settings updatedAtMs must be finite."));
  }

  return ok(mergeSettings(normalizeSettingsSnapshot(undefined, DEFAULT_AUDIO_BUSES), {
    volumes: volumes.value,
    muted: muted.value,
  }));
}

function readNumberRecord(value: unknown, field: string): Result<Readonly<Record<string, number>>, SdkError> {
  if (!isRecord(value)) {
    return fail(createPersistenceInvalidError(`Audio settings ${field} must be an object.`));
  }

  const output: Record<string, number> = {};
  for (const [bus, raw] of Object.entries(value)) {
    const normalized = normalizeAudioBus(bus);
    if (normalized === null || typeof raw !== "number") {
      return fail(createPersistenceInvalidError(`Audio settings ${field} entry is invalid.`));
    }
    output[normalized] = clamp01(raw);
  }
  return ok(output);
}

function readBooleanRecord(value: unknown, field: string): Result<Readonly<Record<string, boolean>>, SdkError> {
  if (!isRecord(value)) {
    return fail(createPersistenceInvalidError(`Audio settings ${field} must be an object.`));
  }

  const output: Record<string, boolean> = {};
  for (const [bus, raw] of Object.entries(value)) {
    const normalized = normalizeAudioBus(bus);
    if (normalized === null || typeof raw !== "boolean") {
      return fail(createPersistenceInvalidError(`Audio settings ${field} entry is invalid.`));
    }
    output[normalized] = raw;
  }
  return ok(output);
}

function createProfileData(
  snapshot: AudioSettingsSnapshot,
  updatedAtMs: number,
): AudioSettingsProfileData {
  return {
    schemaVersion: CURRENT_AUDIO_SETTINGS_SCHEMA_VERSION,
    volumes: { ...snapshot.volumes },
    muted: { ...snapshot.muted },
    updatedAtMs,
  };
}

function toProfileJsonAudioSettings(data: AudioSettingsProfileData): ProfileJsonObject {
  return JSON.parse(JSON.stringify(data)) as ProfileJsonObject;
}

function createAudioSettingsCommandKey(
  commandType: string,
  bus: string,
  nowMs: number,
): string {
  const id = nextAudioSettingsCommandId;
  nextAudioSettingsCommandId += 1;
  return `sdk.audio.settings:${commandType}:${bus}:${nowMs}:${id}`;
}

function createInvalidBusError(bus: string): SdkError {
  return new SdkError("config.invalid", "Audio bus must be non-empty.", {
    moduleName: "audio",
    metadata: { bus },
  });
}

function createPersistenceInvalidError(message: string): SdkError {
  return new SdkError("audio.persistence_invalid", message, {
    moduleName: "audio",
  });
}

function createPersistenceUnavailableError(
  message: string,
  snapshot: AudioSettingsSnapshot,
  cause?: SdkError,
): SdkError {
  return new SdkError("audio.persistence_unavailable", message, {
    moduleName: "audio",
    cause,
    metadata: {
      snapshotAppliedInMemory: true,
      snapshot,
      ...(cause === undefined
        ? {}
        : {
            causeCode: cause.code,
            causeMessage: cause.message,
          }),
    },
  });
}

function cloneSettings(settings: AudioSettingsSnapshot): AudioSettingsSnapshot {
  return {
    volumes: { ...settings.volumes },
    muted: { ...settings.muted },
  };
}

function withDefaultVolumes(
  volumes: Readonly<Record<string, number>>,
  bus: string,
): Readonly<Record<string, number>> {
  return bus in volumes ? { ...volumes } : { ...volumes, [bus]: 1 };
}

function withDefaultMuted(
  muted: Readonly<Record<string, boolean>>,
  bus: string,
): Readonly<Record<string, boolean>> {
  return bus in muted ? { ...muted } : { ...muted, [bus]: false };
}

function readVolume(settings: AudioSettingsSnapshot, bus: string): number {
  return clamp01(settings.volumes[bus] ?? 1);
}

function normalizeAudioBus(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(0, Math.min(1, value));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
