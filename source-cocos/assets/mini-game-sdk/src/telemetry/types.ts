import type {
  BackendRequest,
  PlatformTarget,
  Result,
  SdkError,
  TelemetryQueueConfig,
} from "../core";
import type { ModuleBoundary } from "../core/module-boundary";

export const TELEMETRY_MODULE_BOUNDARY: ModuleBoundary = {
  name: "telemetry",
  targetStage: "Stage 1",
  implemented: true,
  owns: [
    "Tracking plan registry and payload validation",
    "Telemetry context, session, and queue lifecycle",
    "Backend batch transport and advanced replacement ports",
  ],
  nonGoals: [
    "No game event catalog",
    "No profile, save, commerce, or operations ownership",
    "No hard-coded backend URL, app id, or ingest key",
  ],
};

export type TelemetryPrimitive = string | number | boolean | null;
export type TelemetryPayloadValue = TelemetryPrimitive | readonly TelemetryPrimitive[];
export type TelemetryPayload = Readonly<Record<string, TelemetryPayloadValue>>;
export type TelemetryEventCategory =
  | "session"
  | "behavior"
  | "progression"
  | "economy"
  | "error"
  | "ad";

export type TelemetryPayloadValidator<TPayload extends TelemetryPayload = TelemetryPayload> = (
  eventName: string,
  payload: TPayload,
) => Result<TPayload, SdkError>;

export interface TrackingPlanEvent<TPayload extends TelemetryPayload = TelemetryPayload> {
  readonly name: string;
  readonly version?: number;
  readonly category: TelemetryEventCategory;
  readonly active?: boolean;
  readonly required?: readonly (keyof TPayload & string)[];
  readonly validator?: TelemetryPayloadValidator<TPayload>;
  readonly maxPayloadBytes?: number;
  readonly description?: string;
}

export interface TrackingPlan {
  readonly name: string;
  readonly version?: string;
  readonly events: readonly TrackingPlanEvent[];
}

export interface TelemetryContext {
  readonly gameId: string;
  readonly appVersion: string;
  readonly environment: string;
  readonly platform?: PlatformTarget;
  readonly accountId?: string;
  readonly sessionId: string;
  readonly deviceId: string;
  readonly sdkVersion: string;
  readonly launchScene?: string;
  readonly channel?: string;
  readonly eventTimeMs: number;
  readonly sequenceId: number;
}

export interface TelemetryEvent<TPayload extends TelemetryPayload = TelemetryPayload> {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly category: TelemetryEventCategory;
  readonly payload: TPayload;
  readonly context: TelemetryContext;
  readonly createdAtMs: number;
}

export interface TelemetryTrackOptions {
  readonly eventId?: string;
  readonly atMs?: number;
  readonly version?: number;
}

export interface TelemetryTransportBatch {
  readonly requestId: string;
  readonly events: readonly TelemetryEvent[];
  readonly sentAtMs: number;
  readonly sessionId: string;
}

export interface TelemetryRejectedEvent {
  readonly index?: number;
  readonly eventId?: string;
  readonly reason: string;
  readonly raw?: unknown;
}

export interface TelemetryTransportAck {
  readonly requestId?: string;
  readonly acceptedCount: number;
  readonly acceptedIds?: readonly string[];
  readonly rejected?: readonly TelemetryRejectedEvent[];
  readonly duplicatedIds?: readonly string[];
  readonly retryable?: boolean;
  readonly splitAndRetry?: boolean;
  readonly authExpired?: boolean;
  readonly dropWholeBatch?: boolean;
  readonly retryAfterMs?: number;
  readonly httpStatus?: number;
  readonly raw?: unknown;
}

export interface TelemetryTransport {
  send(batch: TelemetryTransportBatch): Promise<Result<TelemetryTransportAck, SdkError>>;
}

export interface TelemetryAuthState {
  readonly authenticated: boolean;
  readonly accountId?: string;
  readonly expiresAtMs?: number;
  readonly reason?: string;
}

export interface TelemetryTokenProvider {
  getAuthState(): Promise<Result<TelemetryAuthState, SdkError>>;
  refreshAuthState?(): Promise<Result<TelemetryAuthState, SdkError>>;
}

export interface TelemetryStoragePort {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface TelemetryDroppedEvent {
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
  readonly category?: TelemetryEventCategory;
  readonly eventId?: string;
  readonly message?: string;
}

export interface TelemetryFlushDebugRecord {
  readonly ok: boolean;
  readonly accepted: number;
  readonly rejected: number;
  readonly retryable?: boolean;
  readonly httpStatus?: number;
  readonly message?: string;
}

export interface TelemetryDebugSink {
  record(event: TelemetryEvent): void;
  recordDrop?(drop: TelemetryDroppedEvent): void;
  recordFlush?(record: TelemetryFlushDebugRecord): void;
}

export interface TelemetryService {
  registerTrackingPlan(plan: TrackingPlan): Result<void, SdkError>;
  track<TPayload extends TelemetryPayload>(
    name: string,
    payload: TPayload,
    options?: TelemetryTrackOptions,
  ): TelemetryEvent<TPayload> | null;
  flush(): Promise<Result<void, SdkError>>;
  destroy(): Promise<void>;
}

export interface DisabledTelemetryServiceOptions {
  readonly enabled?: boolean;
}

export interface CreateTelemetryServiceOptions {
  readonly context: import("../core").SdkContext;
  readonly platform: import("../platform").PlatformFacade;
  readonly account: import("../account").AccountService;
  readonly enabled?: boolean;
  readonly autoTrackSdkEvents?: boolean;
  readonly queue?: TelemetryQueueConfig;
  readonly trackingPlan?: TrackingPlan;
  readonly payloadValidator?: TelemetryPayloadValidator;
  readonly transport?: TelemetryTransport;
  readonly tokenProvider?: TelemetryTokenProvider;
  readonly storage?: TelemetryStoragePort;
  readonly debugSinks?: readonly TelemetryDebugSink[];
  readonly deviceId?: string;
  readonly deviceIdStorageKey?: string;
  readonly pendingStorageKey?: string;
}

export interface BackendTelemetryTransportConfig {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly telemetryBatchPath?: string;
  readonly telemetryAppId?: string;
  readonly telemetryIngestKey?: string;
  readonly telemetryEnvironment?: string;
  readonly request?: BackendRequest;
}

export interface DefaultTelemetryTokenProviderConfig {
  readonly telemetryAppId?: string;
  readonly telemetryIngestKey?: string;
  readonly telemetryEnvironment?: string;
}
