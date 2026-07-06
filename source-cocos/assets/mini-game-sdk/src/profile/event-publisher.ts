import type { AccountSession } from "../account";
import type { SdkContext } from "../core/context";
import type { SdkError } from "../core/errors";
import { emitSdkEventAndWarn } from "../core/event-publisher";
import type {
  PlayerProfileRecord,
  ProfileConflictResolutionStrategy,
  ProfileConflictSnapshot,
  ProfileModuleEnvelope,
  SyncCloudSnapshotOutput,
} from "./types";

export interface ProfileSyncEventContext {
  readonly accountId?: string | undefined;
  readonly traceId?: string | undefined;
}

export class ProfileEventPublisher {
  constructor(private readonly context: SdkContext) {}

  moduleSaved(
    record: PlayerProfileRecord,
    module: ProfileModuleEnvelope,
    commandKey: string,
    result: "applied",
  ): void {
    emitSdkEventAndWarn(
      this.context,
      "profile.module.saved",
      {
        atMs: this.now(),
        moduleId: module.moduleId,
        moduleVersion: module.moduleVersion,
        moduleRevision: module.moduleRevision,
        owner: module.owner,
        localRevision: record.localRevision,
        commandKey,
        result,
      },
      "Profile module saved event handler failed.",
    );
  }

  syncStarted(session: AccountSession, traceId: string | undefined): void {
    emitSdkEventAndWarn(
      this.context,
      "profile.sync.started",
      {
        atMs: this.now(),
        accountId: session.accountId,
        ...(traceId === undefined ? {} : { traceId }),
      },
      "Profile sync started event handler failed.",
    );
  }

  syncCompleted(
    output: SyncCloudSnapshotOutput,
    context: ProfileSyncEventContext,
  ): void {
    emitSdkEventAndWarn(
      this.context,
      "profile.sync.completed",
      {
        atMs: this.now(),
        ...(context.accountId === undefined ? {} : { accountId: context.accountId }),
        cloudRevision: output.cloudRevision,
        ...(output.record === null ? {} : { localRevision: output.record.localRevision }),
        ...(context.traceId === undefined ? {} : { traceId: context.traceId }),
      },
      "Profile sync completed event handler failed.",
    );
  }

  syncFailed(error: SdkError, context: ProfileSyncEventContext): void {
    emitSdkEventAndWarn(
      this.context,
      "profile.sync.failed",
      {
        atMs: this.now(),
        ...(context.accountId === undefined ? {} : { accountId: context.accountId }),
        code: error.code,
        message: error.message,
        ...(context.traceId === undefined ? {} : { traceId: context.traceId }),
      },
      "Profile sync failed event handler failed.",
    );
  }

  syncConflict(conflict: ProfileConflictSnapshot, context: ProfileSyncEventContext): void {
    emitSdkEventAndWarn(
      this.context,
      "profile.sync.conflict_detected",
      {
        atMs: this.now(),
        ...(context.accountId === undefined ? {} : { accountId: context.accountId }),
        cloudRevision: conflict.cloudRevision,
        reason: conflict.reason,
        localRecordRevision: conflict.localRecord?.recordRevision ?? 0,
        localRevision: conflict.localRecord?.localRevision ?? 0,
        localCloudRevision: conflict.localRecord?.cloudRevision ?? null,
        lastSyncedLocalRevision: conflict.localRecord?.syncCheckpoint.lastSyncedLocalRevision ?? null,
        serverRecordRevision: conflict.serverRecord.recordRevision,
        serverLocalRevision: conflict.serverRecord.localRevision,
        ...(context.traceId === undefined ? {} : { traceId: context.traceId }),
      },
      "Profile sync conflict event handler failed.",
    );
  }

  syncResolved(
    record: PlayerProfileRecord,
    strategy: ProfileConflictResolutionStrategy,
    context: ProfileSyncEventContext,
  ): void {
    emitSdkEventAndWarn(
      this.context,
      "profile.sync.resolved",
      {
        atMs: this.now(),
        ...(context.accountId === undefined ? {} : { accountId: context.accountId }),
        cloudRevision: record.cloudRevision ?? "",
        strategy,
        localRevision: record.localRevision,
        ...(context.traceId === undefined ? {} : { traceId: context.traceId }),
      },
      "Profile sync resolved event handler failed.",
    );
  }

  commandFailed(commandType: string, commandKey: string | undefined, error: SdkError): void {
    emitSdkEventAndWarn(
      this.context,
      "profile.command.failed",
      {
        atMs: this.now(),
        commandType,
        ...(commandKey === undefined ? {} : { commandKey }),
        code: error.code,
        message: error.message,
      },
      "Profile command failed event handler failed.",
    );
  }

  private now(): number {
    return this.context.clock.now();
  }
}
