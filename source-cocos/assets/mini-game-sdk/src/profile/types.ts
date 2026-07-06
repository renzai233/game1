import type { SdkError } from "../core/errors";
import type { Unsubscribe } from "../core/event-bus";
import type { ModuleBoundary } from "../core/module-boundary";
import type { Result } from "../core/result";

export const CURRENT_PROFILE_SCHEMA_VERSION = 2;
export const FOUNDATION_PROFILE_MODULE_ID = "foundation.profile";
export const DEFAULT_PROFILE_COMMAND_RECEIPT_RETENTION_LIMIT = 128;

export const PROFILE_MODULE_BOUNDARY: ModuleBoundary = {
  name: "profile",
  targetStage: "Stage 2",
  implemented: true,
  owns: [
    "Profile public record and module envelope contract",
    "Profile local store and cloud snapshot replacement ports",
    "Profile local store bootstrap, CAS, command receipt, game-owned write API, cloud CAS conflict detection, and server-wins conflict resolution",
  ],
  nonGoals: [
    "No production cloud snapshot HTTP backend without an injected cloud snapshot port",
    "No legacy save data conversion or game-specific profile module implementation",
    "No production storage backend without an injected local store port",
  ],
};

export type ProfileJsonPrimitive = string | number | boolean | null;
export type ProfileJsonValue =
  | ProfileJsonPrimitive
  | ProfileJsonObject
  | readonly ProfileJsonValue[];

export interface ProfileJsonObject {
  readonly [key: string]: ProfileJsonValue;
}

export type ProfileModuleOwner = "foundation" | `sdk:${string}` | `game:${string}`;
export type ProfileSyncStatus = "local_only" | "dirty" | "synced" | "conflict";
export type ProfileConflictReason =
  | "revision_conflict"
  | "resolver_failed"
  | "invalid_server_snapshot";
export type ProfileCommandResultKind = "applied" | "replayed";
export type ProfileCloudSyncSkippedReason =
  | "disabled"
  | "account_missing"
  | "cloud_port_missing"
  | "no_local_store";
export type ProfileConflictResolutionStrategy = "use_server" | "use_local" | "custom";

export interface ProfileSyncCheckpoint {
  readonly status: ProfileSyncStatus;
  readonly lastSyncedLocalRevision: number | null;
  readonly conflictReason?: ProfileConflictReason;
  readonly conflictCloudRevision?: string;
  readonly updatedAtMs?: number;
}

export interface ProfileCommandReceipt {
  readonly commandKey: string;
  readonly commandType: string;
  readonly payloadHash: string;
  readonly appliedLocalRevision: number;
  readonly status: "applied";
  readonly createdAtMs: number;
}

export interface ProfileModuleEnvelope<TData extends ProfileJsonObject = ProfileJsonObject> {
  readonly moduleId: string;
  readonly moduleVersion: number;
  readonly moduleRevision: number;
  readonly owner: ProfileModuleOwner;
  readonly data: TData;
  readonly updatedAtMs: number;
}

export interface PlayerProfileRecord {
  readonly schemaVersion: number;
  readonly accountId?: string | null;
  readonly recordRevision: number;
  readonly localRevision: number;
  readonly cloudRevision: string | null;
  readonly modules: Readonly<Record<string, ProfileModuleEnvelope>>;
  readonly syncCheckpoint: ProfileSyncCheckpoint;
  readonly commandReceipts: Readonly<Record<string, ProfileCommandReceipt>>;
  readonly updatedAtMs: number;
}

export interface ProfileRuntimeSnapshot {
  readonly record: PlayerProfileRecord | null;
  readonly status: ProfileSyncStatus | "unavailable";
  readonly enabled: boolean;
  readonly localStoreConfigured: boolean;
  readonly cloudSnapshotConfigured: boolean;
  readonly commandReceiptRetentionLimit: number;
  readonly generatedAtMs: number;
}

export interface SaveProfileModuleInput<TData extends ProfileJsonObject = ProfileJsonObject> {
  readonly commandKey: string;
  readonly moduleId: string;
  readonly moduleVersion: number;
  readonly expectedModuleRevision: number | null;
  readonly owner: `game:${string}`;
  readonly data: TData;
}

export type SaveProfileModuleOutput<TData extends ProfileJsonObject = ProfileJsonObject> =
  | SaveProfileModuleAppliedOutput<TData>
  | SaveProfileModuleReplayedOutput<TData>;

export interface SaveProfileModuleAppliedOutput<TData extends ProfileJsonObject = ProfileJsonObject> {
  readonly kind: "applied";
  readonly record: PlayerProfileRecord;
  readonly module: ProfileModuleEnvelope<TData>;
  readonly receipt: ProfileCommandReceipt;
}

export interface SaveProfileModuleReplayedOutput<TData extends ProfileJsonObject = ProfileJsonObject> {
  readonly kind: "replayed";
  readonly record: PlayerProfileRecord;
  readonly moduleId: string;
  readonly currentModule: ProfileModuleEnvelope<TData> | null;
  readonly receipt: ProfileCommandReceipt;
}

export type ProfileModuleMissingStrategy = "return_null" | "fail";

export interface ProfileModuleNormalizeInput {
  readonly moduleId: string;
  readonly moduleVersion: number;
  readonly owner: ProfileModuleOwner;
  readonly data: ProfileJsonObject;
  readonly exists: boolean;
  readonly nowMs: number;
}

export type ProfileModuleNormalizer<TData extends ProfileJsonObject = ProfileJsonObject> = (
  input: ProfileModuleNormalizeInput,
) => Result<TData, SdkError>;

export interface ReadProfileModuleInput<TData extends ProfileJsonObject = ProfileJsonObject> {
  readonly moduleId: string;
  readonly moduleVersion: number;
  readonly owner: ProfileModuleOwner;
  readonly missing?: ProfileModuleMissingStrategy;
  readonly normalize?: ProfileModuleNormalizer<TData>;
}

export type ReadProfileModuleOutput<TData extends ProfileJsonObject = ProfileJsonObject> =
  | ReadProfileModuleFoundOutput<TData>
  | ReadProfileModuleMissingOutput;

export interface ReadProfileModuleFoundOutput<TData extends ProfileJsonObject = ProfileJsonObject> {
  readonly kind: "found";
  readonly record: PlayerProfileRecord;
  readonly module: ProfileModuleEnvelope<TData>;
  readonly data: TData;
}

export interface ReadProfileModuleMissingOutput {
  readonly kind: "missing";
  readonly record: PlayerProfileRecord | null;
  readonly moduleId: string;
  readonly module: null;
  readonly data: null;
}

export interface CreateDefaultProfileModuleInput {
  readonly moduleId: string;
  readonly moduleVersion: number;
  readonly owner: `game:${string}`;
  readonly nowMs: number;
}

export type CreateDefaultProfileModule<TData extends ProfileJsonObject = ProfileJsonObject> = (
  input: CreateDefaultProfileModuleInput,
) => TData;

export type UpdateProfileModuleMode = "apply" | "replay";

export interface UpdateProfileModuleContext<TData extends ProfileJsonObject = ProfileJsonObject> {
  readonly moduleId: string;
  readonly moduleVersion: number;
  readonly owner: `game:${string}`;
  readonly data: TData;
  readonly exists: boolean;
  readonly nowMs: number;
  readonly mode: UpdateProfileModuleMode;
}

export type UpdateProfileModuleDecision<
  TData extends ProfileJsonObject = ProfileJsonObject,
  TMeta = undefined,
> =
  | {
      readonly kind: "noop";
      readonly meta?: TMeta;
    }
  | {
      readonly kind: "update";
      readonly data: TData;
      readonly meta?: TMeta;
    };

export type UpdateProfileModuleResult<
  TData extends ProfileJsonObject = ProfileJsonObject,
  TMeta = undefined,
> =
  | UpdateProfileModuleDecision<TData, TMeta>
  | Result<UpdateProfileModuleDecision<TData, TMeta>, SdkError>;

export type UpdateProfileModuleHandler<
  TData extends ProfileJsonObject = ProfileJsonObject,
  TMeta = undefined,
> = (
  input: UpdateProfileModuleContext<TData>,
) => UpdateProfileModuleResult<TData, TMeta>;

export interface UpdateProfileModuleInput<
  TData extends ProfileJsonObject = ProfileJsonObject,
  TMeta = undefined,
> {
  readonly commandKey: string;
  readonly commandPayload: ProfileJsonObject;
  readonly moduleId: string;
  readonly moduleVersion: number;
  readonly owner: `game:${string}`;
  readonly createDefault?: CreateDefaultProfileModule<TData>;
  readonly normalize?: ProfileModuleNormalizer<TData>;
  readonly update: UpdateProfileModuleHandler<TData, TMeta>;
}

export type UpdateProfileModuleOutput<
  TData extends ProfileJsonObject = ProfileJsonObject,
  TMeta = undefined,
> =
  | UpdateProfileModuleAppliedOutput<TData, TMeta>
  | UpdateProfileModuleReplayedOutput<TData, TMeta>
  | UpdateProfileModuleNoopOutput<TData, TMeta>;

export interface UpdateProfileModuleAppliedOutput<
  TData extends ProfileJsonObject = ProfileJsonObject,
  TMeta = undefined,
> {
  readonly kind: "applied";
  readonly record: PlayerProfileRecord;
  readonly module: ProfileModuleEnvelope<TData>;
  readonly data: TData;
  readonly receipt: ProfileCommandReceipt;
  readonly meta?: TMeta;
}

export interface UpdateProfileModuleReplayedOutput<
  TData extends ProfileJsonObject = ProfileJsonObject,
  TMeta = undefined,
> {
  readonly kind: "replayed";
  readonly record: PlayerProfileRecord;
  readonly moduleId: string;
  readonly module: ProfileModuleEnvelope<TData> | null;
  readonly data: TData | null;
  readonly receipt: ProfileCommandReceipt;
  readonly meta?: TMeta;
}

export interface UpdateProfileModuleNoopOutput<
  TData extends ProfileJsonObject = ProfileJsonObject,
  TMeta = undefined,
> {
  readonly kind: "noop";
  readonly record: PlayerProfileRecord;
  readonly module: ProfileModuleEnvelope<TData> | null;
  readonly data: TData;
  readonly meta?: TMeta;
}

export interface SyncCloudSnapshotInput {
  readonly traceId?: string;
}

export interface SyncCloudSnapshotOutput {
  readonly status: "completed" | "skipped" | "conflict";
  readonly record: PlayerProfileRecord | null;
  readonly cloudRevision: string | null;
  readonly skippedReason?: ProfileCloudSyncSkippedReason;
  readonly conflict?: ProfileConflictSnapshot;
}

export interface ResolveProfileConflictInput {
  readonly commandKey?: string;
  readonly strategy?: ProfileConflictResolutionStrategy;
  readonly traceId?: string;
}

export interface ResolveProfileConflictOutput {
  readonly status: "resolved" | "skipped";
  readonly strategy: ProfileConflictResolutionStrategy;
  readonly record: PlayerProfileRecord | null;
  readonly kind?: ProfileCommandResultKind;
  readonly receipt?: ProfileCommandReceipt;
  readonly skippedReason?: "no_conflict" | "disabled" | "resolver_missing";
}

export interface ProfileSnapshotChangedEvent {
  readonly snapshot: ProfileRuntimeSnapshot;
}

export type ProfileSnapshotChangedListener = (event: ProfileSnapshotChangedEvent) => void;

export interface ProfileLocalStoreLoadInput {
  readonly scope?: string;
}

export interface ProfileLocalStoreSaveInput {
  readonly scope?: string;
  readonly expectedRecordRevision: number | null;
  readonly record: PlayerProfileRecord;
}

export interface ProfileLocalStorePort {
  load(input?: ProfileLocalStoreLoadInput): Promise<Result<PlayerProfileRecord | null, SdkError>>;
  save(input: ProfileLocalStoreSaveInput): Promise<Result<PlayerProfileRecord, SdkError>>;
  clear?(input?: ProfileLocalStoreLoadInput): Promise<Result<void, SdkError>>;
}

export interface ProfileCloudSnapshotPullInput {
  readonly accountId: string;
  readonly accessToken?: string;
  readonly traceId?: string;
}

export type ProfileCloudSnapshotPullResult =
  | {
      readonly status: "ok";
      readonly cloudRevision: string;
      readonly snapshot: PlayerProfileRecord;
      readonly serverTimeMs?: number;
      readonly raw?: unknown;
    }
  | {
      readonly status: "not_found";
      readonly cloudRevision: null;
      readonly serverTimeMs?: number;
      readonly raw?: unknown;
    };

export interface ProfileCloudSnapshotPushInput {
  readonly accountId: string;
  readonly accessToken?: string;
  readonly expectedCloudRevision: string | null;
  readonly snapshot: PlayerProfileRecord;
  readonly traceId?: string;
}

export type ProfileCloudSnapshotPushResult =
  | {
      readonly status: "ok";
      readonly cloudRevision: string;
      readonly serverTimeMs?: number;
      readonly raw?: unknown;
    }
  | {
      readonly status: "revision_conflict";
      readonly cloudRevision: string;
      readonly latestSnapshot: PlayerProfileRecord;
      readonly serverTimeMs?: number;
      readonly raw?: unknown;
    };

export interface ProfileCloudSnapshotPort {
  pullSnapshot(
    input: ProfileCloudSnapshotPullInput,
  ): Promise<Result<ProfileCloudSnapshotPullResult, SdkError>>;
  pushSnapshot(
    input: ProfileCloudSnapshotPushInput,
  ): Promise<Result<ProfileCloudSnapshotPushResult, SdkError>>;
}

export interface ProfileConflictSnapshot {
  readonly reason: ProfileConflictReason;
  readonly localRecord: PlayerProfileRecord | null;
  readonly serverRecord: PlayerProfileRecord;
  readonly cloudRevision: string;
}

export interface ProfileConflictResolverInput {
  readonly conflict: ProfileConflictSnapshot;
  readonly strategy: ProfileConflictResolutionStrategy;
}

export type ProfileConflictResolverOutput =
  | {
      readonly strategy: "use_server";
    }
  | {
      readonly strategy: "use_local";
    };

export type ProfileConflictResolver = (
  input: ProfileConflictResolverInput,
) => Promise<Result<ProfileConflictResolverOutput, SdkError>> | Result<ProfileConflictResolverOutput, SdkError>;

export interface ProfileModuleValidatorInput<TData extends ProfileJsonObject = ProfileJsonObject> {
  readonly moduleId: string;
  readonly moduleVersion: number;
  readonly owner: ProfileModuleOwner;
  readonly data: TData;
}

export type ProfileModuleValidator<TData extends ProfileJsonObject = ProfileJsonObject> = (
  input: ProfileModuleValidatorInput<TData>,
) => Result<TData, SdkError>;

export interface ProfileModuleConfig {
  readonly enabled?: boolean;
  readonly localStore?: ProfileLocalStorePort;
  readonly cloudSnapshotPort?: ProfileCloudSnapshotPort;
  readonly moduleValidators?: readonly ProfileModuleValidator[];
  readonly conflictResolver?: ProfileConflictResolver;
  readonly commandReceiptRetentionLimit?: number;
  readonly autoSync?: boolean;
}

export interface ProfileService {
  getSnapshot(): Promise<Result<ProfileRuntimeSnapshot, SdkError>>;
  readModule<TData extends ProfileJsonObject>(
    input: ReadProfileModuleInput<TData>,
  ): Promise<Result<ReadProfileModuleOutput<TData>, SdkError>>;
  updateModule<TData extends ProfileJsonObject, TMeta = undefined>(
    input: UpdateProfileModuleInput<TData, TMeta>,
  ): Promise<Result<UpdateProfileModuleOutput<TData, TMeta>, SdkError>>;
  saveModule<TData extends ProfileJsonObject>(
    input: SaveProfileModuleInput<TData>,
  ): Promise<Result<SaveProfileModuleOutput<TData>, SdkError>>;
  syncCloudSnapshot(input?: SyncCloudSnapshotInput): Promise<Result<SyncCloudSnapshotOutput, SdkError>>;
  resolveConflict(
    input?: ResolveProfileConflictInput,
  ): Promise<Result<ResolveProfileConflictOutput, SdkError>>;
  onSnapshotChanged(listener: ProfileSnapshotChangedListener): Unsubscribe;
  destroy(): void | Promise<void>;
}

export interface DisabledProfileServiceOptions {
  readonly enabled?: boolean;
  readonly localStoreConfigured?: boolean;
  readonly cloudSnapshotConfigured?: boolean;
  readonly commandReceiptRetentionLimit?: number;
  readonly now?: () => number;
}
