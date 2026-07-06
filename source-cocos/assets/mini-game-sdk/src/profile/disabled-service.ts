import { SdkError } from "../core/errors";
import type { Unsubscribe } from "../core/event-bus";
import { fail, ok, type Result } from "../core/result";
import {
  DEFAULT_PROFILE_COMMAND_RECEIPT_RETENTION_LIMIT,
  type DisabledProfileServiceOptions,
  type ProfileJsonObject,
  type ProfileRuntimeSnapshot,
  type ProfileService,
  type ProfileSnapshotChangedListener,
  type ReadProfileModuleInput,
  type ReadProfileModuleOutput,
  type ResolveProfileConflictInput,
  type ResolveProfileConflictOutput,
  type SaveProfileModuleInput,
  type SaveProfileModuleOutput,
  type SyncCloudSnapshotInput,
  type SyncCloudSnapshotOutput,
  type UpdateProfileModuleInput,
  type UpdateProfileModuleOutput,
} from "./types";

export class DisabledProfileService implements ProfileService {
  private destroyed = false;
  private readonly enabled: boolean;
  private readonly localStoreConfigured: boolean;
  private readonly cloudSnapshotConfigured: boolean;
  private readonly commandReceiptRetentionLimit: number;
  private readonly now: () => number;

  constructor(options: DisabledProfileServiceOptions) {
    this.enabled = options.enabled ?? false;
    this.localStoreConfigured = options.localStoreConfigured ?? false;
    this.cloudSnapshotConfigured = options.cloudSnapshotConfigured ?? false;
    this.commandReceiptRetentionLimit =
      options.commandReceiptRetentionLimit ?? DEFAULT_PROFILE_COMMAND_RECEIPT_RETENTION_LIMIT;
    this.now = options.now ?? Date.now;
  }

  async getSnapshot(): Promise<Result<ProfileRuntimeSnapshot, SdkError>> {
    return ok(this.createSnapshot());
  }

  async readModule<TData extends ProfileJsonObject>(
    input: ReadProfileModuleInput<TData>,
  ): Promise<Result<ReadProfileModuleOutput<TData>, SdkError>> {
    return fail(
      this.createUnavailableError(
        this.destroyed
          ? "Destroyed profile service cannot read modules."
          : "Profile local store is unavailable.",
        { moduleId: input.moduleId },
      ),
    );
  }

  async updateModule<TData extends ProfileJsonObject, TMeta = undefined>(
    input: UpdateProfileModuleInput<TData, TMeta>,
  ): Promise<Result<UpdateProfileModuleOutput<TData, TMeta>, SdkError>> {
    return fail(
      this.createUnavailableError(
        this.destroyed
          ? "Destroyed profile service cannot update modules."
          : "Profile local store is unavailable.",
        { commandKey: input.commandKey, moduleId: input.moduleId },
      ),
    );
  }

  async saveModule<TData extends ProfileJsonObject>(
    input: SaveProfileModuleInput<TData>,
  ): Promise<Result<SaveProfileModuleOutput<TData>, SdkError>> {
    return fail(
      this.createUnavailableError(
        this.destroyed
          ? "Destroyed profile service cannot save modules."
          : "Profile local store is unavailable.",
        { commandKey: input.commandKey, moduleId: input.moduleId },
      ),
    );
  }

  async syncCloudSnapshot(
    input: SyncCloudSnapshotInput = {},
  ): Promise<Result<SyncCloudSnapshotOutput, SdkError>> {
    if (this.destroyed) {
      return fail(
        this.createUnavailableError("Destroyed profile service cannot sync cloud snapshots.", {
          traceId: input.traceId,
        }),
      );
    }

    if (!this.enabled) {
      return ok({
        status: "skipped",
        record: null,
        cloudRevision: null,
        skippedReason: "disabled",
      });
    }

    if (!this.cloudSnapshotConfigured) {
      return ok({
        status: "skipped",
        record: null,
        cloudRevision: null,
        skippedReason: "cloud_port_missing",
      });
    }

    return ok({
      status: "skipped",
      record: null,
      cloudRevision: null,
      skippedReason: "no_local_store",
    });
  }

  async resolveConflict(
    input: ResolveProfileConflictInput = {},
  ): Promise<Result<ResolveProfileConflictOutput, SdkError>> {
    if (this.destroyed) {
      return fail(
        this.createUnavailableError("Destroyed profile service cannot resolve conflicts.", {
          traceId: input.traceId,
        }),
      );
    }

    return ok({
      status: "skipped",
      strategy: input.strategy ?? "use_server",
      record: null,
      skippedReason: this.enabled ? "no_conflict" : "disabled",
    });
  }

  onSnapshotChanged(_listener: ProfileSnapshotChangedListener): Unsubscribe {
    return () => undefined;
  }

  destroy(): void {
    this.destroyed = true;
  }

  private createSnapshot(): ProfileRuntimeSnapshot {
    return {
      record: null,
      status: "unavailable",
      enabled: this.enabled && !this.destroyed,
      localStoreConfigured: this.localStoreConfigured,
      cloudSnapshotConfigured: this.cloudSnapshotConfigured,
      commandReceiptRetentionLimit: this.commandReceiptRetentionLimit,
      generatedAtMs: this.now(),
    };
  }

  private createUnavailableError(
    message: string,
    metadata: Readonly<Record<string, unknown>> = {},
  ): SdkError {
    return new SdkError("profile.unavailable", message, {
      moduleName: "profile",
      metadata: {
        enabled: this.enabled,
        localStoreConfigured: this.localStoreConfigured,
        cloudSnapshotConfigured: this.cloudSnapshotConfigured,
        ...metadata,
      },
    });
  }
}
