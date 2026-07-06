import type { SdkContext } from "../core/context";
import { SdkError } from "../core/errors";
import type { Unsubscribe } from "../core/event-bus";
import { fail, ok, type Result } from "../core/result";
import type { AccountService, AccountSession } from "../account";
import { DisabledProfileService } from "./disabled-service";
import { ProfileEventPublisher, type ProfileSyncEventContext } from "./event-publisher";
import {
  cloneProfileJsonObject,
  hashProfileJson,
  validateAndCloneProfileJsonObject,
} from "./stable-json";
import {
  CURRENT_PROFILE_SCHEMA_VERSION,
  DEFAULT_PROFILE_COMMAND_RECEIPT_RETENTION_LIMIT,
  FOUNDATION_PROFILE_MODULE_ID,
  type DisabledProfileServiceOptions,
  type ProfileCommandReceipt,
  type PlayerProfileRecord,
  type ProfileCloudSnapshotPort,
  type ProfileCloudSnapshotPullResult,
  type ProfileCloudSnapshotPushResult,
  type ProfileConflictResolutionStrategy,
  type ProfileConflictResolver,
  type ProfileConflictSnapshot,
  type ProfileCloudSyncSkippedReason,
  type ProfileJsonObject,
  type ProfileJsonValue,
  type ProfileLocalStorePort,
  type ProfileModuleConfig,
  type ProfileModuleEnvelope,
  type ProfileModuleMissingStrategy,
  type ProfileModuleNormalizeInput,
  type ProfileModuleNormalizer,
  type ProfileModuleOwner,
  type ProfileModuleValidator,
  type ProfileRuntimeSnapshot,
  type ProfileService,
  type ProfileSnapshotChangedListener,
  type ProfileSyncCheckpoint,
  type ReadProfileModuleInput,
  type ReadProfileModuleOutput,
  type ResolveProfileConflictInput,
  type ResolveProfileConflictOutput,
  type SaveProfileModuleInput,
  type SaveProfileModuleOutput,
  type SyncCloudSnapshotInput,
  type SyncCloudSnapshotOutput,
  type UpdateProfileModuleDecision,
  type UpdateProfileModuleInput,
  type UpdateProfileModuleOutput,
} from "./types";

const SAVE_MODULE_COMMAND_TYPE = "profile.save_module";
const UPDATE_MODULE_COMMAND_TYPE = "profile.update_module";
const RESOLVE_SERVER_COMMAND_TYPE = "profile.accept_server_snapshot";
const RESOLVE_LOCAL_COMMAND_TYPE = "profile.accept_local_snapshot";
const RESOLVE_CUSTOM_COMMAND_TYPE = "profile.resolve_conflict";
const ANONYMOUS_PROFILE_SCOPE = "anonymous";
const PROFILE_COMMAND_KEY_MAX_LENGTH = 128;
const PROFILE_INTERNAL_COMMAND_KEY_MAX_LENGTH = 256;

export interface CreateProfileServiceOptions {
  readonly context: SdkContext;
  readonly config?: ProfileModuleConfig;
  readonly account?: AccountService;
}

export interface CreateProfileSdkOwnedModuleWriterOptions {
  readonly owner: `sdk:${string}`;
}

export interface SaveProfileSdkOwnedModuleInput<
  TData extends ProfileJsonObject = ProfileJsonObject,
> {
  readonly commandKey: string;
  readonly commandType: string;
  readonly moduleId: string;
  readonly moduleVersion: number;
  readonly expectedModuleRevision: number | null;
  readonly owner: `sdk:${string}`;
  readonly data: TData;
}

export interface ProfileSdkOwnedModuleWriter {
  readonly owner: `sdk:${string}`;
  getSnapshot(): Promise<Result<ProfileRuntimeSnapshot, SdkError>>;
  saveModule<TData extends ProfileJsonObject>(
    input: SaveProfileSdkOwnedModuleInput<TData>,
  ): Promise<Result<SaveProfileModuleOutput<TData>, SdkError>>;
}

interface ValidatedSaveInput<TData extends ProfileJsonObject> {
  readonly commandType: string;
  readonly commandKey: string;
  readonly moduleId: string;
  readonly moduleVersion: number;
  readonly expectedModuleRevision: number | null;
  readonly owner: ProfileModuleOwner;
  readonly data: TData;
  readonly payloadHash: string;
}

interface ValidatedReadModuleInput<TData extends ProfileJsonObject> {
  readonly moduleId: string;
  readonly moduleVersion: number;
  readonly owner: ProfileModuleOwner;
  readonly missing: ProfileModuleMissingStrategy;
  readonly normalize: ProfileModuleNormalizer<TData>;
}

interface ValidatedUpdateModuleInput<
  TData extends ProfileJsonObject,
  TMeta,
> {
  readonly commandType: typeof UPDATE_MODULE_COMMAND_TYPE;
  readonly commandKey: string;
  readonly commandPayload: ProfileJsonObject;
  readonly moduleId: string;
  readonly moduleVersion: number;
  readonly owner: `game:${string}`;
  readonly createDefault?: (input: {
    readonly moduleId: string;
    readonly moduleVersion: number;
    readonly owner: `game:${string}`;
    readonly nowMs: number;
  }) => TData;
  readonly normalize: ProfileModuleNormalizer<TData>;
  readonly update: UpdateProfileModuleInput<TData, TMeta>["update"];
  readonly payloadHash: string;
}

type PreparedUpdateModuleMutation<
  TData extends ProfileJsonObject,
  TMeta,
> =
  | {
      readonly kind: "noop";
      readonly output: UpdateProfileModuleOutput<TData, TMeta>;
    }
  | {
      readonly kind: "update";
      readonly module: ProfileModuleEnvelope<TData>;
      readonly meta?: TMeta;
    };

interface LoadedRecordValidation {
  readonly record: PlayerProfileRecord;
}

interface ValidatedResolveInput {
  readonly commandKey?: string;
  readonly strategy: ProfileConflictResolutionStrategy;
  readonly commandType: string;
  readonly payloadHash?: string;
}

interface ProfileStoreContext {
  readonly accountId: string | null;
  readonly scope: string;
}

interface InternalProfileServiceCapabilities {
  createSdkOwnedModuleWriter(
    options: CreateProfileSdkOwnedModuleWriterOptions,
  ): ProfileSdkOwnedModuleWriter;
  getReadonlySnapshot(): Promise<Result<ProfileRuntimeSnapshot, SdkError>>;
}

const INTERNAL_PROFILE_CAPABILITIES = new WeakMap<ProfileService, InternalProfileServiceCapabilities>();

export function createProfileService(options: CreateProfileServiceOptions): ProfileService {
  return new LocalProfileService(options);
}

export function createProfileSdkOwnedModuleWriter(
  profile: ProfileService,
  options: CreateProfileSdkOwnedModuleWriterOptions,
): ProfileSdkOwnedModuleWriter {
  if (!isSdkOwner(options.owner)) {
    throw new SdkError(
      "profile.module_owner_forbidden",
      "Profile SDK-owned writer requires an sdk:* owner.",
      { moduleName: "profile", metadata: { owner: options.owner } },
    );
  }

  const capabilities = INTERNAL_PROFILE_CAPABILITIES.get(profile);
  if (capabilities !== undefined) {
    return capabilities.createSdkOwnedModuleWriter(options);
  }

  return {
    owner: options.owner,
    getSnapshot: () => profile.getSnapshot(),
    saveModule: async (input) => fail(
      new SdkError("profile.unavailable", "Profile SDK-owned writer is unavailable.", {
        moduleName: "profile",
        metadata: {
          commandKey: input.commandKey,
          commandType: input.commandType,
          moduleId: input.moduleId,
          owner: options.owner,
        },
      }),
    ),
  };
}

export function getReadonlyProfileSnapshot(
  profile: ProfileService,
): Promise<Result<ProfileRuntimeSnapshot, SdkError>> {
  const capabilities = INTERNAL_PROFILE_CAPABILITIES.get(profile);
  if (capabilities !== undefined) {
    return capabilities.getReadonlySnapshot();
  }

  return profile.getSnapshot();
}

export function createDisabledProfileService(
  options: DisabledProfileServiceOptions = {},
): ProfileService {
  return new DisabledProfileService(options);
}

class LocalProfileService implements ProfileService {
  private readonly listeners = new Set<ProfileSnapshotChangedListener>();
  private readonly enabled: boolean;
  private readonly localStore: ProfileLocalStorePort | undefined;
  private readonly cloudSnapshotPort: ProfileCloudSnapshotPort | undefined;
  private readonly cloudSnapshotConfigured: boolean;
  private readonly conflictResolver: ProfileConflictResolver | undefined;
  private readonly validators: readonly ProfileModuleValidator[];
  private readonly commandReceiptRetentionLimit: number;
  private readonly events: ProfileEventPublisher;
  private operationQueue: Promise<void> = Promise.resolve();
  private destroyed = false;

  constructor(private readonly options: CreateProfileServiceOptions) {
    const config = options.config;
    this.enabled = config?.enabled ?? false;
    this.localStore = config?.localStore;
    this.cloudSnapshotPort = config?.cloudSnapshotPort;
    this.cloudSnapshotConfigured = this.cloudSnapshotPort !== undefined;
    this.conflictResolver = config?.conflictResolver;
    this.validators = config?.moduleValidators ?? [];
    this.commandReceiptRetentionLimit =
      config?.commandReceiptRetentionLimit ?? DEFAULT_PROFILE_COMMAND_RECEIPT_RETENTION_LIMIT;
    this.events = new ProfileEventPublisher(options.context);
    INTERNAL_PROFILE_CAPABILITIES.set(this, {
      createSdkOwnedModuleWriter: (writerOptions) => this.createSdkOwnedModuleWriterInternal(writerOptions),
      getReadonlySnapshot: () => this.enqueueOperation(() => this.getReadonlySnapshotUnlocked()),
    });
  }

  private enqueueOperation<TValue>(
    operation: () => Promise<Result<TValue, SdkError>>,
  ): Promise<Result<TValue, SdkError>> {
    const run = this.operationQueue.then(operation, operation);
    this.operationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async getSnapshot(): Promise<Result<ProfileRuntimeSnapshot, SdkError>> {
    return this.enqueueOperation(() => this.getSnapshotUnlocked());
  }

  async readModule<TData extends ProfileJsonObject>(
    input: ReadProfileModuleInput<TData>,
  ): Promise<Result<ReadProfileModuleOutput<TData>, SdkError>> {
    return this.enqueueOperation(() => this.readModuleUnlocked(input));
  }

  async updateModule<TData extends ProfileJsonObject, TMeta = undefined>(
    input: UpdateProfileModuleInput<TData, TMeta>,
  ): Promise<Result<UpdateProfileModuleOutput<TData, TMeta>, SdkError>> {
    return this.enqueueOperation(() => this.updateModuleUnlocked(input));
  }

  async saveModule<TData extends ProfileJsonObject>(
    input: SaveProfileModuleInput<TData>,
  ): Promise<Result<SaveProfileModuleOutput<TData>, SdkError>> {
    return this.enqueueOperation(() => this.saveModuleUnlocked(input));
  }

  private createSdkOwnedModuleWriterInternal(
    options: CreateProfileSdkOwnedModuleWriterOptions,
  ): ProfileSdkOwnedModuleWriter {
    if (!isSdkOwner(options.owner)) {
      throw new SdkError(
        "profile.module_owner_forbidden",
        "Profile SDK-owned writer requires an sdk:* owner.",
        { moduleName: "profile", metadata: { owner: options.owner } },
      );
    }

    return {
      owner: options.owner,
      getSnapshot: () => this.getSnapshot(),
      saveModule: <TData extends ProfileJsonObject>(
        input: SaveProfileSdkOwnedModuleInput<TData>,
      ) => this.enqueueOperation(() => this.saveSdkOwnedModuleUnlocked(input, options.owner)),
    };
  }

  async syncCloudSnapshot(
    input: SyncCloudSnapshotInput = {},
  ): Promise<Result<SyncCloudSnapshotOutput, SdkError>> {
    return this.enqueueOperation(() => this.syncCloudSnapshotUnlocked(input));
  }

  async resolveConflict(
    input: ResolveProfileConflictInput = {},
  ): Promise<Result<ResolveProfileConflictOutput, SdkError>> {
    return this.enqueueOperation(() => this.resolveConflictUnlocked(input));
  }

  private async getSnapshotUnlocked(): Promise<Result<ProfileRuntimeSnapshot, SdkError>> {
    if (!this.isAvailable()) {
      return ok(this.createSnapshot(null));
    }

    const storeContext = this.getStoreContext();
    const recordResult = await this.loadOrBootstrapRecord(storeContext);
    if (!recordResult.ok) {
      return fail(recordResult.error);
    }

    return ok(this.createSnapshot(recordResult.value));
  }

  private async getReadonlySnapshotUnlocked(): Promise<Result<ProfileRuntimeSnapshot, SdkError>> {
    if (!this.isAvailable()) {
      return ok(this.createSnapshot(null));
    }

    const storeContext = this.getStoreContext();
    const loadResult = await this.loadRecord(storeContext);
    if (!loadResult.ok) {
      return fail(loadResult.error);
    }

    if (loadResult.value === null) {
      return ok(this.createSnapshot(null));
    }

    const loadedSchemaVersion = readFiniteIntegerProperty(loadResult.value, "schemaVersion");
    if (loadedSchemaVersion !== CURRENT_PROFILE_SCHEMA_VERSION) {
      return fail(createInvalidRecordError("Profile schemaVersion is incompatible.", {
        schemaVersion: loadedSchemaVersion,
      }));
    }

    const validation = this.validateLoadedRecord(loadResult.value);
    if (!validation.ok) {
      return fail(validation.error);
    }

    const guardResult = this.ensureRecordAccountMatches(validation.value.record, storeContext.accountId);
    if (!guardResult.ok) {
      return fail(guardResult.error);
    }

    return ok(this.createSnapshot(validation.value.record));
  }

  private async readModuleUnlocked<TData extends ProfileJsonObject>(
    input: ReadProfileModuleInput<TData>,
  ): Promise<Result<ReadProfileModuleOutput<TData>, SdkError>> {
    if (!this.enabled) {
      return fail(
        new SdkError("profile.unavailable", "Profile service is disabled.", {
          moduleName: "profile",
        }),
      );
    }

    if (this.destroyed) {
      return fail(this.createDestroyedProfileError("Destroyed profile service cannot read modules."));
    }

    if (this.localStore === undefined) {
      return fail(
        new SdkError(
          "profile.local_store_unavailable",
          "Profile module read requires an injected local store port.",
          { moduleName: "profile" },
        ),
      );
    }

    const validatedInput = this.validateReadModuleInput(input);
    if (!validatedInput.ok) {
      return fail(validatedInput.error);
    }

    const storeContext = this.getStoreContext();
    const loadResult = await this.loadRecord(storeContext);
    if (!loadResult.ok) {
      return fail(loadResult.error);
    }
    if (this.destroyed) {
      return fail(this.createDestroyedProfileError("Destroyed profile service cannot read modules."));
    }

    if (loadResult.value === null) {
      return this.createReadModuleMissingOutput(null, validatedInput.value);
    }

    const loadedSchemaVersion = readFiniteIntegerProperty(loadResult.value, "schemaVersion");
    if (loadedSchemaVersion !== CURRENT_PROFILE_SCHEMA_VERSION) {
      return fail(this.createInvalidRecordError("Profile schemaVersion is incompatible.", {
        schemaVersion: loadedSchemaVersion,
      }));
    }

    const validation = this.validateLoadedRecord(loadResult.value);
    if (!validation.ok) {
      return fail(validation.error);
    }

    const guardResult = this.ensureRecordAccountMatches(validation.value.record, storeContext.accountId);
    if (!guardResult.ok) {
      return fail(guardResult.error);
    }

    return this.readModuleFromRecord(validation.value.record, validatedInput.value);
  }

  private async updateModuleUnlocked<
    TData extends ProfileJsonObject,
    TMeta = undefined,
  >(
    input: UpdateProfileModuleInput<TData, TMeta>,
  ): Promise<Result<UpdateProfileModuleOutput<TData, TMeta>, SdkError>> {
    const commandKey = typeof input.commandKey === "string" ? input.commandKey : undefined;

    if (!this.enabled) {
      return this.failCommand(
        UPDATE_MODULE_COMMAND_TYPE,
        commandKey,
        new SdkError("profile.unavailable", "Profile service is disabled.", {
          moduleName: "profile",
        }),
      );
    }

    if (this.destroyed) {
      return this.failCommand(
        UPDATE_MODULE_COMMAND_TYPE,
        commandKey,
        this.createDestroyedProfileError("Destroyed profile service cannot update modules."),
      );
    }

    if (this.localStore === undefined) {
      return this.failCommand(
        UPDATE_MODULE_COMMAND_TYPE,
        commandKey,
        new SdkError(
          "profile.local_store_unavailable",
          "Profile module update requires an injected local store port.",
          { moduleName: "profile" },
        ),
      );
    }

    const validatedInput = this.validateUpdateModuleInput(input);
    if (!validatedInput.ok) {
      return this.failCommand(UPDATE_MODULE_COMMAND_TYPE, commandKey, validatedInput.error);
    }

    const storeContext = this.getStoreContext();
    return this.updateValidatedModuleUnlocked(storeContext, validatedInput.value, true);
  }

  private async saveModuleUnlocked<TData extends ProfileJsonObject>(
    input: SaveProfileModuleInput<TData>,
  ): Promise<Result<SaveProfileModuleOutput<TData>, SdkError>> {
    if (!this.enabled) {
      return this.failCommand(
        SAVE_MODULE_COMMAND_TYPE,
        input.commandKey,
        new SdkError("profile.unavailable", "Profile service is disabled.", {
          moduleName: "profile",
        }),
      );
    }

    if (this.destroyed) {
      return this.failCommand(
        SAVE_MODULE_COMMAND_TYPE,
        input.commandKey,
        this.createDestroyedProfileError("Destroyed profile service cannot save modules."),
      );
    }

    if (this.localStore === undefined) {
      return this.failCommand(
        SAVE_MODULE_COMMAND_TYPE,
        input.commandKey,
        new SdkError(
          "profile.local_store_unavailable",
          "Profile save requires an injected local store port.",
          { moduleName: "profile" },
        ),
      );
    }

    const validatedInput = this.validateSaveInput(input);
    if (!validatedInput.ok) {
      return this.failCommand(SAVE_MODULE_COMMAND_TYPE, input.commandKey, validatedInput.error);
    }

    return this.saveValidatedModuleUnlocked(validatedInput.value);
  }

  private async saveSdkOwnedModuleUnlocked<TData extends ProfileJsonObject>(
    input: SaveProfileSdkOwnedModuleInput<TData>,
    exactOwner: `sdk:${string}`,
  ): Promise<Result<SaveProfileModuleOutput<TData>, SdkError>> {
    const commandType = isNonEmptyString(input.commandType)
      ? input.commandType
      : "profile.sdk_owned_save_module";

    if (!this.enabled) {
      return this.failCommand(
        commandType,
        input.commandKey,
        new SdkError("profile.unavailable", "Profile service is disabled.", {
          moduleName: "profile",
        }),
      );
    }

    if (this.destroyed) {
      return this.failCommand(
        commandType,
        input.commandKey,
        this.createDestroyedProfileError("Destroyed profile service cannot save SDK-owned modules."),
      );
    }

    if (this.localStore === undefined) {
      return this.failCommand(
        commandType,
        input.commandKey,
        new SdkError(
          "profile.local_store_unavailable",
          "Profile SDK-owned module save requires an injected local store port.",
          { moduleName: "profile" },
        ),
      );
    }

    const validatedInput = this.validateSdkOwnedSaveInput(input, exactOwner);
    if (!validatedInput.ok) {
      return this.failCommand(commandType, input.commandKey, validatedInput.error);
    }

    return this.saveValidatedModuleUnlocked(validatedInput.value);
  }

  private async saveValidatedModuleUnlocked<TData extends ProfileJsonObject>(
    input: ValidatedSaveInput<TData>,
  ): Promise<Result<SaveProfileModuleOutput<TData>, SdkError>> {
    const storeContext = this.getStoreContext();
    const recordResult = await this.loadOrBootstrapRecord(storeContext);
    if (!recordResult.ok) {
      return this.failCommand(input.commandType, input.commandKey, recordResult.error);
    }
    if (this.destroyed) {
      return this.failCommand(
        input.commandType,
        input.commandKey,
        this.createDestroyedProfileError("Destroyed profile service cannot save modules."),
      );
    }

    const record = recordResult.value;
    if (record.syncCheckpoint.status === "conflict") {
      return this.failCommand(
        input.commandType,
        input.commandKey,
        new SdkError("profile.sync_conflict_open", "Profile has an unresolved sync conflict.", {
          moduleName: "profile",
          metadata: { conflictReason: record.syncCheckpoint.conflictReason },
        }),
      );
    }

    const replayResult = this.replaySaveModuleIfReceiptExists(record, input);
    if (!replayResult.ok) {
      return replayResult;
    }
    if (replayResult.value !== null) {
      return ok(replayResult.value);
    }

    const moduleData = this.validateModuleData({
      moduleId: input.moduleId,
      moduleVersion: input.moduleVersion,
      owner: input.owner,
      data: input.data,
    });
    if (!moduleData.ok) {
      return this.failCommand(input.commandType, input.commandKey, moduleData.error);
    }

    const moduleInput: ValidatedSaveInput<TData> = {
      ...input,
      data: moduleData.value as TData,
    };

    const moduleResult = this.createUpdatedModule(record, moduleInput);
    if (!moduleResult.ok) {
      return this.failCommand(input.commandType, input.commandKey, moduleResult.error);
    }

    const now = this.now();
    const nextLocalRevision = record.localRevision + 1;
    const receipt = {
      commandKey: input.commandKey,
      commandType: input.commandType,
      payloadHash: input.payloadHash,
      appliedLocalRevision: nextLocalRevision,
      status: "applied" as const,
      createdAtMs: now,
    };
    const nextRecord = createProfileRecord({
      schemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
      accountId: record.accountId ?? null,
      recordRevision: record.recordRevision + 1,
      localRevision: nextLocalRevision,
      cloudRevision: record.cloudRevision,
      modules: withRecordEntry(record.modules, moduleResult.value.moduleId, moduleResult.value),
      syncCheckpoint: this.createDirtyCheckpoint(record.syncCheckpoint, now),
      commandReceipts: this.pruneReceipts(
        withRecordEntry(record.commandReceipts, receipt.commandKey, receipt),
      ),
      updatedAtMs: now,
    });

    const saveResult = await this.saveRecord(storeContext, nextRecord, record.recordRevision);
    if (!saveResult.ok) {
      if (saveResult.error.code === "profile.local_revision_conflict") {
        const replayAfterConflict = await this.replaySaveModuleAfterLocalRevisionConflict(
          storeContext,
          input,
        );
        if (!replayAfterConflict.ok) {
          return replayAfterConflict;
        }
        if (replayAfterConflict.value !== null) {
          return ok(replayAfterConflict.value);
        }
      }
      return this.failCommand(input.commandType, input.commandKey, saveResult.error);
    }

    const savedModule = readOwn(saveResult.value.modules, input.moduleId);
    const outputModule = (savedModule ?? moduleResult.value) as ProfileModuleEnvelope<TData>;
    this.notifySnapshotChanged(saveResult.value);
    this.emitModuleSaved(
      saveResult.value,
      outputModule,
      input.commandKey,
      "applied",
    );

    return ok({
      kind: "applied",
      record: saveResult.value,
      module: outputModule,
      receipt,
    });
  }

  private replaySaveModuleIfReceiptExists<TData extends ProfileJsonObject>(
    record: PlayerProfileRecord,
    input: ValidatedSaveInput<TData>,
  ): Result<SaveProfileModuleOutput<TData> | null, SdkError> {
    const replay = readOwn(record.commandReceipts, input.commandKey);
    if (replay === undefined) {
      return ok(null);
    }

    if (replay.commandType !== input.commandType || replay.payloadHash !== input.payloadHash) {
      return this.failCommand(
        input.commandType,
        input.commandKey,
        new SdkError(
          "profile.command_replay_conflict",
          "A command with the same commandKey was already applied with a different payload.",
          {
            moduleName: "profile",
            metadata: {
              commandKey: input.commandKey,
              existingCommandType: replay.commandType,
              commandType: input.commandType,
              existingPayloadHash: replay.payloadHash,
              payloadHash: input.payloadHash,
            },
          },
        ),
      );
    }

    const currentModule = readOwn(record.modules, input.moduleId);
    if (currentModule !== undefined && currentModule.moduleId !== input.moduleId) {
      return this.failCommand(
        input.commandType,
        input.commandKey,
        new SdkError("profile.command_failed", "Current profile command module does not match input.", {
          moduleName: "profile",
          metadata: {
            moduleId: input.moduleId,
            currentModuleId: currentModule.moduleId,
          },
        }),
      );
    }

    return ok({
      kind: "replayed",
      record,
      moduleId: input.moduleId,
      currentModule: (currentModule ?? null) as ProfileModuleEnvelope<TData> | null,
      receipt: replay,
    });
  }

  private async replaySaveModuleAfterLocalRevisionConflict<TData extends ProfileJsonObject>(
    storeContext: ProfileStoreContext,
    input: ValidatedSaveInput<TData>,
  ): Promise<Result<SaveProfileModuleOutput<TData> | null, SdkError>> {
    const loadResult = await this.loadRecord(storeContext);
    if (!loadResult.ok) {
      return this.failCommand(input.commandType, input.commandKey, loadResult.error);
    }
    if (this.destroyed) {
      return this.failCommand(
        input.commandType,
        input.commandKey,
        this.createDestroyedProfileError("Destroyed profile service cannot save modules."),
      );
    }

    if (loadResult.value === null) {
      return ok(null);
    }

    const validation = this.validateLoadedRecord(loadResult.value);
    if (!validation.ok) {
      return this.failCommand(input.commandType, input.commandKey, validation.error);
    }

    const latestRecord = validation.value.record;
    const guardResult = this.ensureRecordAccountMatches(latestRecord, storeContext.accountId);
    if (!guardResult.ok) {
      return this.failCommand(input.commandType, input.commandKey, guardResult.error);
    }

    if (latestRecord.syncCheckpoint.status === "conflict") {
      return this.failCommand(
        input.commandType,
        input.commandKey,
        new SdkError("profile.sync_conflict_open", "Profile has an unresolved sync conflict.", {
          moduleName: "profile",
          metadata: { conflictReason: latestRecord.syncCheckpoint.conflictReason },
        }),
      );
    }

    return this.replaySaveModuleIfReceiptExists(latestRecord, input);
  }

  private async updateValidatedModuleUnlocked<
    TData extends ProfileJsonObject,
    TMeta,
  >(
    storeContext: ProfileStoreContext,
    input: ValidatedUpdateModuleInput<TData, TMeta>,
    retryOnLocalRevisionConflict: boolean,
  ): Promise<Result<UpdateProfileModuleOutput<TData, TMeta>, SdkError>> {
    const recordResult = await this.loadOrBootstrapRecord(storeContext);
    if (!recordResult.ok) {
      return this.failCommand(input.commandType, input.commandKey, recordResult.error);
    }
    if (this.destroyed) {
      return this.failCommand(
        input.commandType,
        input.commandKey,
        this.createDestroyedProfileError("Destroyed profile service cannot update modules."),
      );
    }

    const record = recordResult.value;
    if (record.syncCheckpoint.status === "conflict") {
      return this.failCommand(
        input.commandType,
        input.commandKey,
        new SdkError("profile.sync_conflict_open", "Profile has an unresolved sync conflict.", {
          moduleName: "profile",
          metadata: { conflictReason: record.syncCheckpoint.conflictReason },
        }),
      );
    }

    const replayResult = this.replayUpdateModuleIfReceiptExists(record, input);
    if (!replayResult.ok) {
      return replayResult;
    }
    if (replayResult.value !== null) {
      return ok(replayResult.value);
    }

    const prepared = this.prepareUpdateModuleMutation(record, input, "apply");
    if (!prepared.ok) {
      return this.failCommand(input.commandType, input.commandKey, prepared.error);
    }
    if (prepared.value.kind === "noop") {
      return ok(prepared.value.output);
    }

    const now = this.now();
    const nextLocalRevision = record.localRevision + 1;
    const receipt = {
      commandKey: input.commandKey,
      commandType: input.commandType,
      payloadHash: input.payloadHash,
      appliedLocalRevision: nextLocalRevision,
      status: "applied" as const,
      createdAtMs: now,
    };
    const nextRecord = createProfileRecord({
      schemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
      accountId: record.accountId ?? null,
      recordRevision: record.recordRevision + 1,
      localRevision: nextLocalRevision,
      cloudRevision: record.cloudRevision,
      modules: withRecordEntry(record.modules, prepared.value.module.moduleId, prepared.value.module),
      syncCheckpoint: this.createDirtyCheckpoint(record.syncCheckpoint, now),
      commandReceipts: this.pruneReceipts(
        withRecordEntry(record.commandReceipts, receipt.commandKey, receipt),
      ),
      updatedAtMs: now,
    });

    const saveResult = await this.saveRecord(storeContext, nextRecord, record.recordRevision);
    if (!saveResult.ok) {
      if (saveResult.error.code === "profile.local_revision_conflict" && retryOnLocalRevisionConflict) {
        return this.updateValidatedModuleUnlocked(storeContext, input, false);
      }
      return this.failCommand(input.commandType, input.commandKey, saveResult.error);
    }

    const savedModule = readOwn(saveResult.value.modules, input.moduleId);
    const outputModule = (savedModule ?? prepared.value.module) as ProfileModuleEnvelope<TData>;
    this.notifySnapshotChanged(saveResult.value);
    this.emitModuleSaved(
      saveResult.value,
      outputModule,
      input.commandKey,
      "applied",
    );

    return ok(createUpdateModuleAppliedOutput({
      record: saveResult.value,
      module: outputModule,
      receipt,
      meta: prepared.value.meta,
    }));
  }

  private replayUpdateModuleIfReceiptExists<
    TData extends ProfileJsonObject,
    TMeta,
  >(
    record: PlayerProfileRecord,
    input: ValidatedUpdateModuleInput<TData, TMeta>,
  ): Result<UpdateProfileModuleOutput<TData, TMeta> | null, SdkError> {
    const replay = readOwn(record.commandReceipts, input.commandKey);
    if (replay === undefined) {
      return ok(null);
    }

    if (replay.commandType !== input.commandType || replay.payloadHash !== input.payloadHash) {
      return this.failCommand(
        input.commandType,
        input.commandKey,
        new SdkError(
          "profile.command_replay_conflict",
          "A command with the same commandKey was already applied with a different payload.",
          {
            moduleName: "profile",
            metadata: {
              commandKey: input.commandKey,
              existingCommandType: replay.commandType,
              commandType: input.commandType,
              existingPayloadHash: replay.payloadHash,
              payloadHash: input.payloadHash,
            },
          },
        ),
      );
    }

    const prepared = this.prepareUpdateModuleReplay(record, input, replay);
    if (!prepared.ok) {
      return this.failCommand(input.commandType, input.commandKey, prepared.error);
    }

    return ok(prepared.value);
  }

  private prepareUpdateModuleReplay<
    TData extends ProfileJsonObject,
    TMeta,
  >(
    record: PlayerProfileRecord,
    input: ValidatedUpdateModuleInput<TData, TMeta>,
    receipt: ProfileCommandReceipt,
  ): Result<UpdateProfileModuleOutput<TData, TMeta>, SdkError> {
    const current = readOwn(record.modules, input.moduleId);
    if (current === undefined) {
      return ok({
        kind: "replayed",
        record,
        moduleId: input.moduleId,
        module: null,
        data: null,
        receipt,
      });
    }

    const moduleCheck = this.validateProfileModuleMatch(current, input);
    if (!moduleCheck.ok) {
      return fail(moduleCheck.error);
    }

    const normalized = this.normalizeProfileModuleData(current.data, input, true, "replay");
    if (!normalized.ok) {
      return fail(normalized.error);
    }

    const decision = this.runUpdateModuleHandler(input, {
      data: normalized.value,
      exists: true,
      mode: "replay",
    });
    if (!decision.ok) {
      return fail(decision.error);
    }

    return ok(createUpdateModuleReplayedOutput({
      record,
      module: {
        ...current,
        data: normalized.value,
      },
      data: normalized.value,
      receipt,
      meta: decision.value.meta,
    }));
  }

  private prepareUpdateModuleMutation<
    TData extends ProfileJsonObject,
    TMeta,
  >(
    record: PlayerProfileRecord,
    input: ValidatedUpdateModuleInput<TData, TMeta>,
    mode: "apply",
  ): Result<PreparedUpdateModuleMutation<TData, TMeta>, SdkError> {
    const current = readOwn(record.modules, input.moduleId);
    if (current !== undefined) {
      const moduleCheck = this.validateProfileModuleMatch(current, input);
      if (!moduleCheck.ok) {
        return fail(moduleCheck.error);
      }
    }

    const exists = current !== undefined;
    const baseData = exists
      ? ok(current.data)
      : this.createDefaultProfileModuleData(input);
    if (!baseData.ok) {
      return fail(baseData.error);
    }

    const normalized = this.normalizeProfileModuleData(baseData.value, input, exists, mode);
    if (!normalized.ok) {
      return fail(normalized.error);
    }

    const decision = this.runUpdateModuleHandler(input, {
      data: normalized.value,
      exists,
      mode,
    });
    if (!decision.ok) {
      return fail(decision.error);
    }

    if (decision.value.kind === "noop") {
      const outputModule = current === undefined
        ? null
        : {
            ...current,
            data: normalized.value,
          };
      return ok({
        kind: "noop",
        output: createUpdateModuleNoopOutput({
          record,
          module: outputModule,
          data: normalized.value,
          meta: decision.value.meta,
        }),
      });
    }

    const dataResult = validateAndCloneProfileJsonObject(decision.value.data, {
      moduleId: input.moduleId,
      owner: input.owner,
    });
    if (!dataResult.ok) {
      return fail(dataResult.error);
    }

    const moduleData = this.validateModuleData({
      moduleId: input.moduleId,
      moduleVersion: input.moduleVersion,
      owner: input.owner,
      data: dataResult.value,
    });
    if (!moduleData.ok) {
      return fail(moduleData.error);
    }

    const moduleResult = this.createUpdatedModule(record, {
      commandType: input.commandType,
      commandKey: input.commandKey,
      moduleId: input.moduleId,
      moduleVersion: input.moduleVersion,
      expectedModuleRevision: current?.moduleRevision ?? null,
      owner: input.owner,
      data: moduleData.value as TData,
      payloadHash: input.payloadHash,
    });
    if (!moduleResult.ok) {
      return fail(moduleResult.error);
    }

    return ok(createPreparedUpdateModuleMutation({
      module: moduleResult.value,
      meta: decision.value.meta,
    }));
  }

  private async syncCloudSnapshotUnlocked(
    input: SyncCloudSnapshotInput = {},
  ): Promise<Result<SyncCloudSnapshotOutput, SdkError>> {
    if (this.destroyed) {
      const error = this.createDestroyedProfileError("Destroyed profile service cannot sync cloud snapshots.", {
        traceId: input.traceId,
      });
      this.emitSyncFailed(error, { traceId: input.traceId });
      return fail(error);
    }

    if (!this.enabled) {
      const output = this.createSkippedSyncOutput("disabled", null);
      this.emitSyncCompleted(output, { traceId: input.traceId });
      return ok(output);
    }

    if (this.localStore === undefined) {
      const output = this.createSkippedSyncOutput("no_local_store", null);
      this.emitSyncCompleted(output, { traceId: input.traceId });
      return ok(output);
    }

    if (this.cloudSnapshotPort === undefined) {
      const output = this.createSkippedSyncOutput("cloud_port_missing", null);
      this.emitSyncCompleted(output, { traceId: input.traceId });
      return ok(output);
    }

    const session = this.options.account?.getSession() ?? null;
    if (session === null || !isNonEmptyString(session.accountId)) {
      const output = this.createSkippedSyncOutput("account_missing", null);
      this.emitSyncFailed(
        new SdkError("profile.account_missing", "Profile cloud sync requires AccountSession.accountId.", {
          moduleName: "profile",
          metadata: { traceId: input.traceId },
        }),
        { accountId: undefined, traceId: input.traceId },
      );
      return ok(output);
    }

    const storeContext = this.getStoreContextForAccount(session.accountId);
    const recordResult = await this.loadOrBootstrapRecord(storeContext);
    if (!recordResult.ok) {
      this.emitSyncFailed(recordResult.error, { accountId: session.accountId, traceId: input.traceId });
      return fail(recordResult.error);
    }
    if (this.destroyed) {
      const error = this.createDestroyedProfileError("Destroyed profile service cannot sync cloud snapshots.", {
        accountId: session.accountId,
        traceId: input.traceId,
      });
      this.emitSyncFailed(error, { accountId: session.accountId, traceId: input.traceId });
      return fail(error);
    }

    const localAccountGuard = this.ensureRecordAccountMatches(recordResult.value, session.accountId);
    if (!localAccountGuard.ok) {
      this.emitSyncFailed(localAccountGuard.error, {
        accountId: session.accountId,
        traceId: input.traceId,
      });
      return fail(localAccountGuard.error);
    }

    this.emitSyncStarted(session, input.traceId);
    return this.syncCloudSnapshotWithSession(recordResult.value, session, storeContext, input);
  }

  private async resolveConflictUnlocked(
    input: ResolveProfileConflictInput = {},
  ): Promise<Result<ResolveProfileConflictOutput, SdkError>> {
    const validatedInput = this.validateResolveInput(input);
    const fallbackCommandType = resolveCommandType(input.strategy ?? "use_server");

    if (this.destroyed) {
      return this.failConflictResolution(
        validatedInput.ok ? validatedInput.value.commandType : fallbackCommandType,
        validatedInput.ok ? validatedInput.value.commandKey : input.commandKey,
        new SdkError("profile.conflict_resolution_failed", "Destroyed profile service cannot resolve conflicts.", {
          moduleName: "profile",
          metadata: { traceId: input.traceId },
        }),
        { traceId: input.traceId },
      );
    }

    if (!this.enabled) {
      return ok({
        status: "skipped",
        strategy: input.strategy ?? "use_server",
        record: null,
        skippedReason: "disabled",
      });
    }

    if (!validatedInput.ok) {
      return this.failCommand(
        fallbackCommandType,
        input.commandKey,
        validatedInput.error,
      );
    }

    if (this.localStore === undefined) {
      return ok({
        status: "skipped",
        strategy: validatedInput.value.strategy,
        record: null,
        skippedReason: "no_conflict",
      });
    }

    const session = this.options.account?.getSession() ?? null;
    if (session === null || !isNonEmptyString(session.accountId)) {
      return this.failConflictResolution(
        validatedInput.value.commandType,
        validatedInput.value.commandKey,
        new SdkError("profile.account_missing", "Profile conflict resolution requires AccountSession.accountId.", {
          moduleName: "profile",
          metadata: { traceId: input.traceId },
        }),
        { traceId: input.traceId },
      );
    }

    const storeContext = this.getStoreContextForAccount(session.accountId);
    const recordResult = await this.loadRecord(storeContext);
    if (!recordResult.ok) {
      return this.failConflictResolution(
        validatedInput.value.commandType,
        validatedInput.value.commandKey,
        recordResult.error,
        { accountId: session.accountId, traceId: input.traceId },
      );
    }

    if (recordResult.value === null) {
      return ok({
        status: "skipped",
        strategy: validatedInput.value.strategy,
        record: null,
        skippedReason: "no_conflict",
      });
    }

    const recordValidation = this.validateLoadedRecord(recordResult.value);
    if (!recordValidation.ok) {
      return this.failConflictResolution(
        validatedInput.value.commandType,
        validatedInput.value.commandKey,
        recordValidation.error,
        { accountId: session.accountId, traceId: input.traceId },
      );
    }

    const record = recordValidation.value.record;
    const localAccountGuard = this.ensureRecordAccountMatches(record, session.accountId);
    if (!localAccountGuard.ok) {
      return this.failConflictResolution(
        validatedInput.value.commandType,
        validatedInput.value.commandKey,
        localAccountGuard.error,
        { accountId: session.accountId, traceId: input.traceId },
      );
    }

    if (record.syncCheckpoint.status !== "conflict") {
      const replay = this.readResolvedConflictReplay(record, validatedInput.value);
      if (!replay.ok) {
        return this.failCommand(
          validatedInput.value.commandType,
          validatedInput.value.commandKey,
          replay.error,
        );
      }

      if (replay.value !== undefined) {
        return ok({
          status: "resolved",
          strategy: validatedInput.value.strategy,
          record,
          kind: "replayed",
          receipt: replay.value,
        });
      }

      return ok({
        status: "skipped",
        strategy: validatedInput.value.strategy,
        record,
        skippedReason: "no_conflict",
      });
    }

    if (
      validatedInput.value.strategy === "custom" &&
      this.conflictResolver === undefined
    ) {
      return ok({
        status: "skipped",
        strategy: validatedInput.value.strategy,
        record,
        skippedReason: "resolver_missing",
      });
    }

    if (this.cloudSnapshotPort === undefined) {
      return this.failConflictResolution(
        validatedInput.value.commandType,
        validatedInput.value.commandKey,
        new SdkError("profile.cloud_unavailable", "Profile conflict resolution requires a cloud snapshot port.", {
          moduleName: "profile",
          metadata: {
            accountId: session.accountId,
            traceId: input.traceId,
          },
        }),
        { accountId: session.accountId, traceId: input.traceId },
      );
    }

    const serverConflict = await this.loadServerConflict(record, session, input.traceId);
    if (!serverConflict.ok) {
      return this.failConflictResolution(
        validatedInput.value.commandType,
        validatedInput.value.commandKey,
        serverConflict.error,
        { accountId: session.accountId, traceId: input.traceId },
      );
    }

    const resolveInput = this.bindResolveInputToConflict(validatedInput.value, serverConflict.value);
    const replay = this.readCommandReplay(record, resolveInput);
    if (!replay.ok) {
      return this.failCommand(
        resolveInput.commandType,
        resolveInput.commandKey,
        replay.error,
      );
    }

    const resolutionResult = await this.applyConflictResolution({
      localRecord: record,
      conflict: serverConflict.value,
      session,
      storeContext,
      resolveInput,
      traceId: input.traceId,
    });
    if (!resolutionResult.ok) {
      return this.failConflictResolution(
        resolveInput.commandType,
        resolveInput.commandKey,
        resolutionResult.error,
        { accountId: session.accountId, traceId: input.traceId },
      );
    }

    return ok(resolutionResult.value);
  }

  private validateResolveInput(
    input: ResolveProfileConflictInput,
  ): Result<ValidatedResolveInput, SdkError> {
    const strategy = input.strategy ?? "use_server";
    if (!isConflictResolutionStrategy(strategy)) {
      return fail(
        new SdkError("profile.conflict_resolution_failed", "Profile conflict strategy is invalid.", {
          moduleName: "profile",
          metadata: { strategy: input.strategy },
        }),
      );
    }

    const commandType = resolveCommandType(strategy);
    if (input.commandKey === undefined) {
      return ok({
        strategy,
        commandType,
      });
    }

    const commandKey = validatePublicProfileCommandKey(input.commandKey);
    if (!commandKey.ok) {
      return fail(commandKey.error);
    }

    return ok({
      commandKey: commandKey.value,
      strategy,
      commandType,
    });
  }

  private bindResolveInputToConflict(
    input: ValidatedResolveInput,
    conflict: ProfileConflictSnapshot,
  ): ValidatedResolveInput {
    if (input.commandKey === undefined) {
      return input;
    }

    const commandPayload: ProfileJsonObject = {
      commandType: input.commandType,
      input: {
        commandKey: input.commandKey,
        strategy: input.strategy,
        conflict: this.createResolveConflictIdentity(conflict),
      },
    };

    return {
      ...input,
      payloadHash: hashProfileJson(commandPayload),
    };
  }

  private createResolveConflictIdentity(conflict: ProfileConflictSnapshot): ProfileJsonObject {
    return {
      reason: conflict.reason,
      cloudRevision: conflict.cloudRevision,
      localRecord: conflict.localRecord === null ? null : this.createRecordConflictIdentity(conflict.localRecord),
      serverRecord: this.createRecordConflictIdentity(conflict.serverRecord),
    };
  }

  private createRecordConflictIdentity(record: PlayerProfileRecord): ProfileJsonObject {
    return {
      schemaVersion: record.schemaVersion,
      accountId: record.accountId ?? null,
      recordRevision: record.recordRevision,
      localRevision: record.localRevision,
      cloudRevision: record.cloudRevision,
      syncCheckpoint: {
        status: record.syncCheckpoint.status,
        lastSyncedLocalRevision: record.syncCheckpoint.lastSyncedLocalRevision,
        conflictReason: record.syncCheckpoint.conflictReason ?? null,
        conflictCloudRevision: record.syncCheckpoint.conflictCloudRevision ?? null,
      },
      recordHash: hashProfileJson(record as unknown as ProfileJsonObject),
    };
  }

  private readResolvedConflictReplay(
    record: PlayerProfileRecord,
    input: ValidatedResolveInput,
  ): Result<ProfileCommandReceipt | undefined, SdkError> {
    if (input.commandKey === undefined) {
      return ok(undefined);
    }

    const replay = readOwn(record.commandReceipts, input.commandKey);
    if (replay === undefined) {
      return ok(undefined);
    }

    if (replay.commandType !== input.commandType) {
      return fail(
        new SdkError(
          "profile.command_replay_conflict",
          "A command with the same commandKey was already applied with a different payload.",
          {
            moduleName: "profile",
            metadata: {
              commandKey: input.commandKey,
              existingCommandType: replay.commandType,
              commandType: input.commandType,
            },
          },
        ),
      );
    }

    return ok(replay);
  }

  private readCommandReplay(
    record: PlayerProfileRecord,
    input: ValidatedResolveInput,
  ): Result<ProfileCommandReceipt | undefined, SdkError> {
    if (input.commandKey === undefined || input.payloadHash === undefined) {
      return ok(undefined);
    }

    const replay = readOwn(record.commandReceipts, input.commandKey);
    if (replay === undefined) {
      return ok(undefined);
    }

    if (replay.payloadHash !== input.payloadHash) {
      return fail(
        new SdkError(
          "profile.command_replay_conflict",
          "A command with the same commandKey was already applied with a different payload.",
          {
            moduleName: "profile",
            metadata: {
              commandKey: input.commandKey,
              existingPayloadHash: replay.payloadHash,
              payloadHash: input.payloadHash,
            },
          },
        ),
      );
    }

    return ok(replay);
  }

  private async loadServerConflict(
    localRecord: PlayerProfileRecord,
    session: AccountSession,
    traceId: string | undefined,
  ): Promise<Result<ProfileConflictSnapshot, SdkError>> {
    const pullResult = await this.pullCloudSnapshot(session, traceId);
    if (!pullResult.ok) {
      return fail(pullResult.error);
    }

    if (pullResult.value.status === "not_found") {
      return fail(
        new SdkError(
          "profile.cloud_invalid_snapshot",
          "Profile conflict resolution requires an existing server snapshot.",
          {
            moduleName: "profile",
            metadata: { accountId: session.accountId, traceId },
          },
        ),
      );
    }

    const validatedRemote = this.validateRemoteSnapshot(
      pullResult.value.snapshot,
      pullResult.value.cloudRevision,
    );
    if (!validatedRemote.ok) {
      return fail(validatedRemote.error);
    }
    const remoteGuard = this.ensureRemoteRecordAccountMatches(validatedRemote.value, session.accountId);
    if (!remoteGuard.ok) {
      return fail(remoteGuard.error);
    }

    return ok({
      reason:
        localRecord.syncCheckpoint.conflictReason === undefined
          ? "revision_conflict"
          : localRecord.syncCheckpoint.conflictReason,
      localRecord,
      serverRecord: this.bindRecordToAccount(validatedRemote.value, session.accountId),
      cloudRevision: pullResult.value.cloudRevision,
    });
  }

  private async applyConflictResolution(input: {
    readonly localRecord: PlayerProfileRecord;
    readonly conflict: ProfileConflictSnapshot;
    readonly session: AccountSession;
    readonly storeContext: ProfileStoreContext;
    readonly resolveInput: ValidatedResolveInput;
    readonly traceId?: string | undefined;
  }): Promise<Result<ResolveProfileConflictOutput, SdkError>> {
    switch (input.resolveInput.strategy) {
      case "use_server":
        return this.applyServerConflictResolution({
          localRecord: input.localRecord,
          baseRecord: input.conflict.serverRecord,
          cloudRevision: input.conflict.cloudRevision,
          receiptSource: input.conflict.serverRecord.commandReceipts,
          strategy: "use_server",
          session: input.session,
          storeContext: input.storeContext,
          resolveInput: input.resolveInput,
          traceId: input.traceId,
        });
      case "use_local":
        return this.applyPushConflictResolution({
          localRecord: input.localRecord,
          baseRecord: input.localRecord,
          cloudRevision: input.conflict.cloudRevision,
          receiptSource: input.localRecord.commandReceipts,
          strategy: "use_local",
          advanceLocalRevision: false,
          session: input.session,
          storeContext: input.storeContext,
          resolveInput: input.resolveInput,
          traceId: input.traceId,
        });
      case "custom":
        return this.applyCustomConflictResolution(input);
    }
  }

  private async applyCustomConflictResolution(input: {
    readonly localRecord: PlayerProfileRecord;
    readonly conflict: ProfileConflictSnapshot;
    readonly session: AccountSession;
    readonly storeContext: ProfileStoreContext;
    readonly resolveInput: ValidatedResolveInput;
    readonly traceId?: string | undefined;
  }): Promise<Result<ResolveProfileConflictOutput, SdkError>> {
    const resolver = this.conflictResolver;
    if (resolver === undefined) {
      return fail(
        new SdkError("profile.conflict_resolution_failed", "Profile conflict resolver is not configured.", {
          moduleName: "profile",
          metadata: { traceId: input.traceId },
        }),
      );
    }

    let resolutionResult: Awaited<ReturnType<ProfileConflictResolver>>;
    try {
      resolutionResult = await resolver({
        conflict: input.conflict,
        strategy: "custom",
      });
    } catch (error) {
      return fail(
        SdkError.fromUnknown(
          "profile.conflict_resolution_failed",
          "Custom profile conflict resolver failed.",
          error,
          { moduleName: "profile", metadata: { traceId: input.traceId } },
        ),
      );
    }

    if (!resolutionResult.ok) {
      return fail(resolutionResult.error);
    }

    const resolvedStrategy = (resolutionResult.value as { readonly strategy?: unknown }).strategy;
    if (
      resolvedStrategy !== "use_server" &&
      resolvedStrategy !== "use_local"
    ) {
      return fail(
        new SdkError(
          "profile.conflict_resolution_failed",
          "Custom profile conflict resolver returned an invalid strategy.",
          {
            moduleName: "profile",
            metadata: {
              strategy: resolvedStrategy,
              traceId: input.traceId,
            },
          },
        ),
      );
    }

    switch (resolvedStrategy) {
      case "use_server":
        return this.applyServerConflictResolution({
          localRecord: input.localRecord,
          baseRecord: input.conflict.serverRecord,
          cloudRevision: input.conflict.cloudRevision,
          receiptSource: input.conflict.serverRecord.commandReceipts,
          strategy: "use_server",
          session: input.session,
          storeContext: input.storeContext,
          resolveInput: input.resolveInput,
          traceId: input.traceId,
        });
      case "use_local":
        return this.applyPushConflictResolution({
          localRecord: input.localRecord,
          baseRecord: input.localRecord,
          cloudRevision: input.conflict.cloudRevision,
          receiptSource: input.localRecord.commandReceipts,
          strategy: "use_local",
          advanceLocalRevision: false,
          session: input.session,
          storeContext: input.storeContext,
          resolveInput: input.resolveInput,
          traceId: input.traceId,
        });
    }
  }

  private async applyServerConflictResolution(input: {
    readonly localRecord: PlayerProfileRecord;
    readonly baseRecord: PlayerProfileRecord;
    readonly cloudRevision: string;
    readonly receiptSource: Readonly<Record<string, ProfileCommandReceipt>>;
    readonly strategy: ProfileConflictResolutionStrategy;
    readonly session: AccountSession;
    readonly storeContext: ProfileStoreContext;
    readonly resolveInput: ValidatedResolveInput;
    readonly traceId?: string | undefined;
  }): Promise<Result<ResolveProfileConflictOutput, SdkError>> {
    const resolved = this.createResolvedConflictRecord({
      localRecord: input.localRecord,
      baseRecord: input.baseRecord,
      cloudRevision: input.cloudRevision,
      receiptSource: input.receiptSource,
      advanceLocalRevision: true,
      resolveInput: input.resolveInput,
    });

    const saveResult = await this.saveRecord(input.storeContext, resolved.record, input.localRecord.recordRevision);
    if (!saveResult.ok) {
      return fail(saveResult.error);
    }

    this.notifySnapshotChanged(saveResult.value);
    this.emitSyncResolved(saveResult.value, input.strategy, {
      accountId: input.session.accountId,
      traceId: input.traceId,
    });

    return ok({
      status: "resolved",
      strategy: input.strategy,
      record: saveResult.value,
      kind: "applied",
      ...(resolved.receipt === undefined ? {} : { receipt: resolved.receipt }),
    });
  }

  private async applyPushConflictResolution(input: {
    readonly localRecord: PlayerProfileRecord;
    readonly baseRecord: PlayerProfileRecord;
    readonly cloudRevision: string;
    readonly receiptSource: Readonly<Record<string, ProfileCommandReceipt>>;
    readonly strategy: ProfileConflictResolutionStrategy;
    readonly advanceLocalRevision: boolean;
    readonly session: AccountSession;
    readonly storeContext: ProfileStoreContext;
    readonly resolveInput: ValidatedResolveInput;
    readonly traceId?: string | undefined;
  }): Promise<Result<ResolveProfileConflictOutput, SdkError>> {
    const resolved = this.createResolvedConflictRecord({
      localRecord: input.localRecord,
      baseRecord: input.baseRecord,
      cloudRevision: input.cloudRevision,
      receiptSource: input.receiptSource,
      advanceLocalRevision: input.advanceLocalRevision,
      resolveInput: input.resolveInput,
    });

    const pushResult = await this.pushCloudSnapshot(
      resolved.record,
      input.session,
      input.traceId,
      input.cloudRevision,
    );
    if (!pushResult.ok) {
      return fail(pushResult.error);
    }

    if (pushResult.value.status === "revision_conflict") {
      const validatedRemote = this.validateRemoteSnapshot(
        pushResult.value.latestSnapshot,
        pushResult.value.cloudRevision,
      );
      if (!validatedRemote.ok) {
        return fail(validatedRemote.error);
      }
      const remoteGuard = this.ensureRemoteRecordAccountMatches(
        validatedRemote.value,
        input.session.accountId,
      );
      if (!remoteGuard.ok) {
        return fail(remoteGuard.error);
      }

      const reopenResult = await this.openRevisionConflict({
        storeContext: input.storeContext,
        localRecord: input.localRecord,
        serverRecord: this.bindRecordToAccount(validatedRemote.value, input.session.accountId),
        cloudRevision: pushResult.value.cloudRevision,
        accountId: input.session.accountId,
        traceId: input.traceId,
        reason: "revision_conflict",
      });
      if (!reopenResult.ok) {
        return fail(reopenResult.error);
      }

      return fail(
        new SdkError(
          "profile.cloud_revision_conflict",
          "Profile conflict resolution encountered a newer server revision.",
          {
            moduleName: "profile",
            metadata: {
              accountId: input.session.accountId,
              cloudRevision: pushResult.value.cloudRevision,
              traceId: input.traceId,
            },
          },
        ),
      );
    }

    const finalRecord = createProfileRecord({
      ...resolved.record,
      accountId: resolved.record.accountId ?? input.session.accountId,
      cloudRevision: pushResult.value.cloudRevision,
    });
    const saveResult = await this.saveRecord(input.storeContext, finalRecord, input.localRecord.recordRevision);
    if (!saveResult.ok) {
      return fail(saveResult.error);
    }

    this.notifySnapshotChanged(saveResult.value);
    this.emitSyncResolved(saveResult.value, input.strategy, {
      accountId: input.session.accountId,
      traceId: input.traceId,
    });

    return ok({
      status: "resolved",
      strategy: input.strategy,
      record: saveResult.value,
      kind: "applied",
      ...(resolved.receipt === undefined ? {} : { receipt: resolved.receipt }),
    });
  }

  private createResolvedConflictRecord(input: {
    readonly localRecord: PlayerProfileRecord;
    readonly baseRecord: PlayerProfileRecord;
    readonly cloudRevision: string;
    readonly receiptSource: Readonly<Record<string, ProfileCommandReceipt>>;
    readonly advanceLocalRevision: boolean;
    readonly resolveInput: ValidatedResolveInput;
  }): {
    readonly record: PlayerProfileRecord;
    readonly receipt?: ProfileCommandReceipt;
  } {
    const nextLocalRevision = input.advanceLocalRevision
      ? Math.max(input.localRecord.localRevision, input.baseRecord.localRevision) + 1
      : input.localRecord.localRevision;
    const now = this.now();
    const receipt = this.createCommandReceipt({
      commandType: input.resolveInput.commandType,
      appliedLocalRevision: nextLocalRevision,
      createdAtMs: now,
      ...(input.resolveInput.commandKey === undefined
        ? {}
        : { commandKey: input.resolveInput.commandKey }),
      ...(input.resolveInput.payloadHash === undefined
        ? {}
        : { payloadHash: input.resolveInput.payloadHash }),
    });
    const receiptSource = this.pruneReceipts(input.receiptSource);
    const commandReceipts =
      receipt === undefined
        ? receiptSource
        : this.pruneReceipts(withRecordEntry(receiptSource, receipt.commandKey, receipt));

    return {
      ...(receipt === undefined ? {} : { receipt }),
      record: createProfileRecord({
        schemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
        accountId: input.baseRecord.accountId ?? input.localRecord.accountId ?? null,
        recordRevision: input.localRecord.recordRevision + 1,
        localRevision: nextLocalRevision,
        cloudRevision: input.cloudRevision,
        modules: input.baseRecord.modules,
        syncCheckpoint: {
          status: "synced",
          lastSyncedLocalRevision: nextLocalRevision,
          updatedAtMs: now,
        },
        commandReceipts,
        updatedAtMs: now,
      }),
    };
  }

  private createCommandReceipt(input: {
    readonly commandKey?: string;
    readonly commandType: string;
    readonly payloadHash?: string;
    readonly appliedLocalRevision: number;
    readonly createdAtMs: number;
  }): ProfileCommandReceipt | undefined {
    if (input.commandKey === undefined || input.payloadHash === undefined) {
      return undefined;
    }

    return {
      commandKey: input.commandKey,
      commandType: input.commandType,
      payloadHash: input.payloadHash,
      appliedLocalRevision: input.appliedLocalRevision,
      status: "applied",
      createdAtMs: input.createdAtMs,
    };
  }

  onSnapshotChanged(listener: ProfileSnapshotChangedListener): Unsubscribe {
    if (this.destroyed) {
      return () => undefined;
    }

    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.listeners.clear();
    await this.operationQueue;
  }

  private isAvailable(): boolean {
    return this.enabled && !this.destroyed && this.localStore !== undefined;
  }

  private createDestroyedProfileError(
    message: string,
    metadata: Readonly<Record<string, unknown>> = {},
  ): SdkError {
    return new SdkError("profile.unavailable", message, {
      moduleName: "profile",
      metadata,
    });
  }

  private async syncCloudSnapshotWithSession(
    record: PlayerProfileRecord,
    session: AccountSession,
    storeContext: ProfileStoreContext,
    input: SyncCloudSnapshotInput,
  ): Promise<Result<SyncCloudSnapshotOutput, SdkError>> {
    const accountId = session.accountId;

    if (record.syncCheckpoint.status === "conflict") {
      const error = new SdkError("profile.sync_conflict_open", "Profile has an unresolved sync conflict.", {
        moduleName: "profile",
        metadata: {
          accountId,
          conflictReason: record.syncCheckpoint.conflictReason,
          traceId: input.traceId,
        },
      });
      this.emitSyncFailed(error, { accountId, traceId: input.traceId });
      return fail(error);
    }

    const localDirty = this.isLocalRevisionDirty(record);

    if (record.cloudRevision === null) {
      const pullResult = await this.pullCloudSnapshot(session, input.traceId);
      if (!pullResult.ok) {
        this.emitSyncFailed(pullResult.error, { accountId, traceId: input.traceId });
        return fail(pullResult.error);
      }

      if (pullResult.value.status === "ok") {
        const validatedRemote = this.validateRemoteSnapshot(
          pullResult.value.snapshot,
          pullResult.value.cloudRevision,
        );
        if (!validatedRemote.ok) {
          this.emitSyncFailed(validatedRemote.error, { accountId, traceId: input.traceId });
          return fail(validatedRemote.error);
        }
        const remoteGuard = this.ensureRemoteRecordAccountMatches(validatedRemote.value, accountId);
        if (!remoteGuard.ok) {
          this.emitSyncFailed(remoteGuard.error, { accountId, traceId: input.traceId });
          return fail(remoteGuard.error);
        }

        if (!localDirty) {
          return this.applyPulledServerSnapshot({
            storeContext,
            localRecord: record,
            serverRecord: this.bindRecordToAccount(validatedRemote.value, accountId),
            cloudRevision: pullResult.value.cloudRevision,
            accountId,
            traceId: input.traceId,
          });
        }

        const conflictResult = await this.openRevisionConflict({
          storeContext,
          localRecord: record,
          serverRecord: this.bindRecordToAccount(validatedRemote.value, accountId),
          cloudRevision: pullResult.value.cloudRevision,
          accountId,
          traceId: input.traceId,
          reason: "revision_conflict",
        });
        return conflictResult;
      }

      return this.pushLocalRecordToCloud({
        storeContext,
        record,
        session,
        accountId,
        traceId: input.traceId,
      });
    }

    if (!localDirty) {
      const pullResult = await this.pullCloudSnapshot(session, input.traceId);
      if (!pullResult.ok) {
        this.emitSyncFailed(pullResult.error, { accountId, traceId: input.traceId });
        return fail(pullResult.error);
      }

      if (pullResult.value.status === "not_found") {
        const error = new SdkError(
          "profile.cloud_revision_conflict",
          "Profile cloud snapshot is missing for the local cloudRevision.",
          {
            moduleName: "profile",
            metadata: {
              accountId,
              cloudRevision: record.cloudRevision,
              traceId: input.traceId,
            },
          },
        );
        this.emitSyncFailed(error, { accountId, traceId: input.traceId });
        return fail(error);
      }

      const validatedRemote = this.validateRemoteSnapshot(
        pullResult.value.snapshot,
        pullResult.value.cloudRevision,
      );
      if (!validatedRemote.ok) {
        this.emitSyncFailed(validatedRemote.error, { accountId, traceId: input.traceId });
        return fail(validatedRemote.error);
      }
      const remoteGuard = this.ensureRemoteRecordAccountMatches(validatedRemote.value, accountId);
      if (!remoteGuard.ok) {
        this.emitSyncFailed(remoteGuard.error, { accountId, traceId: input.traceId });
        return fail(remoteGuard.error);
      }

      if (pullResult.value.cloudRevision === record.cloudRevision) {
        const output: SyncCloudSnapshotOutput = {
          status: "completed",
          record,
          cloudRevision: record.cloudRevision,
        };
        this.emitSyncCompleted(output, { accountId, traceId: input.traceId });
        return ok(output);
      }

      return this.applyPulledServerSnapshot({
        storeContext,
        localRecord: record,
        serverRecord: this.bindRecordToAccount(validatedRemote.value, accountId),
        cloudRevision: pullResult.value.cloudRevision,
        accountId,
        traceId: input.traceId,
      });
    }

    return this.pushLocalRecordToCloud({
      storeContext,
      record,
      session,
      accountId,
      traceId: input.traceId,
    });
  }

  private async pushLocalRecordToCloud(input: {
    readonly storeContext: ProfileStoreContext;
    readonly record: PlayerProfileRecord;
    readonly session: AccountSession;
    readonly accountId: string;
    readonly traceId: string | undefined;
  }): Promise<Result<SyncCloudSnapshotOutput, SdkError>> {
    const pushResult = await this.pushCloudSnapshot(input.record, input.session, input.traceId);
    if (!pushResult.ok) {
      this.emitSyncFailed(pushResult.error, { accountId: input.accountId, traceId: input.traceId });
      return fail(pushResult.error);
    }

    if (pushResult.value.status === "revision_conflict") {
      const validatedRemote = this.validateRemoteSnapshot(
        pushResult.value.latestSnapshot,
        pushResult.value.cloudRevision,
      );
      if (!validatedRemote.ok) {
        const checkpointResult = await this.openInvalidServerSnapshotConflict({
          storeContext: input.storeContext,
          localRecord: input.record,
          cloudRevision: pushResult.value.cloudRevision,
          accountId: input.accountId,
          traceId: input.traceId,
        });
        if (!checkpointResult.ok) {
          this.emitSyncFailed(checkpointResult.error, {
            accountId: input.accountId,
            traceId: input.traceId,
          });
          return fail(checkpointResult.error);
        }

        this.emitSyncFailed(validatedRemote.error, {
          accountId: input.accountId,
          traceId: input.traceId,
        });
        return fail(validatedRemote.error);
      }
      const remoteGuard = this.ensureRemoteRecordAccountMatches(validatedRemote.value, input.accountId);
      if (!remoteGuard.ok) {
        this.emitSyncFailed(remoteGuard.error, {
          accountId: input.accountId,
          traceId: input.traceId,
        });
        return fail(remoteGuard.error);
      }

      return this.openRevisionConflict({
        storeContext: input.storeContext,
        localRecord: input.record,
        serverRecord: this.bindRecordToAccount(validatedRemote.value, input.accountId),
        cloudRevision: pushResult.value.cloudRevision,
        accountId: input.accountId,
        traceId: input.traceId,
        reason: "revision_conflict",
      });
    }

    const saveResult = await this.saveSyncedCloudRevision(
      input.storeContext,
      input.record,
      pushResult.value.cloudRevision,
      input.accountId,
    );
    if (!saveResult.ok) {
      if (saveResult.error.code === "profile.local_revision_conflict") {
        return this.rollForwardAfterSyncedRevisionConflict({
          originalRecord: input.record,
          session: input.session,
          storeContext: input.storeContext,
          accountId: input.accountId,
          cloudRevision: pushResult.value.cloudRevision,
          traceId: input.traceId,
        });
      }

      this.emitSyncFailed(saveResult.error, { accountId: input.accountId, traceId: input.traceId });
      return fail(saveResult.error);
    }

    this.notifySnapshotChanged(saveResult.value);
    const output: SyncCloudSnapshotOutput = {
      status: "completed",
      record: saveResult.value,
      cloudRevision: saveResult.value.cloudRevision,
    };
    this.emitSyncCompleted(output, { accountId: input.accountId, traceId: input.traceId });
    return ok(output);
  }

  private async rollForwardAfterSyncedRevisionConflict(input: {
    readonly originalRecord: PlayerProfileRecord;
    readonly session: AccountSession;
    readonly storeContext: ProfileStoreContext;
    readonly accountId: string;
    readonly cloudRevision: string;
    readonly traceId: string | undefined;
  }): Promise<Result<SyncCloudSnapshotOutput, SdkError>> {
    const latestResult = await this.loadRecord(input.storeContext);
    if (!latestResult.ok) {
      this.emitSyncFailed(latestResult.error, { accountId: input.accountId, traceId: input.traceId });
      return fail(latestResult.error);
    }

    if (latestResult.value === null) {
      const error = new SdkError(
        "profile.local_revision_conflict",
        "Profile local record disappeared after cloud push.",
        {
          moduleName: "profile",
          metadata: {
            accountId: input.accountId,
            cloudRevision: input.cloudRevision,
            traceId: input.traceId,
          },
        },
      );
      this.emitSyncFailed(error, { accountId: input.accountId, traceId: input.traceId });
      return fail(error);
    }

    const validation = this.validateLoadedRecord(latestResult.value);
    if (!validation.ok) {
      this.emitSyncFailed(validation.error, { accountId: input.accountId, traceId: input.traceId });
      return fail(validation.error);
    }

    const latestRecord = validation.value.record;
    const guardResult = this.ensureRecordAccountMatches(latestRecord, input.accountId);
    if (!guardResult.ok) {
      this.emitSyncFailed(guardResult.error, { accountId: input.accountId, traceId: input.traceId });
      return fail(guardResult.error);
    }

    if (latestRecord.recordRevision === input.originalRecord.recordRevision) {
      const retrySave = await this.saveSyncedCloudRevision(
        input.storeContext,
        latestRecord,
        input.cloudRevision,
        input.accountId,
      );
      if (!retrySave.ok) {
        this.emitSyncFailed(retrySave.error, { accountId: input.accountId, traceId: input.traceId });
        return fail(retrySave.error);
      }

      this.notifySnapshotChanged(retrySave.value);
      const output: SyncCloudSnapshotOutput = {
        status: "completed",
        record: retrySave.value,
        cloudRevision: retrySave.value.cloudRevision,
      };
      this.emitSyncCompleted(output, { accountId: input.accountId, traceId: input.traceId });
      return ok(output);
    }

    if (!this.isLocalRevisionDirty(latestRecord)) {
      const retrySave = await this.saveSyncedCloudRevision(
        input.storeContext,
        latestRecord,
        input.cloudRevision,
        input.accountId,
      );
      if (!retrySave.ok) {
        this.emitSyncFailed(retrySave.error, { accountId: input.accountId, traceId: input.traceId });
        return fail(retrySave.error);
      }

      this.notifySnapshotChanged(retrySave.value);
      const output: SyncCloudSnapshotOutput = {
        status: "completed",
        record: retrySave.value,
        cloudRevision: retrySave.value.cloudRevision,
      };
      this.emitSyncCompleted(output, { accountId: input.accountId, traceId: input.traceId });
      return ok(output);
    }

    return this.pushLocalRecordToCloud({
      storeContext: input.storeContext,
      record: createProfileRecord({
        ...latestRecord,
        accountId: latestRecord.accountId ?? input.accountId,
        cloudRevision: input.cloudRevision,
      }),
      session: input.session,
      accountId: input.accountId,
      traceId: input.traceId,
    });
  }

  private async pullCloudSnapshot(
    session: AccountSession,
    traceId: string | undefined,
  ): Promise<Result<ProfileCloudSnapshotPullResult, SdkError>> {
    if (this.destroyed) {
      return fail(this.createDestroyedProfileError("Destroyed profile service cannot pull cloud snapshots.", {
        accountId: session.accountId,
        traceId,
      }));
    }

    try {
      const result = await this.cloudSnapshotPort?.pullSnapshot({
        accountId: session.accountId,
        accessToken: session.accessToken,
        ...(traceId === undefined ? {} : { traceId }),
      });
      if (result === undefined) {
        return fail(new SdkError("profile.cloud_unavailable", "Profile cloud snapshot port is not configured.", {
          moduleName: "profile",
          metadata: { accountId: session.accountId, traceId },
        }));
      }
      return normalizeCloudSnapshotPullPortResult(result, session.accountId, traceId);
    } catch (error) {
      return fail(
        SdkError.fromUnknown(
          "profile.cloud_unavailable",
          "Profile cloud snapshot pull failed.",
          error,
          { moduleName: "profile", metadata: { accountId: session.accountId, traceId } },
        ),
      );
    }
  }

  private async pushCloudSnapshot(
    record: PlayerProfileRecord,
    session: AccountSession,
    traceId: string | undefined,
    expectedCloudRevision: string | null = record.cloudRevision,
  ): Promise<Result<ProfileCloudSnapshotPushResult, SdkError>> {
    if (this.destroyed) {
      return fail(this.createDestroyedProfileError("Destroyed profile service cannot push cloud snapshots.", {
        accountId: session.accountId,
        traceId,
      }));
    }

    try {
      const snapshot = createProfileRecord({
        ...record,
        accountId: record.accountId ?? session.accountId,
      });
      const result = await this.cloudSnapshotPort?.pushSnapshot({
        accountId: session.accountId,
        accessToken: session.accessToken,
        expectedCloudRevision,
        snapshot,
        ...(traceId === undefined ? {} : { traceId }),
      });
      if (result === undefined) {
        return fail(new SdkError("profile.cloud_unavailable", "Profile cloud snapshot port is not configured.", {
          moduleName: "profile",
          metadata: { accountId: session.accountId, traceId },
        }));
      }
      return normalizeCloudSnapshotPushPortResult(result, session.accountId, traceId);
    } catch (error) {
      return fail(
        SdkError.fromUnknown(
          "profile.cloud_unavailable",
          "Profile cloud snapshot push failed.",
          error,
          { moduleName: "profile", metadata: { accountId: session.accountId, traceId } },
        ),
      );
    }
  }

  private getStoreContext(): ProfileStoreContext {
    const session = this.options.account?.getSession() ?? null;
    if (session !== null && isNonEmptyString(session.accountId)) {
      return this.getStoreContextForAccount(session.accountId);
    }

    return {
      accountId: null,
      scope: ANONYMOUS_PROFILE_SCOPE,
    };
  }

  private getStoreContextForAccount(accountId: string): ProfileStoreContext {
    return {
      accountId,
      scope: `account:${accountId}`,
    };
  }

  private ensureRecordAccountMatches(
    record: PlayerProfileRecord,
    accountId: string | null,
  ): Result<void, SdkError> {
    const recordAccountId = record.accountId ?? null;
    if (recordAccountId === accountId) {
      return ok(undefined);
    }

    return fail(
      new SdkError(
        "profile.account_mismatch",
        "Profile record belongs to a different account scope.",
        {
          moduleName: "profile",
          metadata: {
            recordAccountId,
            accountId,
          },
        },
      ),
    );
  }

  private ensureRemoteRecordAccountMatches(
    record: PlayerProfileRecord,
    accountId: string,
  ): Result<void, SdkError> {
    const recordAccountId = record.accountId ?? null;
    if (recordAccountId === null || recordAccountId === accountId) {
      return ok(undefined);
    }

    return fail(
      new SdkError(
        "profile.account_mismatch",
        "Remote profile snapshot belongs to a different account.",
        {
          moduleName: "profile",
          metadata: {
            recordAccountId,
            accountId,
          },
        },
      ),
    );
  }

  private bindRecordToAccount(
    record: PlayerProfileRecord,
    accountId: string,
  ): PlayerProfileRecord {
    if (record.accountId === accountId) {
      return record;
    }

    return createProfileRecord({
      ...record,
      accountId,
    });
  }

  private validateRemoteSnapshot(
    snapshot: PlayerProfileRecord,
    cloudRevision: string,
  ): Result<PlayerProfileRecord, SdkError> {
    if (!isNonEmptyString(cloudRevision)) {
      return fail(
        new SdkError("profile.cloud_invalid_snapshot", "Remote profile cloudRevision is invalid.", {
          moduleName: "profile",
          metadata: { cloudRevision },
        }),
      );
    }

    const validation = this.validateLoadedRecord(snapshot);
    if (!validation.ok) {
      return fail(
        new SdkError("profile.cloud_invalid_snapshot", "Remote profile snapshot is invalid.", {
          moduleName: "profile",
          cause: validation.error,
          ...(validation.error.metadata === undefined ? {} : { metadata: validation.error.metadata }),
        }),
      );
    }

    return ok(createProfileRecord({
      ...validation.value.record,
      accountId: validation.value.record.accountId ?? null,
      cloudRevision,
    }));
  }

  private async applyPulledServerSnapshot(input: {
    readonly storeContext: ProfileStoreContext;
    readonly localRecord: PlayerProfileRecord;
    readonly serverRecord: PlayerProfileRecord;
    readonly cloudRevision: string;
    readonly accountId: string;
    readonly traceId?: string | undefined;
  }): Promise<Result<SyncCloudSnapshotOutput, SdkError>> {
    const now = this.now();
    const nextLocalRevision = Math.max(
      input.localRecord.localRevision,
      input.serverRecord.localRevision,
    );
    const nextRecord = createProfileRecord({
      schemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
      accountId: input.serverRecord.accountId ?? input.localRecord.accountId ?? null,
      recordRevision: input.localRecord.recordRevision + 1,
      localRevision: nextLocalRevision,
      cloudRevision: input.cloudRevision,
      modules: input.serverRecord.modules,
      syncCheckpoint: {
        status: "synced",
        lastSyncedLocalRevision: nextLocalRevision,
        updatedAtMs: now,
      },
      commandReceipts: this.pruneReceipts(input.serverRecord.commandReceipts),
      updatedAtMs: now,
    });

    const saveResult = await this.saveRecord(input.storeContext, nextRecord, input.localRecord.recordRevision);
    if (!saveResult.ok) {
      this.emitSyncFailed(saveResult.error, {
        accountId: input.accountId,
        traceId: input.traceId,
      });
      return fail(saveResult.error);
    }

    this.notifySnapshotChanged(saveResult.value);
    const output: SyncCloudSnapshotOutput = {
      status: "completed",
      record: saveResult.value,
      cloudRevision: saveResult.value.cloudRevision,
    };
    this.emitSyncCompleted(output, {
      accountId: input.accountId,
      traceId: input.traceId,
    });
    return ok(output);
  }

  private async saveSyncedCloudRevision(
    storeContext: ProfileStoreContext,
    record: PlayerProfileRecord,
    cloudRevision: string,
    accountId: string | null = record.accountId ?? null,
  ): Promise<Result<PlayerProfileRecord, SdkError>> {
    if (!isNonEmptyString(cloudRevision)) {
      return fail(
        new SdkError("profile.cloud_invalid_snapshot", "Profile cloud revision must be a non-empty string.", {
          moduleName: "profile",
          metadata: { cloudRevision },
        }),
      );
    }

    const now = this.now();
    const nextRecord = createProfileRecord({
      ...record,
      accountId,
      recordRevision: record.recordRevision + 1,
      cloudRevision,
      syncCheckpoint: {
        status: "synced",
        lastSyncedLocalRevision: record.localRevision,
        updatedAtMs: now,
      },
      updatedAtMs: now,
    });
    return this.saveRecord(storeContext, nextRecord, record.recordRevision);
  }

  private async openRevisionConflict(input: {
    readonly storeContext: ProfileStoreContext;
    readonly localRecord: PlayerProfileRecord;
    readonly serverRecord: PlayerProfileRecord;
    readonly cloudRevision: string;
    readonly accountId: string;
    readonly traceId?: string | undefined;
    readonly reason: ProfileConflictSnapshot["reason"];
  }): Promise<Result<SyncCloudSnapshotOutput, SdkError>> {
    const now = this.now();
    const conflictRecord = createProfileRecord({
      ...input.localRecord,
      accountId: input.localRecord.accountId ?? null,
      recordRevision: input.localRecord.recordRevision + 1,
      cloudRevision: input.localRecord.cloudRevision,
      syncCheckpoint: {
        status: "conflict",
        lastSyncedLocalRevision: input.localRecord.syncCheckpoint.lastSyncedLocalRevision,
        conflictReason: input.reason,
        conflictCloudRevision: input.cloudRevision,
        updatedAtMs: now,
      },
      updatedAtMs: now,
    });
    const saveResult = await this.saveRecord(input.storeContext, conflictRecord, input.localRecord.recordRevision);
    if (!saveResult.ok) {
      this.emitSyncFailed(saveResult.error, {
        accountId: input.accountId,
        traceId: input.traceId,
      });
      return fail(saveResult.error);
    }

    this.notifySnapshotChanged(saveResult.value);
    const conflict: ProfileConflictSnapshot = {
      reason: input.reason,
      localRecord: saveResult.value,
      serverRecord: input.serverRecord,
      cloudRevision: input.cloudRevision,
    };
    const output: SyncCloudSnapshotOutput = {
      status: "conflict",
      record: saveResult.value,
      cloudRevision: input.cloudRevision,
      conflict,
    };
    this.emitSyncConflict(conflict, {
      accountId: input.accountId,
      traceId: input.traceId,
    });
    return ok(output);
  }

  private async openInvalidServerSnapshotConflict(input: {
    readonly storeContext: ProfileStoreContext;
    readonly localRecord: PlayerProfileRecord;
    readonly cloudRevision: string;
    readonly accountId: string;
    readonly traceId?: string | undefined;
  }): Promise<Result<PlayerProfileRecord, SdkError>> {
    const now = this.now();
    const conflictRecord = createProfileRecord({
      ...input.localRecord,
      accountId: input.localRecord.accountId ?? null,
      recordRevision: input.localRecord.recordRevision + 1,
      cloudRevision: input.localRecord.cloudRevision,
      syncCheckpoint: {
        status: "conflict",
        lastSyncedLocalRevision: input.localRecord.syncCheckpoint.lastSyncedLocalRevision,
        conflictReason: "invalid_server_snapshot",
        conflictCloudRevision: input.cloudRevision,
        updatedAtMs: now,
      },
      updatedAtMs: now,
    });

    const saveResult = await this.saveRecord(input.storeContext, conflictRecord, input.localRecord.recordRevision);
    if (!saveResult.ok) {
      return fail(saveResult.error);
    }

    this.notifySnapshotChanged(saveResult.value);
    return ok(saveResult.value);
  }

  private async loadOrBootstrapRecord(
    storeContext: ProfileStoreContext,
  ): Promise<Result<PlayerProfileRecord, SdkError>> {
    if (this.localStore === undefined) {
      return fail(
        new SdkError("profile.local_store_unavailable", "Profile local store is not configured.", {
          moduleName: "profile",
        }),
      );
    }

    const loadResult = await this.loadRecord(storeContext);
    if (!loadResult.ok) {
      return fail(loadResult.error);
    }

    const loaded = loadResult.value;
    if (loaded === null) {
      return this.bootstrapRecord(storeContext, null);
    }

    const loadedSchemaVersion = readFiniteIntegerProperty(loaded, "schemaVersion");
    if (loadedSchemaVersion !== CURRENT_PROFILE_SCHEMA_VERSION) {
      return this.bootstrapRecord(storeContext, readRecordRevision(loaded));
    }

    const validation = this.validateLoadedRecord(loaded);
    if (!validation.ok) {
      return fail(validation.error);
    }

    const guardResult = this.ensureRecordAccountMatches(validation.value.record, storeContext.accountId);
    if (!guardResult.ok) {
      return fail(guardResult.error);
    }

    return ok(validation.value.record);
  }

  private async loadRecord(
    storeContext: ProfileStoreContext,
  ): Promise<Result<PlayerProfileRecord | null, SdkError>> {
    try {
      return await this.localStore?.load({ scope: storeContext.scope }) ?? ok(null);
    } catch (error) {
      return fail(
        SdkError.fromUnknown(
          "profile.local_store_unavailable",
          "Profile local store load failed.",
          error,
          { moduleName: "profile" },
        ),
      );
    }
  }

  private async saveRecord(
    storeContext: ProfileStoreContext,
    record: PlayerProfileRecord,
    expectedRecordRevision: number | null,
  ): Promise<Result<PlayerProfileRecord, SdkError>> {
    if (this.destroyed) {
      return fail(this.createDestroyedProfileError("Destroyed profile service cannot write local records.", {
        scope: storeContext.scope,
      }));
    }

    const guardResult = this.ensureRecordAccountMatches(record, storeContext.accountId);
    if (!guardResult.ok) {
      return fail(guardResult.error);
    }

    try {
      const result = await this.localStore?.save({
        scope: storeContext.scope,
        expectedRecordRevision,
        record,
      });
      return result ?? fail(new SdkError("profile.local_store_unavailable", "Profile local store is not configured.", {
        moduleName: "profile",
      }));
    } catch (error) {
      return fail(
        SdkError.fromUnknown(
          "profile.local_store_unavailable",
          "Profile local store save failed.",
          error,
          { moduleName: "profile", metadata: { expectedRecordRevision } },
        ),
      );
    }
  }

  private async bootstrapRecord(
    storeContext: ProfileStoreContext,
    expectedRecordRevision: number | null,
  ): Promise<Result<PlayerProfileRecord, SdkError>> {
    const now = this.now();
    const recordRevision = expectedRecordRevision === null ? 0 : expectedRecordRevision + 1;
    const foundationData = cloneProfileJsonObject({
      sdkProfileSchemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
    });
    const foundationModule: ProfileModuleEnvelope = {
      moduleId: FOUNDATION_PROFILE_MODULE_ID,
      moduleVersion: CURRENT_PROFILE_SCHEMA_VERSION,
      moduleRevision: 1,
      owner: "foundation",
      data: foundationData,
      updatedAtMs: now,
    };
    const record = createProfileRecord({
      schemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
      accountId: storeContext.accountId,
      recordRevision,
      localRevision: 0,
      cloudRevision: null,
      modules: withRecordEntry(emptyRecord<ProfileModuleEnvelope>(), foundationModule.moduleId, foundationModule),
      syncCheckpoint: {
        status: this.cloudSnapshotConfigured ? "dirty" : "local_only",
        lastSyncedLocalRevision: null,
        updatedAtMs: now,
      },
      commandReceipts: emptyRecord(),
      updatedAtMs: now,
    });

    const saveResult = await this.saveRecord(storeContext, record, expectedRecordRevision);
    if (!saveResult.ok) {
      if (saveResult.error.code === "profile.local_revision_conflict") {
        const reloadResult = await this.loadRecord(storeContext);
        if (!reloadResult.ok) {
          return reloadResult;
        }
        if (reloadResult.value !== null) {
          const validation = this.validateLoadedRecord(reloadResult.value);
          if (!validation.ok) {
            return validation;
          }
          const guardResult = this.ensureRecordAccountMatches(validation.value.record, storeContext.accountId);
          if (!guardResult.ok) {
            return fail(guardResult.error);
          }
          return ok(validation.value.record);
        }
      }
      return saveResult;
    }

    this.notifySnapshotChanged(saveResult.value);
    return saveResult;
  }

  private validateSaveInput<TData extends ProfileJsonObject>(
    input: SaveProfileModuleInput<TData>,
  ): Result<ValidatedSaveInput<TData>, SdkError> {
    const commandKey = validatePublicProfileCommandKey(input.commandKey);
    if (!commandKey.ok) {
      return fail(commandKey.error);
    }

    if (!isValidModuleId(input.moduleId)) {
      return fail(
        new SdkError("profile.module_invalid", "Profile moduleId must be a non-empty string.", {
          moduleName: "profile",
          metadata: { moduleId: input.moduleId },
        }),
      );
    }

    if (!isPositiveInteger(input.moduleVersion)) {
      return fail(
        new SdkError("profile.module_invalid", "Profile moduleVersion must be a positive integer.", {
          moduleName: "profile",
          metadata: { moduleId: input.moduleId, moduleVersion: input.moduleVersion },
        }),
      );
    }

    if (
      input.expectedModuleRevision !== null &&
      !isNonNegativeInteger(input.expectedModuleRevision)
    ) {
      return fail(
        new SdkError(
          "profile.module_revision_conflict",
          "Profile expectedModuleRevision must be null or a non-negative integer.",
          {
            moduleName: "profile",
            metadata: {
              moduleId: input.moduleId,
              expectedModuleRevision: input.expectedModuleRevision,
            },
          },
        ),
      );
    }

    if (!isGameOwner(input.owner)) {
      return fail(
        new SdkError(
          "profile.module_owner_forbidden",
          "Public profile saveModule can only write game-owned modules.",
          { moduleName: "profile", metadata: { moduleId: input.moduleId, owner: input.owner } },
        ),
      );
    }

    const dataResult = validateAndCloneProfileJsonObject(input.data, {
      moduleId: input.moduleId,
      owner: input.owner,
    });
    if (!dataResult.ok) {
      return fail(dataResult.error);
    }

    const commandPayload: ProfileJsonObject = {
      commandType: SAVE_MODULE_COMMAND_TYPE,
      input: {
        commandKey: commandKey.value,
        moduleId: input.moduleId,
        moduleVersion: input.moduleVersion,
        expectedModuleRevision: input.expectedModuleRevision,
        owner: input.owner,
        data: dataResult.value,
      },
    };

    return ok({
      commandType: SAVE_MODULE_COMMAND_TYPE,
      commandKey: commandKey.value,
      moduleId: input.moduleId,
      moduleVersion: input.moduleVersion,
      expectedModuleRevision: input.expectedModuleRevision,
      owner: input.owner,
      data: dataResult.value as TData,
      payloadHash: hashProfileJson(commandPayload),
    });
  }

  private validateSdkOwnedSaveInput<TData extends ProfileJsonObject>(
    input: SaveProfileSdkOwnedModuleInput<TData>,
    exactOwner: `sdk:${string}`,
  ): Result<ValidatedSaveInput<TData>, SdkError> {
    const commandKey = validateProfileCommandKey(input.commandKey, PROFILE_INTERNAL_COMMAND_KEY_MAX_LENGTH);
    if (!commandKey.ok) {
      return fail(commandKey.error);
    }

    if (!isNonEmptyString(input.commandType)) {
      return fail(
        new SdkError("profile.command_failed", "Profile commandType must be a non-empty string.", {
          moduleName: "profile",
          metadata: { commandKey: input.commandKey },
        }),
      );
    }

    if (!isValidModuleId(input.moduleId)) {
      return fail(
        new SdkError("profile.module_invalid", "Profile moduleId must be a non-empty string.", {
          moduleName: "profile",
          metadata: { moduleId: input.moduleId },
        }),
      );
    }

    if (!isPositiveInteger(input.moduleVersion)) {
      return fail(
        new SdkError("profile.module_invalid", "Profile moduleVersion must be a positive integer.", {
          moduleName: "profile",
          metadata: { moduleId: input.moduleId, moduleVersion: input.moduleVersion },
        }),
      );
    }

    if (
      input.expectedModuleRevision !== null &&
      !isNonNegativeInteger(input.expectedModuleRevision)
    ) {
      return fail(
        new SdkError(
          "profile.module_revision_conflict",
          "Profile expectedModuleRevision must be null or a non-negative integer.",
          {
            moduleName: "profile",
            metadata: {
              moduleId: input.moduleId,
              expectedModuleRevision: input.expectedModuleRevision,
            },
          },
        ),
      );
    }

    if (input.owner !== exactOwner) {
      return fail(
        new SdkError(
          "profile.module_owner_forbidden",
          "Profile SDK-owned writer can only write its exact owner namespace.",
          {
            moduleName: "profile",
            metadata: { moduleId: input.moduleId, owner: input.owner, expectedOwner: exactOwner },
          },
        ),
      );
    }

    const dataResult = validateAndCloneProfileJsonObject(input.data, {
      moduleId: input.moduleId,
      owner: input.owner,
    });
    if (!dataResult.ok) {
      return fail(dataResult.error);
    }

    const commandPayload: ProfileJsonObject = {
      commandType: input.commandType,
      input: {
        commandKey: commandKey.value,
        moduleId: input.moduleId,
        moduleVersion: input.moduleVersion,
        expectedModuleRevision: input.expectedModuleRevision,
        owner: input.owner,
        data: dataResult.value,
      },
    };

    return ok({
      commandType: input.commandType,
      commandKey: commandKey.value,
      moduleId: input.moduleId,
      moduleVersion: input.moduleVersion,
      expectedModuleRevision: input.expectedModuleRevision,
      owner: input.owner,
      data: dataResult.value as TData,
      payloadHash: hashProfileJson(commandPayload),
    });
  }

  private validateReadModuleInput<TData extends ProfileJsonObject>(
    input: ReadProfileModuleInput<TData>,
  ): Result<ValidatedReadModuleInput<TData>, SdkError> {
    const base = this.validateProfileModuleReference(input);
    if (!base.ok) {
      return fail(base.error);
    }

    const missing = input.missing ?? "return_null";
    if (missing !== "return_null" && missing !== "fail") {
      return fail(
        new SdkError("profile.module_invalid", "Profile module missing strategy is invalid.", {
          moduleName: "profile",
          metadata: { moduleId: input.moduleId, missing },
        }),
      );
    }

    if (input.normalize !== undefined && typeof input.normalize !== "function") {
      return fail(
        new SdkError("profile.module_invalid", "Profile module normalize must be a function.", {
          moduleName: "profile",
          metadata: { moduleId: input.moduleId },
        }),
      );
    }

    return ok({
      moduleId: base.value.moduleId,
      moduleVersion: base.value.moduleVersion,
      owner: base.value.owner,
      missing,
      normalize: input.normalize ?? identityProfileModuleNormalizer<TData>,
    });
  }

  private validateUpdateModuleInput<
    TData extends ProfileJsonObject,
    TMeta,
  >(
    input: UpdateProfileModuleInput<TData, TMeta>,
  ): Result<ValidatedUpdateModuleInput<TData, TMeta>, SdkError> {
    const commandKey = validatePublicProfileCommandKey(input.commandKey);
    if (!commandKey.ok) {
      return fail(commandKey.error);
    }

    const base = this.validateProfileModuleReference(input);
    if (!base.ok) {
      return fail(base.error);
    }

    if (!isGameOwner(base.value.owner)) {
      return fail(
        new SdkError(
          "profile.module_owner_forbidden",
          "Public profile updateModule can only write game-owned modules.",
          { moduleName: "profile", metadata: { moduleId: input.moduleId, owner: input.owner } },
        ),
      );
    }

    if (input.createDefault !== undefined && typeof input.createDefault !== "function") {
      return fail(
        new SdkError("profile.module_invalid", "Profile module createDefault must be a function.", {
          moduleName: "profile",
          metadata: { moduleId: input.moduleId },
        }),
      );
    }

    if (input.normalize !== undefined && typeof input.normalize !== "function") {
      return fail(
        new SdkError("profile.module_invalid", "Profile module normalize must be a function.", {
          moduleName: "profile",
          metadata: { moduleId: input.moduleId },
        }),
      );
    }

    if (typeof input.update !== "function") {
      return fail(
        new SdkError("profile.command_failed", "Profile module update must be a function.", {
          moduleName: "profile",
          metadata: { moduleId: input.moduleId, commandKey: input.commandKey },
        }),
      );
    }

    const commandPayload = validateAndCloneProfileJsonObject(input.commandPayload, {
      moduleId: input.moduleId,
      owner: input.owner,
      commandKey: commandKey.value,
      field: "commandPayload",
    });
    if (!commandPayload.ok) {
      return fail(commandPayload.error);
    }

    const payloadIdentity: ProfileJsonObject = {
      commandType: UPDATE_MODULE_COMMAND_TYPE,
      moduleId: base.value.moduleId,
      moduleVersion: base.value.moduleVersion,
      owner: base.value.owner,
      commandPayload: commandPayload.value,
    };

    return ok({
      commandType: UPDATE_MODULE_COMMAND_TYPE,
      commandKey: commandKey.value,
      commandPayload: commandPayload.value,
      moduleId: base.value.moduleId,
      moduleVersion: base.value.moduleVersion,
      owner: base.value.owner,
      ...(input.createDefault === undefined ? {} : { createDefault: input.createDefault }),
      normalize: input.normalize ?? identityProfileModuleNormalizer<TData>,
      update: input.update,
      payloadHash: hashProfileJson(payloadIdentity),
    });
  }

  private validateProfileModuleReference(input: {
    readonly moduleId: string;
    readonly moduleVersion: number;
    readonly owner: ProfileModuleOwner;
  }): Result<{
    readonly moduleId: string;
    readonly moduleVersion: number;
    readonly owner: ProfileModuleOwner;
  }, SdkError> {
    if (!isValidModuleId(input.moduleId)) {
      return fail(
        new SdkError("profile.module_invalid", "Profile moduleId must be a non-empty string.", {
          moduleName: "profile",
          metadata: { moduleId: input.moduleId },
        }),
      );
    }

    if (!isPositiveInteger(input.moduleVersion)) {
      return fail(
        new SdkError("profile.module_invalid", "Profile moduleVersion must be a positive integer.", {
          moduleName: "profile",
          metadata: { moduleId: input.moduleId, moduleVersion: input.moduleVersion },
        }),
      );
    }

    if (!isValidOwner(input.owner)) {
      return fail(
        new SdkError("profile.module_owner_forbidden", "Profile module owner is invalid.", {
          moduleName: "profile",
          metadata: { moduleId: input.moduleId, owner: input.owner },
        }),
      );
    }

    return ok({
      moduleId: input.moduleId,
      moduleVersion: input.moduleVersion,
      owner: input.owner,
    });
  }

  private readModuleFromRecord<TData extends ProfileJsonObject>(
    record: PlayerProfileRecord,
    input: ValidatedReadModuleInput<TData>,
  ): Result<ReadProfileModuleOutput<TData>, SdkError> {
    const current = readOwn(record.modules, input.moduleId);
    if (current === undefined) {
      return this.createReadModuleMissingOutput(record, input);
    }

    const moduleCheck = this.validateProfileModuleMatch(current, input);
    if (!moduleCheck.ok) {
      return fail(moduleCheck.error);
    }

    const normalized = this.normalizeProfileModuleData(current.data, input, true, "apply");
    if (!normalized.ok) {
      return fail(normalized.error);
    }

    return ok({
      kind: "found",
      record,
      module: {
        ...current,
        data: normalized.value,
      },
      data: normalized.value,
    });
  }

  private createReadModuleMissingOutput<TData extends ProfileJsonObject>(
    record: PlayerProfileRecord | null,
    input: ValidatedReadModuleInput<TData>,
  ): Result<ReadProfileModuleOutput<TData>, SdkError> {
    if (input.missing === "fail") {
      return fail(
        new SdkError("profile.module_missing", "Profile module does not exist.", {
          moduleName: "profile",
          metadata: { moduleId: input.moduleId },
        }),
      );
    }

    return ok({
      kind: "missing",
      record,
      moduleId: input.moduleId,
      module: null,
      data: null,
    });
  }

  private validateProfileModuleMatch(inputModule: ProfileModuleEnvelope, expected: {
    readonly moduleId: string;
    readonly moduleVersion: number;
    readonly owner: ProfileModuleOwner;
  }): Result<void, SdkError> {
    if (inputModule.owner !== expected.owner) {
      return fail(
        new SdkError(
          "profile.module_owner_forbidden",
          "Profile module is owned by a different namespace.",
          {
            moduleName: "profile",
            metadata: {
              moduleId: expected.moduleId,
              owner: inputModule.owner,
              requestedOwner: expected.owner,
            },
          },
        ),
      );
    }

    if (inputModule.moduleVersion !== expected.moduleVersion) {
      return fail(
        new SdkError(
          "profile.module_version_mismatch",
          "Profile moduleVersion does not match the requested version.",
          {
            moduleName: "profile",
            metadata: {
              moduleId: expected.moduleId,
              moduleVersion: inputModule.moduleVersion,
              requestedModuleVersion: expected.moduleVersion,
            },
          },
        ),
      );
    }

    return ok(undefined);
  }

  private createDefaultProfileModuleData<TData extends ProfileJsonObject, TMeta>(
    input: ValidatedUpdateModuleInput<TData, TMeta>,
  ): Result<ProfileJsonObject, SdkError> {
    if (input.createDefault === undefined) {
      return fail(
        new SdkError("profile.module_missing", "Profile module does not exist.", {
          moduleName: "profile",
          metadata: { moduleId: input.moduleId },
        }),
      );
    }

    let data: TData;
    try {
      data = input.createDefault({
        moduleId: input.moduleId,
        moduleVersion: input.moduleVersion,
        owner: input.owner,
        nowMs: this.now(),
      });
    } catch (error) {
      return fail(
        SdkError.fromUnknown(
          "profile.module_invalid",
          "Profile module createDefault failed.",
          error,
          { moduleName: "profile", metadata: { moduleId: input.moduleId } },
        ),
      );
    }

    return validateAndCloneProfileJsonObject(data, {
      moduleId: input.moduleId,
      owner: input.owner,
      phase: "createDefault",
    });
  }

  private normalizeProfileModuleData<TData extends ProfileJsonObject>(
    data: ProfileJsonObject,
    input: {
      readonly moduleId: string;
      readonly moduleVersion: number;
      readonly owner: ProfileModuleOwner;
      readonly normalize: ProfileModuleNormalizer<TData>;
    },
    exists: boolean,
    mode: "apply" | "replay",
  ): Result<TData, SdkError> {
    let normalized: Result<TData, SdkError>;
    try {
      normalized = input.normalize({
        moduleId: input.moduleId,
        moduleVersion: input.moduleVersion,
        owner: input.owner,
        data,
        exists,
        nowMs: this.now(),
      });
    } catch (error) {
      return fail(
        SdkError.fromUnknown(
          "profile.module_invalid",
          "Profile module normalize failed.",
          error,
          { moduleName: "profile", metadata: { moduleId: input.moduleId, mode } },
        ),
      );
    }

    if (!normalized.ok) {
      return fail(normalized.error);
    }

    const dataResult = validateAndCloneProfileJsonObject(normalized.value, {
      moduleId: input.moduleId,
      owner: input.owner,
      phase: "normalize",
    });
    if (!dataResult.ok) {
      return fail(dataResult.error);
    }

    return ok(dataResult.value as TData);
  }

  private runUpdateModuleHandler<TData extends ProfileJsonObject, TMeta>(
    input: ValidatedUpdateModuleInput<TData, TMeta>,
    context: {
      readonly data: TData;
      readonly exists: boolean;
      readonly mode: "apply" | "replay";
    },
  ): Result<UpdateProfileModuleDecision<TData, TMeta>, SdkError> {
    let output: ReturnType<UpdateProfileModuleInput<TData, TMeta>["update"]>;
    try {
      output = input.update({
        moduleId: input.moduleId,
        moduleVersion: input.moduleVersion,
        owner: input.owner,
        data: context.data,
        exists: context.exists,
        nowMs: this.now(),
        mode: context.mode,
      });
    } catch (error) {
      return fail(
        SdkError.fromUnknown(
          "profile.command_failed",
          "Profile module update failed.",
          error,
          {
            moduleName: "profile",
            metadata: { moduleId: input.moduleId, commandKey: input.commandKey, mode: context.mode },
          },
        ),
      );
    }

    const decision = isResult(output) ? output : ok(output);
    if (!decision.ok) {
      return fail(decision.error);
    }

    if (decision.value.kind !== "noop" && decision.value.kind !== "update") {
      return fail(
        new SdkError("profile.command_failed", "Profile module update returned an invalid decision.", {
          moduleName: "profile",
          metadata: {
            moduleId: input.moduleId,
            commandKey: input.commandKey,
            kind: (decision.value as { readonly kind?: unknown }).kind,
          },
        }),
      );
    }

    return ok(decision.value);
  }

  private validateModuleData(input: {
    readonly moduleId: string;
    readonly moduleVersion: number;
    readonly owner: ProfileModuleOwner;
    readonly data: ProfileJsonObject;
  }): Result<ProfileJsonObject, SdkError> {
    let data = input.data;
    for (const validator of this.validators) {
      let result: Result<ProfileJsonObject, SdkError>;
      try {
        result = validator({
          moduleId: input.moduleId,
          moduleVersion: input.moduleVersion,
          owner: input.owner,
          data,
        });
      } catch (error) {
        return fail(
          SdkError.fromUnknown(
            "profile.module_invalid",
            "Profile module validator failed.",
            error,
            { moduleName: "profile", metadata: { moduleId: input.moduleId } },
          ),
        );
      }

      if (!result.ok) {
        return fail(result.error);
      }

      const stableResult = validateAndCloneProfileJsonObject(result.value, {
        moduleId: input.moduleId,
        owner: input.owner,
      });
      if (!stableResult.ok) {
        return fail(stableResult.error);
      }
      data = stableResult.value;
    }

    return ok(data);
  }

  private validateLoadedRecord(record: PlayerProfileRecord): Result<LoadedRecordValidation, SdkError> {
    if (!isPlainRecord(record)) {
      return fail(this.createInvalidRecordError("Profile record must be an object."));
    }

    if (record.schemaVersion !== CURRENT_PROFILE_SCHEMA_VERSION) {
      return fail(this.createInvalidRecordError("Profile record schemaVersion is incompatible."));
    }

    if (!isNonNegativeInteger(record.recordRevision)) {
      return fail(this.createInvalidRecordError("Profile recordRevision must be a non-negative integer."));
    }

    if (!isNonNegativeInteger(record.localRevision)) {
      return fail(this.createInvalidRecordError("Profile localRevision must be a non-negative integer."));
    }

    if (record.cloudRevision !== null && typeof record.cloudRevision !== "string") {
      return fail(this.createInvalidRecordError("Profile cloudRevision must be a string or null."));
    }

    const accountIdResult = readAccountId(record);
    if (!accountIdResult.ok) {
      return fail(this.createInvalidRecordError("Profile accountId must be a non-empty string or null."));
    }
    const accountId = accountIdResult.value;

    const modulesResult = this.validateLoadedModules(record.modules);
    if (!modulesResult.ok) {
      return fail(modulesResult.error);
    }

    const checkpointResult = validateSyncCheckpoint(record.syncCheckpoint);
    if (!checkpointResult.ok) {
      return fail(checkpointResult.error);
    }

    const receiptsResult = validateCommandReceipts(
      record.commandReceipts,
    );
    if (!receiptsResult.ok) {
      return fail(receiptsResult.error);
    }

    if (!isFiniteTimestamp(record.updatedAtMs)) {
      return fail(this.createInvalidRecordError("Profile updatedAtMs must be a finite number."));
    }

    return ok({
      record: createProfileRecord({
        schemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
        accountId,
        recordRevision: record.recordRevision,
        localRevision: record.localRevision,
        cloudRevision: record.cloudRevision,
        modules: modulesResult.value,
        syncCheckpoint: checkpointResult.value,
        commandReceipts: receiptsResult.value,
        updatedAtMs: record.updatedAtMs,
      }),
    });
  }

  private validateLoadedModules(
    modules: Readonly<Record<string, ProfileModuleEnvelope>>,
  ): Result<Readonly<Record<string, ProfileModuleEnvelope>>, SdkError> {
    if (!isPlainRecord(modules)) {
      return fail(this.createInvalidRecordError("Profile modules must be an object."));
    }

    const output = emptyRecord<ProfileModuleEnvelope>();
    for (const moduleId of Object.keys(modules).sort()) {
      const module = readOwn(modules, moduleId);
      if (module === undefined || !isPlainRecord(module)) {
        return fail(this.createInvalidRecordError("Profile module envelope must be an object.", { moduleId }));
      }

      if (module.moduleId !== moduleId || !isValidModuleId(module.moduleId)) {
        return fail(this.createInvalidRecordError("Profile moduleId is invalid.", { moduleId }));
      }

      if (!isPositiveInteger(module.moduleVersion)) {
        return fail(
          this.createInvalidRecordError("Profile moduleVersion must be a positive integer.", {
            moduleId,
            moduleVersion: module.moduleVersion,
          }),
        );
      }

      if (!isPositiveInteger(module.moduleRevision)) {
        return fail(
          this.createInvalidRecordError("Profile moduleRevision must be a positive integer.", {
            moduleId,
            moduleRevision: module.moduleRevision,
          }),
        );
      }

      if (!isValidOwner(module.owner)) {
        return fail(
          this.createInvalidRecordError("Profile module owner is invalid.", {
            moduleId,
            owner: module.owner,
          }),
        );
      }

      if (!isFiniteTimestamp(module.updatedAtMs)) {
        return fail(
          this.createInvalidRecordError("Profile module updatedAtMs must be a finite number.", {
            moduleId,
            updatedAtMs: module.updatedAtMs,
          }),
        );
      }

      const dataResult = validateAndCloneProfileJsonObject(module.data, {
        moduleId,
        owner: module.owner,
      });
      if (!dataResult.ok) {
        return fail(dataResult.error);
      }

      const validatedData =
        isGameOwner(module.owner)
          ? this.validateModuleData({
              moduleId: module.moduleId,
              moduleVersion: module.moduleVersion,
              owner: module.owner,
              data: dataResult.value,
            })
          : ok(dataResult.value);
      if (!validatedData.ok) {
        return fail(validatedData.error);
      }

      Object.defineProperty(output, moduleId, {
        value: {
          moduleId: module.moduleId,
          moduleVersion: module.moduleVersion,
          moduleRevision: module.moduleRevision,
          owner: module.owner,
          data: validatedData.value,
          updatedAtMs: module.updatedAtMs,
        },
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }

    return ok(output);
  }

  private createUpdatedModule<TData extends ProfileJsonObject>(
    record: PlayerProfileRecord,
    input: ValidatedSaveInput<TData>,
  ): Result<ProfileModuleEnvelope<TData>, SdkError> {
    const current = readOwn(record.modules, input.moduleId);

    if (current !== undefined && current.owner !== input.owner) {
      return fail(
        new SdkError(
          "profile.module_owner_forbidden",
          "Profile module is owned by a different namespace.",
          {
            moduleName: "profile",
            metadata: { moduleId: input.moduleId, owner: current.owner, requestedOwner: input.owner },
          },
        ),
      );
    }

    if (current === undefined && input.expectedModuleRevision !== null) {
      return fail(
        new SdkError("profile.module_revision_conflict", "Profile module does not exist.", {
          moduleName: "profile",
          metadata: {
            moduleId: input.moduleId,
            expectedModuleRevision: input.expectedModuleRevision,
            currentModuleRevision: null,
          },
        }),
      );
    }

    if (current !== undefined && current.moduleRevision !== input.expectedModuleRevision) {
      return fail(
        new SdkError("profile.module_revision_conflict", "Profile module revision conflict.", {
          moduleName: "profile",
          metadata: {
            moduleId: input.moduleId,
            expectedModuleRevision: input.expectedModuleRevision,
            currentModuleRevision: current.moduleRevision,
          },
        }),
      );
    }

    return ok({
      moduleId: input.moduleId,
      moduleVersion: input.moduleVersion,
      moduleRevision: current === undefined ? 1 : current.moduleRevision + 1,
      owner: input.owner,
      data: input.data,
      updatedAtMs: this.now(),
    });
  }

  private createDirtyCheckpoint(
    checkpoint: ProfileSyncCheckpoint,
    updatedAtMs: number,
  ): ProfileSyncCheckpoint {
    return {
      status: this.cloudSnapshotConfigured ? "dirty" : "local_only",
      lastSyncedLocalRevision: checkpoint.lastSyncedLocalRevision,
      updatedAtMs,
    };
  }

  private isLocalRevisionDirty(record: PlayerProfileRecord): boolean {
    const lastSyncedLocalRevision = record.syncCheckpoint.lastSyncedLocalRevision;
    return lastSyncedLocalRevision === null
      ? record.localRevision > 0
      : record.localRevision > lastSyncedLocalRevision;
  }

  private pruneReceipts<TReceipt extends { readonly commandKey: string; readonly createdAtMs: number; readonly appliedLocalRevision: number }>(
    receipts: Readonly<Record<string, TReceipt>>,
  ): Readonly<Record<string, TReceipt>> {
    const entries = Object.entries(receipts);
    if (entries.length <= this.commandReceiptRetentionLimit) {
      return receipts;
    }

    const keep = new Set(
      entries
        .sort((left, right) => {
          const leftReceipt = left[1];
          const rightReceipt = right[1];
          if (leftReceipt.createdAtMs !== rightReceipt.createdAtMs) {
            return rightReceipt.createdAtMs - leftReceipt.createdAtMs;
          }
          if (leftReceipt.appliedLocalRevision !== rightReceipt.appliedLocalRevision) {
            return rightReceipt.appliedLocalRevision - leftReceipt.appliedLocalRevision;
          }
          return left[0].localeCompare(right[0]);
        })
        .slice(0, this.commandReceiptRetentionLimit)
        .map(([commandKey]) => commandKey),
    );

    const output = emptyRecord<TReceipt>();
    for (const [commandKey, receipt] of entries) {
      if (keep.has(commandKey)) {
        Object.defineProperty(output, commandKey, {
          value: receipt,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
    }
    return output;
  }

  private createSnapshot(record: PlayerProfileRecord | null): ProfileRuntimeSnapshot {
    return {
      record,
      status: record?.syncCheckpoint.status ?? "unavailable",
      enabled: this.enabled && !this.destroyed,
      localStoreConfigured: this.localStore !== undefined,
      cloudSnapshotConfigured: this.cloudSnapshotConfigured,
      commandReceiptRetentionLimit: this.commandReceiptRetentionLimit,
      generatedAtMs: this.now(),
    };
  }

  private notifySnapshotChanged(record: PlayerProfileRecord): void {
    const snapshot = this.createSnapshot(record);
    const listeners: ProfileSnapshotChangedListener[] = [];
    this.listeners.forEach((listener) => {
      listeners.push(listener);
    });

    for (const listener of listeners) {
      try {
        listener({ snapshot });
      } catch (error) {
        this.options.context.logger.warn("Profile snapshot listener failed.", { error });
      }
    }
  }

  private emitModuleSaved(
    record: PlayerProfileRecord,
    module: ProfileModuleEnvelope,
    commandKey: string,
    result: "applied",
  ): void {
    this.events.moduleSaved(record, module, commandKey, result);
  }

  private emitSyncStarted(session: AccountSession, traceId: string | undefined): void {
    this.events.syncStarted(session, traceId);
  }

  private emitSyncCompleted(
    output: SyncCloudSnapshotOutput,
    context: ProfileSyncEventContext,
  ): void {
    this.events.syncCompleted(output, context);
  }

  private emitSyncFailed(
    error: SdkError,
    context: ProfileSyncEventContext,
  ): void {
    this.events.syncFailed(error, context);
  }

  private emitSyncConflict(
    conflict: ProfileConflictSnapshot,
    context: ProfileSyncEventContext,
  ): void {
    this.events.syncConflict(conflict, context);
  }

  private emitSyncResolved(
    record: PlayerProfileRecord,
    strategy: ProfileConflictResolutionStrategy,
    context: ProfileSyncEventContext,
  ): void {
    this.events.syncResolved(record, strategy, context);
  }

  private failCommand<TValue>(
    commandType: string,
    commandKey: string | undefined,
    error: SdkError,
  ): Result<TValue, SdkError> {
    this.events.commandFailed(commandType, commandKey, error);
    return fail(error);
  }

  private failConflictResolution<TValue>(
    commandType: string,
    commandKey: string | undefined,
    error: SdkError,
    context: ProfileSyncEventContext,
  ): Result<TValue, SdkError> {
    this.emitSyncFailed(error, context);
    return this.failCommand(commandType, commandKey, error);
  }

  private createSkippedSyncOutput(
    skippedReason: ProfileCloudSyncSkippedReason,
    record: PlayerProfileRecord | null,
  ): SyncCloudSnapshotOutput {
    return {
      status: "skipped",
      record,
      cloudRevision: record?.cloudRevision ?? null,
      skippedReason,
    };
  }

  private createInvalidRecordError(
    message: string,
    metadata: Readonly<Record<string, unknown>> = {},
  ): SdkError {
    return new SdkError("profile.module_invalid", message, {
      moduleName: "profile",
      metadata,
    });
  }

  private now(): number {
    return this.options.context.clock.now();
  }
}

function identityProfileModuleNormalizer<TData extends ProfileJsonObject>(
  input: ProfileModuleNormalizeInput,
): Result<TData, SdkError> {
  return ok(input.data as TData);
}

function isResult<TValue>(
  value: TValue | Result<TValue, SdkError>,
): value is Result<TValue, SdkError> {
  return isPlainRecord(value) && typeof value["ok"] === "boolean";
}

function createPreparedUpdateModuleMutation<
  TData extends ProfileJsonObject,
  TMeta,
>(input: {
  readonly module: ProfileModuleEnvelope<TData>;
  readonly meta?: TMeta | undefined;
}): PreparedUpdateModuleMutation<TData, TMeta> {
  return {
    kind: "update",
    module: input.module,
    ...(input.meta === undefined ? {} : { meta: input.meta }),
  };
}

function createUpdateModuleAppliedOutput<
  TData extends ProfileJsonObject,
  TMeta,
>(input: {
  readonly record: PlayerProfileRecord;
  readonly module: ProfileModuleEnvelope<TData>;
  readonly receipt: ProfileCommandReceipt;
  readonly meta?: TMeta | undefined;
}): UpdateProfileModuleOutput<TData, TMeta> {
  return {
    kind: "applied",
    record: input.record,
    module: input.module,
    data: input.module.data,
    receipt: input.receipt,
    ...(input.meta === undefined ? {} : { meta: input.meta }),
  };
}

function createUpdateModuleReplayedOutput<
  TData extends ProfileJsonObject,
  TMeta,
>(input: {
  readonly record: PlayerProfileRecord;
  readonly module: ProfileModuleEnvelope<TData>;
  readonly data: TData;
  readonly receipt: ProfileCommandReceipt;
  readonly meta?: TMeta | undefined;
}): UpdateProfileModuleOutput<TData, TMeta> {
  return {
    kind: "replayed",
    record: input.record,
    moduleId: input.module.moduleId,
    module: input.module,
    data: input.data,
    receipt: input.receipt,
    ...(input.meta === undefined ? {} : { meta: input.meta }),
  };
}

function createUpdateModuleNoopOutput<
  TData extends ProfileJsonObject,
  TMeta,
>(input: {
  readonly record: PlayerProfileRecord;
  readonly module: ProfileModuleEnvelope<TData> | null;
  readonly data: TData;
  readonly meta?: TMeta | undefined;
}): UpdateProfileModuleOutput<TData, TMeta> {
  return {
    kind: "noop",
    record: input.record,
    module: input.module,
    data: input.data,
    ...(input.meta === undefined ? {} : { meta: input.meta }),
  };
}

function validateSyncCheckpoint(
  checkpoint: ProfileSyncCheckpoint,
): Result<ProfileSyncCheckpoint, SdkError> {
  if (!isPlainRecord(checkpoint)) {
    return fail(createInvalidRecordError("Profile syncCheckpoint must be an object."));
  }

  if (!["local_only", "dirty", "synced", "conflict"].includes(checkpoint.status)) {
    return fail(createInvalidRecordError("Profile syncCheckpoint status is invalid."));
  }

  if (
    checkpoint.lastSyncedLocalRevision !== null &&
    !isNonNegativeInteger(checkpoint.lastSyncedLocalRevision)
  ) {
    return fail(createInvalidRecordError("Profile lastSyncedLocalRevision is invalid."));
  }

  if (
    checkpoint.conflictReason !== undefined &&
    !["revision_conflict", "resolver_failed", "invalid_server_snapshot"].includes(
      checkpoint.conflictReason,
    )
  ) {
    return fail(createInvalidRecordError("Profile conflictReason is invalid."));
  }

  if (
    checkpoint.conflictCloudRevision !== undefined &&
    typeof checkpoint.conflictCloudRevision !== "string"
  ) {
    return fail(createInvalidRecordError("Profile conflictCloudRevision is invalid."));
  }

  if (checkpoint.updatedAtMs !== undefined && !isFiniteTimestamp(checkpoint.updatedAtMs)) {
    return fail(createInvalidRecordError("Profile sync checkpoint updatedAtMs is invalid."));
  }

  return ok({
    status: checkpoint.status,
    lastSyncedLocalRevision: checkpoint.lastSyncedLocalRevision,
    ...(checkpoint.conflictReason === undefined ? {} : { conflictReason: checkpoint.conflictReason }),
    ...(checkpoint.conflictCloudRevision === undefined
      ? {}
      : { conflictCloudRevision: checkpoint.conflictCloudRevision }),
    ...(checkpoint.updatedAtMs === undefined ? {} : { updatedAtMs: checkpoint.updatedAtMs }),
  });
}

function validateCommandReceipts(
  receipts: Readonly<Record<string, PlayerProfileRecord["commandReceipts"][string]>>,
): Result<PlayerProfileRecord["commandReceipts"], SdkError> {
  if (!isPlainRecord(receipts)) {
    return fail(createInvalidRecordError("Profile commandReceipts must be an object."));
  }

  const output = emptyRecord<PlayerProfileRecord["commandReceipts"][string]>();
  for (const commandKey of Object.keys(receipts).sort()) {
    const receipt = readOwn(receipts, commandKey);
    if (receipt === undefined || !isPlainRecord(receipt)) {
      return fail(createInvalidRecordError("Profile command receipt must be an object.", { commandKey }));
    }

    if (receipt.commandKey !== commandKey || !isNonEmptyString(receipt.commandKey)) {
      return fail(createInvalidRecordError("Profile command receipt key is invalid.", { commandKey }));
    }

    if (!isNonEmptyString(receipt.commandType)) {
      return fail(createInvalidRecordError("Profile command receipt type is invalid.", { commandKey }));
    }

    if (!isNonEmptyString(receipt.payloadHash)) {
      return fail(createInvalidRecordError("Profile command receipt payload hash is invalid.", { commandKey }));
    }

    if (!isNonNegativeInteger(receipt.appliedLocalRevision)) {
      return fail(
        createInvalidRecordError("Profile command receipt appliedLocalRevision is invalid.", {
          commandKey,
        }),
      );
    }

    if (receipt.status !== "applied") {
      return fail(createInvalidRecordError("Profile command receipt status is invalid.", { commandKey }));
    }

    if (!isFiniteTimestamp(receipt.createdAtMs)) {
      return fail(createInvalidRecordError("Profile command receipt createdAtMs is invalid.", { commandKey }));
    }

    Object.defineProperty(output, commandKey, {
      value: {
        commandKey: receipt.commandKey,
        commandType: receipt.commandType,
        payloadHash: receipt.payloadHash,
        appliedLocalRevision: receipt.appliedLocalRevision,
        status: "applied",
        createdAtMs: receipt.createdAtMs,
      },
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  return ok(output);
}

function validateCloudSnapshotPullResult(
  value: unknown,
  accountId: string,
  traceId: string | undefined,
): Result<ProfileCloudSnapshotPullResult, SdkError> {
  if (!isPlainRecord(value)) {
    return fail(createInvalidCloudResponseError("Profile cloud pull result must be an object.", {
      accountId,
      traceId,
      raw: value,
    }));
  }

  const status = value["status"];
  if (status === "not_found") {
    if (value["cloudRevision"] !== null) {
      return fail(createInvalidCloudResponseError("Profile cloud pull not_found must use null cloudRevision.", {
        accountId,
        traceId,
        status,
        cloudRevision: value["cloudRevision"],
      }));
    }
    return ok(value as ProfileCloudSnapshotPullResult);
  }

  if (status === "ok") {
    if (!isNonEmptyString(value["cloudRevision"]) || !isPlainRecord(value["snapshot"])) {
      return fail(createInvalidCloudResponseError("Profile cloud pull ok result is malformed.", {
        accountId,
        traceId,
        status,
        cloudRevision: value["cloudRevision"],
      }));
    }
    return ok(value as ProfileCloudSnapshotPullResult);
  }

  return fail(createInvalidCloudResponseError("Profile cloud pull returned an unknown status.", {
    accountId,
    traceId,
    status,
  }));
}

function normalizeCloudSnapshotPullPortResult(
  result: unknown,
  accountId: string,
  traceId: string | undefined,
): Result<ProfileCloudSnapshotPullResult, SdkError> {
  const normalized = normalizeCloudSnapshotPortResultEnvelope(result, "pull", accountId, traceId);
  if (!normalized.ok) {
    return fail(normalized.error);
  }

  return validateCloudSnapshotPullResult(normalized.value, accountId, traceId);
}

function normalizeCloudSnapshotPushPortResult(
  result: unknown,
  accountId: string,
  traceId: string | undefined,
): Result<ProfileCloudSnapshotPushResult, SdkError> {
  const normalized = normalizeCloudSnapshotPortResultEnvelope(result, "push", accountId, traceId);
  if (!normalized.ok) {
    return fail(normalized.error);
  }

  return validateCloudSnapshotPushResult(normalized.value, accountId, traceId);
}

function normalizeCloudSnapshotPortResultEnvelope(
  result: unknown,
  operation: "pull" | "push",
  accountId: string,
  traceId: string | undefined,
): Result<unknown, SdkError> {
  if (!isPlainRecord(result) || typeof result["ok"] !== "boolean") {
    return fail(createInvalidCloudResponseError(`Profile cloud ${operation} port must return a Result.`, {
      accountId,
      traceId,
      raw: result,
    }));
  }

  if (!result["ok"]) {
    const error = result["error"];
    if (error instanceof SdkError) {
      return fail(error);
    }

    return fail(createInvalidCloudResponseError(`Profile cloud ${operation} failed Result is malformed.`, {
      accountId,
      traceId,
      raw: result,
    }));
  }

  return ok(result["value"]);
}

function validateCloudSnapshotPushResult(
  value: unknown,
  accountId: string,
  traceId: string | undefined,
): Result<ProfileCloudSnapshotPushResult, SdkError> {
  if (!isPlainRecord(value)) {
    return fail(createInvalidCloudResponseError("Profile cloud push result must be an object.", {
      accountId,
      traceId,
      raw: value,
    }));
  }

  const status = value["status"];
  if (status === "ok") {
    if (!isNonEmptyString(value["cloudRevision"])) {
      return fail(createInvalidCloudResponseError("Profile cloud push ok result is malformed.", {
        accountId,
        traceId,
        status,
        cloudRevision: value["cloudRevision"],
      }));
    }
    return ok(value as ProfileCloudSnapshotPushResult);
  }

  if (status === "revision_conflict") {
    if (!isNonEmptyString(value["cloudRevision"]) || !isPlainRecord(value["latestSnapshot"])) {
      return fail(createInvalidCloudResponseError("Profile cloud push conflict result is malformed.", {
        accountId,
        traceId,
        status,
        cloudRevision: value["cloudRevision"],
      }));
    }
    return ok(value as ProfileCloudSnapshotPushResult);
  }

  return fail(createInvalidCloudResponseError("Profile cloud push returned an unknown status.", {
    accountId,
    traceId,
    status,
  }));
}

function createInvalidCloudResponseError(
  message: string,
  metadata: Readonly<Record<string, unknown>>,
): SdkError {
  return new SdkError("profile.cloud_invalid_response", message, {
    moduleName: "profile",
    metadata,
  });
}

function createInvalidRecordError(
  message: string,
  metadata: Readonly<Record<string, unknown>> = {},
): SdkError {
  return new SdkError("profile.module_invalid", message, {
    moduleName: "profile",
    metadata,
  });
}

function createProfileRecord(input: PlayerProfileRecord): PlayerProfileRecord {
  return {
    schemaVersion: input.schemaVersion,
    accountId: input.accountId ?? null,
    recordRevision: input.recordRevision,
    localRevision: input.localRevision,
    cloudRevision: input.cloudRevision,
    modules: input.modules,
    syncCheckpoint: input.syncCheckpoint,
    commandReceipts: input.commandReceipts,
    updatedAtMs: input.updatedAtMs,
  };
}

function emptyRecord<TValue>(): Record<string, TValue> {
  return Object.create(null) as Record<string, TValue>;
}

function withRecordEntry<TValue>(
  record: Readonly<Record<string, TValue>>,
  key: string,
  value: TValue,
): Readonly<Record<string, TValue>> {
  const output = emptyRecord<TValue>();
  for (const existingKey of Object.keys(record).sort()) {
    Object.defineProperty(output, existingKey, {
      value: record[existingKey],
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  Object.defineProperty(output, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return output;
}

function readOwn<TValue>(
  record: Readonly<Record<string, TValue>>,
  key: string,
): TValue | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function readRecordRevision(value: unknown): number | null {
  const revision = readFiniteIntegerProperty(value, "recordRevision");
  return revision === undefined || revision < 0 ? null : revision;
}

type AccountIdReadResult =
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false };

function readAccountId(value: unknown): AccountIdReadResult {
  if (!isPlainRecord(value)) {
    return { ok: true, value: null };
  }

  if (!Object.prototype.hasOwnProperty.call(value, "accountId")) {
    return { ok: true, value: null };
  }

  const accountId = value["accountId"];
  if (accountId === null) {
    return { ok: true, value: null };
  }

  if (isNonEmptyString(accountId)) {
    return { ok: true, value: accountId };
  }

  return { ok: false };
}

function readFiniteIntegerProperty(value: unknown, key: string): number | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  const property = (value as Record<string, unknown>)[key];
  return typeof property === "number" && Number.isInteger(property) ? property : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validatePublicProfileCommandKey(value: unknown): Result<string, SdkError> {
  return validateProfileCommandKey(value, PROFILE_COMMAND_KEY_MAX_LENGTH);
}

function validateProfileCommandKey(value: unknown, maxLength: number): Result<string, SdkError> {
  if (!isNonEmptyString(value)) {
    return fail(
      new SdkError("profile.command_failed", "Profile commandKey must be a non-empty string.", {
        moduleName: "profile",
      }),
    );
  }

  if (value.length > maxLength) {
    return fail(
      new SdkError(
        "profile.command_failed",
        `Profile commandKey must be ${maxLength} characters or fewer.`,
        {
          moduleName: "profile",
          metadata: {
            field: "commandKey",
            actualLength: value.length,
            maxLength,
          },
        },
      ),
    );
  }

  return ok(value);
}

function isValidModuleId(value: unknown): value is string {
  return isNonEmptyString(value);
}

function isValidOwner(value: unknown): value is ProfileModuleOwner {
  return (
    value === "foundation" ||
    (typeof value === "string" &&
      ((value.startsWith("sdk:") && value.slice("sdk:".length).trim().length > 0) ||
        (value.startsWith("game:") && value.slice("game:".length).trim().length > 0)))
  );
}

function isGameOwner(value: unknown): value is `game:${string}` {
  return typeof value === "string" && value.startsWith("game:") && value.slice("game:".length).trim().length > 0;
}

function isSdkOwner(value: unknown): value is `sdk:${string}` {
  return typeof value === "string" && value.startsWith("sdk:") && value.slice("sdk:".length).trim().length > 0;
}

function isConflictResolutionStrategy(value: unknown): value is ProfileConflictResolutionStrategy {
  return value === "use_server" || value === "use_local" || value === "custom";
}

function resolveCommandType(strategy: ProfileConflictResolutionStrategy): string {
  switch (strategy) {
    case "use_server":
      return RESOLVE_SERVER_COMMAND_TYPE;
    case "use_local":
      return RESOLVE_LOCAL_COMMAND_TYPE;
    case "custom":
      return RESOLVE_CUSTOM_COMMAND_TYPE;
  }
}
