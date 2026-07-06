import type { Clock } from "./clock";
import type { MiniGameSdkConfig, PlatformTarget } from "./config";
import type { CapabilityFailureReason } from "../platform/types";
import type { EventBus, EventMap } from "./event-bus";
import type { SdkErrorCode } from "./errors";
import type { Logger } from "./logger";

export interface SdkEventMap extends EventMap {
  "sdk.initialized": { readonly atMs: number };
  "sdk.started": { readonly atMs: number };
  "sdk.destroyed": { readonly atMs: number; readonly flushAttempted?: boolean };
  "platform.launch": {
    readonly atMs: number;
    readonly target: PlatformTarget;
    readonly launchOptions?: unknown;
  };
  "platform.show": {
    readonly atMs: number;
    readonly target: PlatformTarget;
    readonly launchOptions?: unknown;
    readonly backgroundDurationMs?: number;
  };
  "platform.hide": {
    readonly atMs: number;
    readonly target: PlatformTarget;
    readonly foregroundDurationMs?: number;
  };
  "platform.rewarded_video.started": {
    readonly atMs: number;
    readonly target: PlatformTarget;
    readonly placementId: string;
  };
  "platform.rewarded_video.ended": {
    readonly atMs: number;
    readonly target: PlatformTarget;
    readonly placementId: string;
    readonly status: "completed" | "closed" | "failed";
    readonly reason?: CapabilityFailureReason;
  };
  "account.session.started": {
    readonly atMs: number;
    readonly accountId: string;
    readonly platform: PlatformTarget;
    readonly expiresAtMs?: number;
  };
  "account.session.cleared": {
    readonly atMs: number;
    readonly reason?: string;
  };
  "account.login.failed": {
    readonly atMs: number;
    readonly code: SdkErrorCode;
    readonly message: string;
  };
  "profile.module.saved": {
    readonly atMs: number;
    readonly moduleId: string;
    readonly moduleVersion: number;
    readonly moduleRevision: number;
    readonly owner: string;
    readonly localRevision: number;
    readonly commandKey: string;
    readonly result: "applied";
  };
  "profile.command.failed": {
    readonly atMs: number;
    readonly commandType: string;
    readonly commandKey?: string;
    readonly code: SdkErrorCode;
    readonly message: string;
  };
  "profile.sync.started": {
    readonly atMs: number;
    readonly accountId?: string;
    readonly traceId?: string;
  };
  "profile.sync.completed": {
    readonly atMs: number;
    readonly accountId?: string;
    readonly cloudRevision: string | null;
    readonly localRevision?: number;
    readonly traceId?: string;
  };
  "profile.sync.failed": {
    readonly atMs: number;
    readonly accountId?: string;
    readonly code: SdkErrorCode;
    readonly message: string;
    readonly traceId?: string;
  };
  "profile.sync.conflict_detected": {
    readonly atMs: number;
    readonly accountId?: string;
    readonly cloudRevision: string;
    readonly reason: "revision_conflict" | "resolver_failed" | "invalid_server_snapshot";
    readonly localRecordRevision: number;
    readonly localRevision: number;
    readonly localCloudRevision: string | null;
    readonly lastSyncedLocalRevision: number | null;
    readonly serverRecordRevision: number;
    readonly serverLocalRevision: number;
    readonly traceId?: string;
  };
  "profile.sync.resolved": {
    readonly atMs: number;
    readonly accountId?: string;
    readonly cloudRevision: string;
    readonly strategy: "use_server" | "use_local" | "custom";
    readonly localRevision: number;
    readonly traceId?: string;
  };
  "commerce.mutation.applied": {
    readonly atMs: number;
    readonly commandKey: string;
    readonly commandType: "grant" | "spend" | "claim";
    readonly source: string;
    readonly reason: string;
    readonly kind: "applied" | "replayed";
  };
  "commerce.claim.opportunity_upserted": {
    readonly atMs: number;
    readonly commandKey: string;
    readonly source: string;
    readonly reason: string;
    readonly sourceKey: string;
    readonly definitionHash: string;
    readonly kind: "created" | "updated" | "noop";
  };
  "commerce.command.failed": {
    readonly atMs: number;
    readonly commandType: "grant" | "spend" | "upsert_claim_opportunity" | "claim" | "can_afford";
    readonly code: SdkErrorCode;
    readonly message: string;
    readonly commandKey?: string;
    readonly source?: string;
    readonly reason?: string;
  };
  "telemetry.auth.updated": {
    readonly atMs: number;
    readonly authenticated: boolean;
    readonly accountId?: string;
  };
  "telemetry.flush.completed": {
    readonly atMs: number;
    readonly accepted: number;
    readonly rejected?: number;
  };
  "telemetry.flush.failed": {
    readonly atMs: number;
    readonly code: SdkErrorCode;
    readonly message: string;
    readonly retryable?: boolean;
  };
  "telemetry.event.dropped": {
    readonly atMs: number;
    readonly name: string;
    readonly reason:
      | "disabled"
      | "unknown_event"
      | "inactive_event"
      | "invalid_payload"
      | "oversize_payload"
      | "queue_full"
      | "sampled_out"
      | "transport_unavailable";
    readonly eventCategory?: string;
  };
}

export interface SdkRuntimeInfo {
  readonly sdkVersion: string;
  readonly createdAtMs: number;
}

export interface SdkContext {
  readonly config: MiniGameSdkConfig;
  readonly events: EventBus<SdkEventMap>;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly runtime: SdkRuntimeInfo;
}

export function createSdkContext(input: {
  readonly config: MiniGameSdkConfig;
  readonly events: EventBus<SdkEventMap>;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly sdkVersion: string;
}): SdkContext {
  return {
    config: input.config,
    events: input.events,
    logger: input.logger,
    clock: input.clock,
    runtime: {
      sdkVersion: input.sdkVersion,
      createdAtMs: input.clock.now(),
    },
  };
}
