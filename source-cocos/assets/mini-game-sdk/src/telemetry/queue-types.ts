import type { SdkError } from "../core";
import type { TelemetryEvent } from "./types";

export interface TelemetryQueueItem {
  event: TelemetryEvent;
  readonly restoredFromStorage: boolean;
  attempts: number;
  deviceIdFinalized: boolean;
  debugRecorded: boolean;
}

export interface SendTelemetryBatchOutcome {
  readonly ok: boolean;
  readonly accepted: number;
  readonly rejected: number;
  readonly retryable?: boolean;
  readonly retryAfterMs?: number;
  readonly httpStatus?: number;
  readonly error?: SdkError;
}

export interface TelemetryAckResolution {
  readonly acceptedItems: Set<TelemetryQueueItem>;
  readonly rejectedItems: Set<TelemetryQueueItem>;
  readonly processedItems: Set<TelemetryQueueItem>;
  readonly unconfirmedItems: TelemetryQueueItem[];
}
