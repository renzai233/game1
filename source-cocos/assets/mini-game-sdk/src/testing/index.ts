import type { BackendRequest, BackendRequestInput, BackendResponse, Result } from "../core";
import {
  defineModuleBoundary,
  type ModuleBoundary,
  type ModulePlaceholder,
} from "../core/module-boundary";
import { fail, ok } from "../core";
import type {
  BackendSilentLoginInput,
  BackendSilentLoginOutput,
  BackendSilentLoginPort,
} from "../account";
import { SdkError } from "../core/errors";
import type {
  TelemetryDebugSink,
  TelemetryDroppedEvent,
  TelemetryEvent,
  TelemetryFlushDebugRecord,
  TelemetryStoragePort,
  TelemetryTransport,
  TelemetryTransportAck,
  TelemetryTransportBatch,
} from "../telemetry";
import type {
  PlayerProfileRecord,
  ProfileCloudSnapshotPort,
  ProfileLocalStoreLoadInput,
  ProfileLocalStorePort,
  ProfileLocalStoreSaveInput,
} from "../profile";

export const TESTING_MODULE_BOUNDARY: ModuleBoundary = defineModuleBoundary({
  name: "testing",
  targetStage: "Stage 1+",
  implemented: false,
  owns: [
    "Mock platform helpers boundary",
    "Fake clock and in-memory adapter boundary",
    "Stage-specific smoke helper boundary",
  ],
  nonGoals: [
    "No testing helper implementation in Stage 0",
    "No dependency on a specific test runner",
    "No game project fixture",
  ],
});

export interface TestingHelpersPlaceholder
  extends ModulePlaceholder<typeof TESTING_MODULE_BOUNDARY> {}

export type FakeBackendSilentLoginHandler = (
  input: BackendSilentLoginInput,
) =>
  | BackendSilentLoginOutput
  | Result<BackendSilentLoginOutput, SdkError>
  | Promise<BackendSilentLoginOutput | Result<BackendSilentLoginOutput, SdkError>>;

export function createFakeBackendSilentLoginPort(
  handler: FakeBackendSilentLoginHandler,
): BackendSilentLoginPort {
  return {
    login: async (input) => {
      const result = await handler(input);
      return isResult(result) ? result : ok(result);
    },
  };
}

export type FakeBackendRequestHandler = (
  input: BackendRequestInput,
) => BackendResponse | Promise<BackendResponse>;

export function createFakeBackendRequest(handler: FakeBackendRequestHandler): BackendRequest {
  return async (input) => handler(input);
}

export type FakeTelemetryTransportHandler = (
  batch: TelemetryTransportBatch,
) =>
  | TelemetryTransportAck
  | Result<TelemetryTransportAck, SdkError>
  | Promise<TelemetryTransportAck | Result<TelemetryTransportAck, SdkError>>;

export function createFakeTelemetryTransport(
  handler: FakeTelemetryTransportHandler,
): TelemetryTransport {
  return {
    send: async (batch) => {
      const result = await handler(batch);
      return isTelemetryResult(result) ? result : ok(result);
    },
  };
}

export function createMemoryTelemetryStorage(
  initialValues: Readonly<Record<string, string>> = {},
): TelemetryStoragePort & { readonly values: Map<string, string> } {
  const values = new Map(Object.entries(initialValues));
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
}

export function createTelemetryDebugCollector(): TelemetryDebugSink & {
  readonly events: TelemetryEvent[];
  readonly drops: TelemetryDroppedEvent[];
  readonly flushes: TelemetryFlushDebugRecord[];
} {
  const events: TelemetryEvent[] = [];
  const drops: TelemetryDroppedEvent[] = [];
  const flushes: TelemetryFlushDebugRecord[] = [];
  return {
    events,
    drops,
    flushes,
    record: (event) => {
      events.push(event);
    },
    recordDrop: (drop) => {
      drops.push(drop);
    },
    recordFlush: (record) => {
      flushes.push(record);
    },
  };
}

export function createMemoryProfileLocalStore(
  initialRecord: PlayerProfileRecord | null = null,
): ProfileLocalStorePort & {
  readonly records: Map<string, PlayerProfileRecord>;
  setConflictOnce(): void;
} {
  const defaultScope = "default";
  const records = new Map<string, PlayerProfileRecord>();
  if (initialRecord !== null) {
    records.set(defaultScope, cloneProfileRecord(initialRecord));
  }
  let conflictOnce = false;

  return {
    records,
    setConflictOnce: () => {
      conflictOnce = true;
    },
    load: async (input: ProfileLocalStoreLoadInput = {}) => {
      const record = records.get(input.scope ?? defaultScope);
      return ok(record === undefined ? null : cloneProfileRecord(record));
    },
    save: async (input: ProfileLocalStoreSaveInput) => {
      const scope = input.scope ?? defaultScope;
      const current = records.get(scope);
      const currentRevision = current?.recordRevision ?? null;

      if (conflictOnce || currentRevision !== input.expectedRecordRevision) {
        conflictOnce = false;
        return {
          ok: false,
          error: new SdkError("profile.local_revision_conflict", "Profile local store CAS conflict.", {
            moduleName: "profile",
            metadata: {
              expectedRecordRevision: input.expectedRecordRevision,
              currentRecordRevision: currentRevision,
            },
          }),
        };
      }

      const record = cloneProfileRecord(input.record);
      records.set(scope, record);
      return ok(cloneProfileRecord(record));
    },
    clear: async (input: ProfileLocalStoreLoadInput = {}) => {
      records.delete(input.scope ?? defaultScope);
      return ok(undefined);
    },
  };
}

export function createFakeProfileCloudSnapshotPort(
  initialSnapshots: Readonly<Record<string, {
    readonly cloudRevision: string;
    readonly snapshot: PlayerProfileRecord;
    readonly serverTimeMs?: number;
  }>> = {},
): ProfileCloudSnapshotPort & {
  readonly snapshots: Map<string, {
    cloudRevision: string;
    snapshot: PlayerProfileRecord;
    serverTimeMs?: number;
  }>;
  readonly pulls: Array<{ accountId: string; accessToken?: string; traceId?: string }>;
  readonly pushes: Array<{
    accountId: string;
    accessToken?: string;
    expectedCloudRevision: string | null;
    snapshot: PlayerProfileRecord;
    traceId?: string;
  }>;
  putSnapshot(
    accountId: string,
    entry: { readonly cloudRevision: string; readonly snapshot: PlayerProfileRecord; readonly serverTimeMs?: number },
  ): void;
} {
  const snapshots = new Map<string, {
    cloudRevision: string;
    snapshot: PlayerProfileRecord;
    serverTimeMs?: number;
  }>();
  for (const [accountId, entry] of Object.entries(initialSnapshots)) {
    snapshots.set(accountId, {
      cloudRevision: entry.cloudRevision,
      snapshot: cloneProfileRecord(entry.snapshot),
      ...(entry.serverTimeMs === undefined ? {} : { serverTimeMs: entry.serverTimeMs }),
    });
  }
  const pulls: Array<{ accountId: string; accessToken?: string; traceId?: string }> = [];
  const pushes: Array<{
    accountId: string;
    accessToken?: string;
    expectedCloudRevision: string | null;
    snapshot: PlayerProfileRecord;
    traceId?: string;
  }> = [];

  return {
    snapshots,
    pulls,
    pushes,
    putSnapshot: (accountId, entry) => {
      snapshots.set(accountId, {
        cloudRevision: entry.cloudRevision,
        snapshot: cloneProfileRecord(entry.snapshot),
        ...(entry.serverTimeMs === undefined ? {} : { serverTimeMs: entry.serverTimeMs }),
      });
    },
    pullSnapshot: async (input) => {
      pulls.push({
        accountId: input.accountId,
        ...(input.accessToken === undefined ? {} : { accessToken: input.accessToken }),
        ...(input.traceId === undefined ? {} : { traceId: input.traceId }),
      });
      const entry = snapshots.get(input.accountId);
      if (entry === undefined) {
        return ok({
          status: "not_found",
          cloudRevision: null,
        });
      }

      return ok({
        status: "ok",
        cloudRevision: entry.cloudRevision,
        snapshot: cloneProfileRecord(entry.snapshot),
        ...(entry.serverTimeMs === undefined ? {} : { serverTimeMs: entry.serverTimeMs }),
      });
    },
    pushSnapshot: async (input) => {
      pushes.push({
        accountId: input.accountId,
        ...(input.accessToken === undefined ? {} : { accessToken: input.accessToken }),
        expectedCloudRevision: input.expectedCloudRevision,
        snapshot: cloneProfileRecord(input.snapshot),
        ...(input.traceId === undefined ? {} : { traceId: input.traceId }),
      });
      const current = snapshots.get(input.accountId);
      const currentRevision = current?.cloudRevision ?? null;
      if (currentRevision !== input.expectedCloudRevision) {
        if (current === undefined) {
          return fail(
            new SdkError("profile.cloud_revision_conflict", "Profile cloud snapshot is missing.", {
              moduleName: "profile",
              metadata: {
                accountId: input.accountId,
                expectedCloudRevision: input.expectedCloudRevision,
              },
            }),
          );
        }

        return ok({
          status: "revision_conflict",
          cloudRevision: current.cloudRevision,
          latestSnapshot: cloneProfileRecord(current.snapshot),
          ...(current.serverTimeMs === undefined ? {} : { serverTimeMs: current.serverTimeMs }),
        });
      }

      const nextRevision = createNextCloudRevision(currentRevision);
      const snapshot = cloneProfileRecord({
        ...input.snapshot,
        cloudRevision: nextRevision,
      });
      snapshots.set(input.accountId, {
        cloudRevision: nextRevision,
        snapshot,
      });
      return ok({
        status: "ok",
        cloudRevision: nextRevision,
      });
    },
  };
}

function isResult(value: unknown): value is Result<BackendSilentLoginOutput, SdkError> {
  return typeof value === "object" && value !== null && "ok" in value;
}

function isTelemetryResult(
  value: unknown,
): value is Result<TelemetryTransportAck, SdkError> {
  return typeof value === "object" && value !== null && "ok" in value;
}

function cloneProfileRecord(record: PlayerProfileRecord): PlayerProfileRecord {
  return JSON.parse(JSON.stringify(record)) as PlayerProfileRecord;
}

function createNextCloudRevision(currentRevision: string | null): string {
  if (currentRevision === null) {
    return "rev_1";
  }

  const match = /^rev_(\d+)$/.exec(currentRevision);
  if (match === null) {
    return `${currentRevision}:next`;
  }

  return `rev_${Number(match[1]) + 1}`;
}
