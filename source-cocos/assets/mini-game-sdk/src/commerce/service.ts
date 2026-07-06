import type { SdkContext } from "../core/context";
import { SdkError } from "../core/errors";
import { fail, ok, type Result } from "../core/result";
import type { PlayerProfileRecord, ProfileRuntimeSnapshot, ProfileService } from "../profile";
import {
  getReadonlyProfileSnapshot,
  type ProfileSdkOwnedModuleWriter,
} from "../profile/service";
import { canAffordCommerceState } from "./affordability";
import {
  claimOpportunityInState,
  normalizeExpiredClaimOpportunities,
  upsertClaimOpportunityInState,
} from "./claim";
import { createCommerceError } from "./errors";
import {
  emitCommerceClaimOpportunityUpsertedEvent,
  emitCommerceCommandFailedEvent,
  emitCommerceMutationAppliedEvent,
} from "./events";
import {
  COMMERCE_PROFILE_MODULE_OWNER,
  COMMERCE_PROFILE_MODULE_VERSION,
  createCommercePersistenceConflictError,
  mapProfilePersistenceError,
  readCommerceModuleFromProfileRecord,
  toProfileJsonCommerceState,
} from "./persistence";
import { readOwn } from "./record";
import { grantReward, spendResources } from "./reducer";
import { normalizeCommerceStateRetention } from "./retention";
import { createEmptyCommerceState } from "./state";
import {
  COMMERCE_MODULE_ID,
  CURRENT_COMMERCE_SCHEMA_VERSION,
  DEFAULT_COMMERCE_CLAIMED_TOMBSTONE_RETENTION_LIMIT,
  DEFAULT_COMMERCE_COMMAND_RECEIPT_RETENTION_LIMIT,
  DEFAULT_COMMERCE_INACTIVE_CLAIM_OPPORTUNITY_RETENTION_LIMIT,
  DEFAULT_COMMERCE_LEDGER_RETENTION_LIMIT,
  type CanAffordInput,
  type CanAffordOutput,
  type ClaimOpportunityInput,
  type ClaimOpportunityOutput,
  type CommerceCommandMeta,
  type CommerceCommandType,
  type CommerceModuleConfig,
  type CommerceMutationOutput,
  type CommerceRuntimeSnapshot,
  type CommerceRuntimeStatus,
  type CommerceService,
  type CommerceState,
  type GrantRewardInput,
  type SpendBundleInput,
  type UpsertClaimOpportunityAppliedOutput,
  type UpsertClaimOpportunityInput,
  type UpsertClaimOpportunityOutput,
} from "./types";

export interface CreateCommerceServiceOptions {
  readonly context: SdkContext;
  readonly profile: ProfileService;
  readonly profileWriter: ProfileSdkOwnedModuleWriter;
  readonly config?: CommerceModuleConfig;
  readonly now?: () => number;
}

interface LoadedCommerceState {
  readonly profileSnapshot: ProfileRuntimeSnapshot;
  readonly state: CommerceState;
  readonly expectedModuleRevision: number | null;
}

interface SavedCommerceState {
  readonly state: CommerceState;
  readonly writerKind: "applied" | "replayed";
  readonly profileCommandKey: string;
  readonly activeModuleRevision: number | null;
  readonly replayModuleRevision: number | null;
}

type ProfileBackedCommerceCommandType =
  | "grant"
  | "spend"
  | "upsert_claim_opportunity"
  | "claim";

type ProfileWriterCommerceCommandType = "bootstrap" | ProfileBackedCommerceCommandType;

type ProfileBackedCommerceCommandInput =
  | GrantRewardInput
  | SpendBundleInput
  | UpsertClaimOpportunityInput
  | ClaimOpportunityInput;

type ProfileBackedCommerceCommandOutput =
  | CommerceMutationOutput
  | UpsertClaimOpportunityOutput
  | ClaimOpportunityOutput;

export function createCommerceService(options: CreateCommerceServiceOptions): CommerceService {
  return new ProfileBackedCommerceService(options);
}

class ProfileBackedCommerceService implements CommerceService {
  private readonly enabled: boolean;
  private readonly profile: ProfileService;
  private readonly profileWriter: ProfileSdkOwnedModuleWriter;
  private readonly now: () => number;
  private readonly ledgerRetentionLimit: number;
  private readonly commandReceiptRetentionLimit: number;
  private readonly inactiveClaimOpportunityRetentionLimit: number;
  private readonly claimedTombstoneRetentionLimit: number;
  private operationQueue: Promise<void> = Promise.resolve();
  private destroyed = false;

  constructor(private readonly options: CreateCommerceServiceOptions) {
    const config = options.config ?? options.context.config.modules?.commerce;
    this.enabled = config?.enabled ?? false;
    this.profile = options.profile;
    this.profileWriter = options.profileWriter;
    this.now = options.now ?? (() => options.context.clock.now());
    this.ledgerRetentionLimit =
      config?.ledgerRetentionLimit ?? DEFAULT_COMMERCE_LEDGER_RETENTION_LIMIT;
    this.commandReceiptRetentionLimit =
      config?.commandReceiptRetentionLimit ?? DEFAULT_COMMERCE_COMMAND_RECEIPT_RETENTION_LIMIT;
    this.inactiveClaimOpportunityRetentionLimit =
      config?.inactiveClaimOpportunityRetentionLimit ??
      DEFAULT_COMMERCE_INACTIVE_CLAIM_OPPORTUNITY_RETENTION_LIMIT;
    this.claimedTombstoneRetentionLimit =
      config?.claimedTombstoneRetentionLimit ??
      DEFAULT_COMMERCE_CLAIMED_TOMBSTONE_RETENTION_LIMIT;
  }

  async getSnapshot(): Promise<Result<CommerceRuntimeSnapshot, SdkError>> {
    return this.enqueueOperation(async () => {
      if (this.destroyed) {
        return ok(this.createSnapshot("destroyed", null, {
          causeCode: "commerce.destroyed",
        }));
      }

      if (!this.enabled) {
        return ok(this.createSnapshot("unavailable", null, {
          causeCode: "commerce.unavailable",
        }));
      }

      const loaded = await this.loadCommerceState({ bootstrapIfMissing: true, failOnProfileConflict: false });
      if (!loaded.ok) {
        if (loaded.error.code === "commerce.persistence_unavailable") {
          return ok(this.createSnapshot("unavailable", null, this.persistenceFromError(loaded.error)));
        }
        return fail(loaded.error);
      }

      return ok(this.createSnapshot("ready", loaded.value.state, this.persistenceFromProfile(loaded.value.profileSnapshot)));
    });
  }

  async canAfford(input: CanAffordInput): Promise<Result<CanAffordOutput, SdkError>> {
    return this.enqueueOperation(async () => {
      const availability = await this.requireAvailable("can_afford", input);
      if (!availability.ok) {
        return this.failCommand("can_afford", input, availability.error);
      }

      const loaded = await this.loadCommerceState({
        bootstrapIfMissing: false,
        failOnProfileConflict: false,
        readonlyProfile: true,
      });
      if (!loaded.ok) {
        return this.failCommand("can_afford", input, loaded.error);
      }

      const result = canAffordCommerceState(loaded.value.state, input.spend);
      if (!result.ok) {
        return this.failCommand("can_afford", input, result.error);
      }
      return result;
    });
  }

  async grant(input: GrantRewardInput): Promise<Result<CommerceMutationOutput, SdkError>> {
    return this.enqueueOperation(() => this.runMutation("grant", input));
  }

  async spend(input: SpendBundleInput): Promise<Result<CommerceMutationOutput, SdkError>> {
    return this.enqueueOperation(() => this.runMutation("spend", input));
  }

  async upsertClaimOpportunity(
    input: UpsertClaimOpportunityInput,
  ): Promise<Result<UpsertClaimOpportunityOutput, SdkError>> {
    return this.enqueueOperation(() => this.runMutation("upsert_claim_opportunity", input));
  }

  async claim(input: ClaimOpportunityInput): Promise<Result<ClaimOpportunityOutput, SdkError>> {
    return this.enqueueOperation(() => this.runMutation("claim", input));
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    await this.operationQueue;
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

  private async runMutation(
    commandType: "grant",
    input: GrantRewardInput,
  ): Promise<Result<CommerceMutationOutput, SdkError>>;
  private async runMutation(
    commandType: "spend",
    input: SpendBundleInput,
  ): Promise<Result<CommerceMutationOutput, SdkError>>;
  private async runMutation(
    commandType: "upsert_claim_opportunity",
    input: UpsertClaimOpportunityInput,
  ): Promise<Result<UpsertClaimOpportunityOutput, SdkError>>;
  private async runMutation(
    commandType: "claim",
    input: ClaimOpportunityInput,
  ): Promise<Result<ClaimOpportunityOutput, SdkError>>;
  private async runMutation(
    commandType: ProfileBackedCommerceCommandType,
    input: ProfileBackedCommerceCommandInput,
  ): Promise<Result<ProfileBackedCommerceCommandOutput, SdkError>> {
    const availability = await this.requireAvailable(commandType, input);
    if (!availability.ok) {
      return this.failCommand(commandType, input, availability.error);
    }

    const loaded = await this.loadCommerceState({ bootstrapIfMissing: true, failOnProfileConflict: true });
    if (!loaded.ok) {
      return this.failCommand(commandType, input, loaded.error);
    }

    const reduced = this.reduceMutation(commandType, loaded.value.state, input);
    if (!reduced.ok) {
      return this.failCommand(commandType, input, reduced.error);
    }
    if (reduced.value.kind === "replayed") {
      this.emitSuccessEvent(commandType, input, reduced.value);
      return ok(reduced.value);
    }
    const retained = this.withRetention(reduced.value);

    const saved = await this.saveCommerceState({
      commandType,
      commandKey: input.commandKey,
      state: retained.state,
      expectedModuleRevision: loaded.value.expectedModuleRevision,
    });
    if (!saved.ok) {
      if (saved.error.code === "commerce.persistence_conflict") {
        const retry = await this.replayOrRetryAfterCasConflict(commandType, input);
        if (!retry.ok) {
          return this.failCommand(commandType, input, retry.error);
        }
        this.emitSuccessEvent(commandType, input, retry.value);
        return ok(retry.value);
      }
      return this.failCommand(commandType, input, saved.error);
    }

    if (saved.value.writerKind === "replayed") {
      const replay = this.replayMutationFromState(commandType, saved.value.state, input, saved.value);
      if (!replay.ok) {
        return this.failCommand(commandType, input, replay.error);
      }
      this.emitSuccessEvent(commandType, input, replay.value);
      return ok(replay.value);
    }

    const output = {
      ...retained,
      state: saved.value.state,
    } as ProfileBackedCommerceCommandOutput;
    this.emitSuccessEvent(commandType, input, output);
    return ok(output);
  }

  private async replayOrRetryAfterCasConflict(
    commandType: ProfileBackedCommerceCommandType,
    input: ProfileBackedCommerceCommandInput,
  ): Promise<Result<ProfileBackedCommerceCommandOutput, SdkError>> {
    const latest = await this.loadCommerceState({ bootstrapIfMissing: true, failOnProfileConflict: true });
    if (!latest.ok) {
      return fail(latest.error);
    }

    const reduced = this.reduceMutation(commandType, latest.value.state, input);
    if (!reduced.ok) {
      return fail(reduced.error);
    }
    if (reduced.value.kind === "replayed") {
      return ok(reduced.value);
    }
    const retained = this.withRetention(reduced.value);

    const retrySave = await this.saveCommerceState({
      commandType,
      commandKey: input.commandKey,
      state: retained.state,
      expectedModuleRevision: latest.value.expectedModuleRevision,
    });
    if (!retrySave.ok) {
      if (retrySave.error.code === "commerce.persistence_conflict") {
        return fail(
          createCommercePersistenceConflictError(
            "Commerce profile persistence still conflicted after one retry.",
            "profile.local_revision_conflict",
            this.createCommandMetadata(commandType, input),
          ),
        );
      }
      return fail(retrySave.error);
    }

    if (retrySave.value.writerKind === "replayed") {
      return this.replayMutationFromState(commandType, retrySave.value.state, input, retrySave.value);
    }

    return ok({
      ...retained,
      state: retrySave.value.state,
    } as ProfileBackedCommerceCommandOutput);
  }

  private reduceMutation(
    commandType: ProfileBackedCommerceCommandType,
    state: CommerceState,
    input: ProfileBackedCommerceCommandInput,
  ): Result<ProfileBackedCommerceCommandOutput, SdkError> {
    switch (commandType) {
      case "grant":
        return grantReward(state, input as GrantRewardInput, { nowMs: this.now() });
      case "spend":
        return spendResources(state, input as SpendBundleInput, { nowMs: this.now() });
      case "upsert_claim_opportunity":
        return upsertClaimOpportunityInState(state, input as UpsertClaimOpportunityInput, {
          nowMs: this.now(),
        });
      case "claim":
        return claimOpportunityInState(state, input as ClaimOpportunityInput, {
          nowMs: this.now(),
        });
    }
  }

  private replayMutationFromState(
    commandType: ProfileBackedCommerceCommandType,
    state: CommerceState,
    input: ProfileBackedCommerceCommandInput,
    saved?: SavedCommerceState,
  ): Result<ProfileBackedCommerceCommandOutput, SdkError> {
    const replayMetadata = saved === undefined
      ? {}
      : {
          profileCommandKey: saved.profileCommandKey,
          activeModuleRevision: saved.activeModuleRevision,
          replayModuleRevision: saved.replayModuleRevision,
        };

    if (readOwn(state.commandReceipts, input.commandKey) === undefined) {
      return fail(
        createCommercePersistenceConflictError(
          "Commerce profile replay is not present in the active commerce state.",
          "profile.command_replay_conflict",
          {
            ...this.createCommandMetadata(commandType, input),
            conflictKind: "profile_replay_not_active",
            ...replayMetadata,
          },
        ),
      );
    }

    const replay = this.reduceMutation(commandType, state, input);
    if (!replay.ok) {
      return replay;
    }
    if (replay.value.kind !== "replayed") {
      return fail(
        createCommercePersistenceConflictError(
          "Commerce profile replay did not resolve to a replayed commerce result.",
          "profile.command_replay_conflict",
          {
            ...this.createCommandMetadata(commandType, input),
            conflictKind: "profile_replay_not_active",
            replayKind: replay.value.kind,
            ...replayMetadata,
          },
        ),
      );
    }
    return ok(replay.value);
  }

  private withRetention<TOutput extends ProfileBackedCommerceCommandOutput>(output: TOutput): TOutput {
    const state = normalizeCommerceStateRetention(
      this.normalizeLoadedState(output.state),
      {
        ledgerRetentionLimit: this.ledgerRetentionLimit,
        commandReceiptRetentionLimit: this.commandReceiptRetentionLimit,
        inactiveClaimOpportunityRetentionLimit: this.inactiveClaimOpportunityRetentionLimit,
        claimedTombstoneRetentionLimit: this.claimedTombstoneRetentionLimit,
      },
      {
        commandKeys: [output.receipt.commandKey],
        ledgerIds: output.receipt.ledgerIds ?? [],
        sourceKeys: output.receipt.sourceKey === undefined ? [] : [output.receipt.sourceKey],
      },
    );

    return {
      ...output,
      state,
    };
  }

  private emitSuccessEvent(
    commandType: ProfileBackedCommerceCommandType,
    input: ProfileBackedCommerceCommandInput,
    output: ProfileBackedCommerceCommandOutput,
  ): void {
    if (commandType === "upsert_claim_opportunity") {
      if (output.kind === "replayed") {
        return;
      }
      emitCommerceClaimOpportunityUpsertedEvent(
        this.options.context,
        input,
        output as UpsertClaimOpportunityAppliedOutput,
      );
      return;
    }

    emitCommerceMutationAppliedEvent(
      this.options.context,
      commandType,
      input,
      output as CommerceMutationOutput | ClaimOpportunityOutput,
    );
  }

  private failCommand<TValue>(
    commandType: CommerceCommandType | "can_afford",
    input: unknown,
    error: SdkError,
  ): Result<TValue, SdkError> {
    emitCommerceCommandFailedEvent(this.options.context, commandType, input, error);
    return fail(error);
  }

  private async loadCommerceState(input: {
    readonly bootstrapIfMissing: boolean;
    readonly failOnProfileConflict: boolean;
    readonly readonlyProfile?: boolean;
  }): Promise<Result<LoadedCommerceState, SdkError>> {
    const profileSnapshot = await this.loadProfileSnapshot({
      readonlyProfile: input.readonlyProfile ?? false,
    });
    if (!profileSnapshot.ok) {
      return fail(profileSnapshot.error);
    }

    if (profileSnapshot.value.record === null) {
      if (!input.bootstrapIfMissing) {
        return ok({
          profileSnapshot: profileSnapshot.value,
          state: createEmptyCommerceState(this.now()),
          expectedModuleRevision: null,
        });
      }

      return fail(
        mapProfilePersistenceError(
          new SdkError("profile.unavailable", "Profile snapshot record is unavailable.", {
            moduleName: "profile",
          }),
        ),
      );
    }

    const moduleRead = readCommerceModuleFromProfileRecord(profileSnapshot.value.record);
    if (!moduleRead.ok) {
      return fail(moduleRead.error);
    }

    if (profileSnapshot.value.status === "conflict") {
      if (input.failOnProfileConflict || moduleRead.value.module === null) {
        return fail(
          mapProfilePersistenceError(
            new SdkError("profile.sync_conflict_open", "Profile has an unresolved sync conflict.", {
              moduleName: "profile",
            }),
            { profileStatus: profileSnapshot.value.status },
          ),
        );
      }
    }

    if (moduleRead.value.state !== null) {
      return ok({
        profileSnapshot: profileSnapshot.value,
        state: this.normalizeLoadedState(moduleRead.value.state),
        expectedModuleRevision: moduleRead.value.expectedModuleRevision,
      });
    }

    if (!input.bootstrapIfMissing) {
      return ok({
        profileSnapshot: profileSnapshot.value,
        state: createEmptyCommerceState(this.now()),
        expectedModuleRevision: null,
      });
    }

    const state = createEmptyCommerceState(this.now());
    const saved = await this.saveCommerceState({
      commandType: "bootstrap",
      commandKey: createBootstrapCommandKey(profileSnapshot.value.record),
      state,
      expectedModuleRevision: null,
    });
    if (!saved.ok) {
      return fail(saved.error);
    }

    const refreshed = await this.loadProfileSnapshot({ readonlyProfile: false });
    if (!refreshed.ok) {
      return fail(refreshed.error);
    }

    return ok({
      profileSnapshot: refreshed.value,
      state: this.normalizeLoadedState(saved.value.state),
      expectedModuleRevision: 1,
    });
  }

  private async loadProfileSnapshot(input: {
    readonly readonlyProfile: boolean;
  }): Promise<Result<ProfileRuntimeSnapshot, SdkError>> {
    let result: Awaited<ReturnType<ProfileService["getSnapshot"]>>;
    try {
      result = input.readonlyProfile
        ? await getReadonlyProfileSnapshot(this.profile)
        : await this.profile.getSnapshot();
    } catch (error) {
      return fail(
        mapProfilePersistenceError(
          SdkError.fromUnknown(
            "profile.unavailable",
            input.readonlyProfile
              ? "Profile readonly snapshot failed."
              : "Profile snapshot failed.",
            error,
            { moduleName: "profile" },
          ),
        ),
      );
    }

    if (!result.ok) {
      return fail(mapProfilePersistenceError(result.error));
    }

    if (!result.value.enabled) {
      return fail(
        mapProfilePersistenceError(
          new SdkError("profile.unavailable", "Profile service is disabled.", {
            moduleName: "profile",
          }),
          this.persistenceFromProfile(result.value),
        ),
      );
    }

    if (!result.value.localStoreConfigured) {
      return fail(
        mapProfilePersistenceError(
          new SdkError("profile.local_store_unavailable", "Profile local store is not configured.", {
            moduleName: "profile",
          }),
          this.persistenceFromProfile(result.value),
        ),
      );
    }

    return ok(result.value);
  }

  private normalizeLoadedState(state: CommerceState): CommerceState {
    return normalizeExpiredClaimOpportunities(state, this.now());
  }

  private async saveCommerceState(input: {
    readonly commandType: ProfileWriterCommerceCommandType;
    readonly commandKey: string;
    readonly state: CommerceState;
    readonly expectedModuleRevision: number | null;
  }): Promise<Result<SavedCommerceState, SdkError>> {
    const profileCommandKey = createProfileWriterCommandKey(input.commandType, input.commandKey);
    const result = await this.profileWriter.saveModule({
      commandKey: profileCommandKey,
      commandType: createProfileWriterCommandType(input.commandType),
      moduleId: COMMERCE_MODULE_ID,
      moduleVersion: COMMERCE_PROFILE_MODULE_VERSION,
      expectedModuleRevision: input.expectedModuleRevision,
      owner: COMMERCE_PROFILE_MODULE_OWNER,
      data: toProfileJsonCommerceState(input.state),
    });

    if (!result.ok) {
      return fail(mapProfilePersistenceError(result.error, this.createCommandMetadata(input.commandType, {
        commandKey: input.commandKey,
      })));
    }

    const active = readCommerceModuleFromProfileRecord(result.value.record);
    if (!active.ok) {
      return fail(active.error);
    }
    const replayModuleRevision = result.value.kind === "applied"
      ? result.value.module.moduleRevision
      : result.value.currentModule?.moduleRevision ?? null;
    if (active.value.state === null) {
      return fail(
        createCommercePersistenceConflictError(
          "Saved commerce profile command is not active in the profile record.",
          "profile.command_replay_conflict",
          {
            ...this.createCommandMetadata(input.commandType, { commandKey: input.commandKey }),
            conflictKind: "profile_replay_not_active",
            profileCommandKey,
            activeModuleRevision: active.value.expectedModuleRevision,
            replayModuleRevision,
          },
        ),
      );
    }

    return ok({
      state: active.value.state,
      writerKind: result.value.kind,
      profileCommandKey,
      activeModuleRevision: active.value.expectedModuleRevision,
      replayModuleRevision,
    });
  }

  private async requireAvailable(
    commandType: CommerceCommandType | "can_afford",
    input: unknown,
  ): Promise<Result<void, SdkError>> {
    if (this.destroyed) {
      return fail(this.createDestroyedError(commandType, input));
    }

    if (!this.enabled) {
      return fail(this.createUnavailableError("Commerce service is disabled.", input));
    }

    return ok(undefined);
  }

  private createSnapshot(
    status: CommerceRuntimeStatus,
    state: CommerceState | null,
    persistence: CommerceRuntimeSnapshot["persistence"],
  ): CommerceRuntimeSnapshot {
    return {
      moduleId: COMMERCE_MODULE_ID,
      schemaVersion: CURRENT_COMMERCE_SCHEMA_VERSION,
      enabled: this.enabled && !this.destroyed,
      status,
      state,
      ledgerRetentionLimit: this.ledgerRetentionLimit,
      commandReceiptRetentionLimit: this.commandReceiptRetentionLimit,
      inactiveClaimOpportunityRetentionLimit: this.inactiveClaimOpportunityRetentionLimit,
      claimedTombstoneRetentionLimit: this.claimedTombstoneRetentionLimit,
      persistence,
      generatedAtMs: this.now(),
    };
  }

  private persistenceFromProfile(
    snapshot: ProfileRuntimeSnapshot,
  ): CommerceRuntimeSnapshot["persistence"] {
    return {
      profileEnabled: snapshot.enabled,
      profileStatus: snapshot.status,
      localStoreConfigured: snapshot.localStoreConfigured,
    };
  }

  private persistenceFromError(error: SdkError): CommerceRuntimeSnapshot["persistence"] {
    return {
      ...(typeof error.metadata?.profileEnabled === "boolean"
        ? { profileEnabled: error.metadata.profileEnabled }
        : {}),
      ...(typeof error.metadata?.profileStatus === "string"
        ? { profileStatus: error.metadata.profileStatus }
        : {}),
      ...(typeof error.metadata?.localStoreConfigured === "boolean"
        ? { localStoreConfigured: error.metadata.localStoreConfigured }
        : {}),
      causeCode: typeof error.metadata?.causeCode === "string"
        ? error.metadata.causeCode as SdkError["code"]
        : error.code,
    };
  }

  private createDestroyedError(
    commandType: CommerceCommandType | "can_afford",
    input: unknown,
  ): SdkError {
    return createCommerceError("commerce.destroyed", "Destroyed commerce service cannot run commands.", {
      ...this.createCommandMetadata(commandType, input),
    });
  }

  private createUnavailableError(message: string, input: unknown): SdkError {
    return createCommerceError("commerce.unavailable", message, {
      enabled: this.enabled,
      ...this.createCommandMetadata(undefined, input),
    });
  }

  private createCommandMetadata(
    commandType: CommerceCommandType | "can_afford" | "bootstrap" | undefined,
    input: unknown,
  ): Readonly<Record<string, unknown>> {
    const meta = readCommerceMeta(input);
    return {
      ...(commandType === undefined ? {} : { commandType }),
      ...(meta.commandKey === undefined ? {} : { commandKey: meta.commandKey }),
      ...(meta.reason === undefined ? {} : { reason: meta.reason }),
      ...(meta.source === undefined ? {} : { source: meta.source }),
      ...(meta.traceId === undefined ? {} : { traceId: meta.traceId }),
    };
  }
}

function createProfileWriterCommandKey(
  commandType: ProfileWriterCommerceCommandType,
  commandKey: string,
): string {
  return commandType === "bootstrap"
    ? `sdk.commerce:bootstrap:${commandKey}`
    : `sdk.commerce:${commandType}:${commandKey}`;
}

function createProfileWriterCommandType(commandType: ProfileWriterCommerceCommandType): string {
  return `sdk.commerce.${commandType}`;
}

function createBootstrapCommandKey(record: PlayerProfileRecord): string {
  return `bootstrap:${record.recordRevision}:${record.localRevision}`;
}

function readCommerceMeta(input: unknown): Partial<CommerceCommandMeta> {
  if (typeof input !== "object" || input === null) {
    return {};
  }

  const record = input as Partial<Record<keyof CommerceCommandMeta, unknown>>;
  return {
    ...(typeof record.commandKey === "string" ? { commandKey: record.commandKey } : {}),
    ...(typeof record.reason === "string" ? { reason: record.reason } : {}),
    ...(typeof record.source === "string" ? { source: record.source } : {}),
    ...(typeof record.traceId === "string" ? { traceId: record.traceId } : {}),
  };
}
