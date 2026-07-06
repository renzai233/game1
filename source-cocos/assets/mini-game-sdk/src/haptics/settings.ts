import { SdkError } from "../core/errors";
import { fail, ok, type Result } from "../core/result";
import type { ProfileJsonObject, ProfileModuleEnvelope } from "../profile";
import type { ProfileSdkOwnedModuleWriter } from "../profile/service";
import {
  CURRENT_HAPTICS_SETTINGS_SCHEMA_VERSION,
  HAPTICS_SETTINGS_PROFILE_MODULE_ID,
  HAPTICS_SETTINGS_PROFILE_MODULE_VERSION,
  HAPTICS_SETTINGS_PROFILE_OWNER,
  type HapticsModuleConfig,
  type HapticsSettingsProfileData,
  type HapticsSettingsSnapshot,
} from "./types";

export interface HapticsSettingsStoreOptions {
  readonly config?: HapticsModuleConfig;
  readonly profileWriter?: ProfileSdkOwnedModuleWriter;
  readonly now: () => number;
}

interface ProfilePersistenceState {
  expectedModuleRevision: number | null;
}

let nextHapticsSettingsCommandId = 1;

export class HapticsSettingsStore {
  private readonly profileWriter: ProfileSdkOwnedModuleWriter | undefined;
  private readonly now: () => number;
  private settings: HapticsSettingsSnapshot;
  private persistence: ProfilePersistenceState = {
    expectedModuleRevision: null,
  };

  constructor(options: HapticsSettingsStoreOptions) {
    this.profileWriter = options.profileWriter;
    this.now = options.now;
    this.settings = normalizeHapticsSettings(options.config?.defaultSettings);
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

    const module = record.modules[HAPTICS_SETTINGS_PROFILE_MODULE_ID];
    if (module === undefined) {
      this.persistence = { expectedModuleRevision: null };
      return ok(undefined);
    }

    const read = readHapticsSettingsProfileModule(module);
    if (!read.ok) {
      return fail(read.error);
    }

    this.persistence = { expectedModuleRevision: module.moduleRevision };
    this.settings = read.value;
    return ok(undefined);
  }

  getSnapshot(): HapticsSettingsSnapshot {
    return cloneSettings(this.settings);
  }

  setEnabledInMemory(enabled: boolean): HapticsSettingsSnapshot {
    this.settings = { enabled };
    return this.getSnapshot();
  }

  async persistSnapshot(): Promise<Result<HapticsSettingsSnapshot, SdkError>> {
    const writer = this.profileWriter;
    const snapshot = this.getSnapshot();
    if (writer === undefined) {
      return fail(createPersistenceUnavailableError("Profile SDK-owned writer is unavailable.", snapshot));
    }

    const saved = await writer.saveModule({
      commandKey: createHapticsSettingsCommandKey("set_enabled", this.now()),
      commandType: "haptics.settings.set_enabled",
      moduleId: HAPTICS_SETTINGS_PROFILE_MODULE_ID,
      moduleVersion: HAPTICS_SETTINGS_PROFILE_MODULE_VERSION,
      expectedModuleRevision: this.persistence.expectedModuleRevision,
      owner: HAPTICS_SETTINGS_PROFILE_OWNER,
      data: toProfileJsonHapticsSettings(createProfileData(snapshot, this.now())),
    });

    if (!saved.ok) {
      return fail(createPersistenceUnavailableError("Haptics settings profile save failed.", snapshot, saved.error));
    }

    const currentModule =
      saved.value.kind === "applied" ? saved.value.module : saved.value.currentModule;
    this.persistence = {
      expectedModuleRevision: currentModule?.moduleRevision ?? this.persistence.expectedModuleRevision,
    };

    return ok(snapshot);
  }
}

export function normalizeHapticsSettings(
  input: HapticsSettingsSnapshot | undefined,
): HapticsSettingsSnapshot {
  return { enabled: input?.enabled ?? true };
}

function readHapticsSettingsProfileModule(
  module: ProfileModuleEnvelope,
): Result<HapticsSettingsSnapshot, SdkError> {
  if (module.moduleId !== HAPTICS_SETTINGS_PROFILE_MODULE_ID) {
    return fail(createPersistenceInvalidError("Haptics settings profile module id is invalid."));
  }

  if (module.owner !== HAPTICS_SETTINGS_PROFILE_OWNER) {
    return fail(createPersistenceInvalidError("Haptics settings profile module owner is invalid."));
  }

  if (module.moduleVersion !== HAPTICS_SETTINGS_PROFILE_MODULE_VERSION) {
    return fail(createPersistenceInvalidError("Haptics settings profile module version is incompatible."));
  }

  return readHapticsSettingsProfileData(module.data);
}

function readHapticsSettingsProfileData(value: unknown): Result<HapticsSettingsSnapshot, SdkError> {
  if (!isRecord(value)) {
    return fail(createPersistenceInvalidError("Haptics settings profile data must be an object."));
  }

  if (value["schemaVersion"] !== CURRENT_HAPTICS_SETTINGS_SCHEMA_VERSION) {
    return fail(createPersistenceInvalidError("Haptics settings profile schemaVersion is incompatible."));
  }

  if (typeof value["enabled"] !== "boolean") {
    return fail(createPersistenceInvalidError("Haptics settings enabled must be boolean."));
  }

  if (!Number.isFinite(value["updatedAtMs"])) {
    return fail(createPersistenceInvalidError("Haptics settings updatedAtMs must be finite."));
  }

  return ok({ enabled: value["enabled"] });
}

function createProfileData(
  snapshot: HapticsSettingsSnapshot,
  updatedAtMs: number,
): HapticsSettingsProfileData {
  return {
    schemaVersion: CURRENT_HAPTICS_SETTINGS_SCHEMA_VERSION,
    enabled: snapshot.enabled,
    updatedAtMs,
  };
}

function toProfileJsonHapticsSettings(data: HapticsSettingsProfileData): ProfileJsonObject {
  return JSON.parse(JSON.stringify(data)) as ProfileJsonObject;
}

function createHapticsSettingsCommandKey(commandType: string, nowMs: number): string {
  const id = nextHapticsSettingsCommandId;
  nextHapticsSettingsCommandId += 1;
  return `sdk.haptics.settings:${commandType}:${nowMs}:${id}`;
}

function createPersistenceInvalidError(message: string): SdkError {
  return new SdkError("haptics.persistence_invalid", message, {
    moduleName: "haptics",
  });
}

function createPersistenceUnavailableError(
  message: string,
  snapshot: HapticsSettingsSnapshot,
  cause?: SdkError,
): SdkError {
  return new SdkError("haptics.persistence_unavailable", message, {
    moduleName: "haptics",
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

function cloneSettings(settings: HapticsSettingsSnapshot): HapticsSettingsSnapshot {
  return { enabled: settings.enabled };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
