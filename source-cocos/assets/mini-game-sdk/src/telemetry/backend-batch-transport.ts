import {
  DEFAULT_BACKEND_TELEMETRY_BATCH_PATH,
  type BackendRequest,
  type BackendResponse,
} from "../core/config";
import { createFetchBackendRequest, resolveBackendUrl } from "../core/backend-request";
import { SdkError } from "../core/errors";
import { isRecord } from "../core/record-reader";
import { fail, ok, type Result } from "../core/result";
import type {
  BackendTelemetryTransportConfig,
  TelemetryRejectedEvent,
  TelemetryTransport,
  TelemetryTransportAck,
  TelemetryTransportBatch,
} from "./types";

const DEFAULT_TIMEOUT_MS = 10000;
const SDK_WIRE_NAME = "mini-game-sdk";
export const TELEMETRY_HEADER_APP_ID = "X-App-ID";
export const TELEMETRY_HEADER_INGEST_KEY = "X-Ingest-Key";
export const TELEMETRY_HEADER_ENVIRONMENT = "X-Environment";

export function createBackendTelemetryTransport(
  config: BackendTelemetryTransportConfig,
): TelemetryTransport {
  return new BackendBatchTelemetryTransport(config);
}

class BackendBatchTelemetryTransport implements TelemetryTransport {
  private readonly request: BackendRequest;

  constructor(private readonly config: BackendTelemetryTransportConfig) {
    this.request =
      config.request ??
      createFetchBackendRequest({
        unavailableCode: "telemetry.transport_failed",
        unavailableMessage: "No telemetry request implementation is available.",
        moduleName: "telemetry",
      });
  }

  async send(batch: TelemetryTransportBatch): Promise<Result<TelemetryTransportAck, SdkError>> {
    if (batch.events.length === 0) {
      return ok({
        requestId: batch.requestId,
        acceptedCount: 0,
        rejected: [],
      });
    }

    const authValidation = validateTelemetryBackendConfig(this.config);
    if (!authValidation.ok) {
      return authValidation;
    }

    const telemetryAppId = this.config.telemetryAppId;
    const telemetryIngestKey = this.config.telemetryIngestKey;
    const telemetryEnvironment = this.config.telemetryEnvironment;
    if (
      telemetryAppId === undefined ||
      telemetryIngestKey === undefined ||
      telemetryEnvironment === undefined
    ) {
      return fail(
        new SdkError("telemetry.auth_failed", "Telemetry backend config is incomplete.", {
          moduleName: "telemetry",
        }),
      );
    }

    let response: BackendResponse;
    try {
      response = await this.request({
        url: resolveBatchUrl(this.config),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [TELEMETRY_HEADER_APP_ID]: telemetryAppId,
          [TELEMETRY_HEADER_INGEST_KEY]: telemetryIngestKey,
          [TELEMETRY_HEADER_ENVIRONMENT]: telemetryEnvironment,
        },
        body: toWireEnvelope(batch, telemetryEnvironment),
        timeoutMs: this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
    } catch (error) {
      return fail(
        SdkError.fromUnknown("telemetry.transport_failed", "Telemetry batch request failed.", error, {
          moduleName: "telemetry",
        }),
      );
    }

    return normalizeTelemetryTransportResponse(batch, response.status, response.body);
  }
}

export function normalizeTelemetryTransportResponse(
  batch: TelemetryTransportBatch,
  status: number,
  body: unknown,
): Result<TelemetryTransportAck, SdkError> {
  if (status === 200 || status === 202) {
    return ok(normalizeSuccessBody(batch, status, body));
  }

  if (status === 400) {
    return ok({
      requestId: readRequestId(body) ?? batch.requestId,
      acceptedCount: 0,
      rejected: batch.events.map((event, index) => ({
        index,
        eventId: event.id,
        reason: "request_malformed",
      })),
      dropWholeBatch: true,
      httpStatus: status,
      raw: body,
    });
  }

  if (status === 401) {
    return ok({
      requestId: readRequestId(body) ?? batch.requestId,
      acceptedCount: 0,
      authExpired: true,
      httpStatus: status,
      raw: body,
    });
  }

  if (status === 413) {
    return ok({
      requestId: readRequestId(body) ?? batch.requestId,
      acceptedCount: 0,
      retryable: true,
      splitAndRetry: true,
      httpStatus: status,
      raw: body,
    });
  }

  if (status === 429 || status >= 500) {
    return ok({
      requestId: readRequestId(body) ?? batch.requestId,
      acceptedCount: 0,
      retryable: true,
      httpStatus: status,
      raw: body,
    });
  }

  return ok({
    requestId: readRequestId(body) ?? batch.requestId,
    acceptedCount: 0,
    rejected: batch.events.map((event, index) => ({
      index,
      eventId: event.id,
      reason: `http_${status}`,
    })),
    dropWholeBatch: true,
    httpStatus: status,
    raw: body,
  });
}

function normalizeSuccessBody(
  batch: TelemetryTransportBatch,
  status: number,
  body: unknown,
): TelemetryTransportAck {
  if (!isRecord(body)) {
    return {
      requestId: batch.requestId,
      acceptedCount: batch.events.length,
      rejected: [],
      httpStatus: status,
      raw: body,
    };
  }

  const invalid = readRejectedArray(body["invalid"]);
  const rejected = readRejectedArray(body["rejected"]);
  const acceptedArray = readIdArray(body["accepted"]);
  const duplicatedIds = readIdArray(body["duplicated"]);

  if (acceptedArray !== undefined || duplicatedIds !== undefined || rejected !== undefined) {
    const rejectedEvents = rejected ?? [];
    const acceptedCount = countArrayStyleAccepted(
      batch.events.length,
      acceptedArray,
      duplicatedIds,
      rejectedEvents,
    );
    return {
      requestId: readRequestId(body) ?? batch.requestId,
      acceptedCount,
      ...(acceptedArray === undefined ? {} : { acceptedIds: acceptedArray }),
      rejected: rejectedEvents,
      ...(duplicatedIds === undefined ? {} : { duplicatedIds }),
      httpStatus: status,
      raw: body,
    };
  }

  const acceptedCount = readNumber(body["accepted"]);
  if (acceptedCount !== undefined || invalid !== undefined) {
    return {
      requestId: readRequestId(body) ?? batch.requestId,
      acceptedCount: acceptedCount ?? countAcceptedByRejected(batch.events.length, invalid ?? []),
      rejected: invalid ?? [],
      httpStatus: status,
      raw: body,
    };
  }

  return {
    requestId: readRequestId(body) ?? batch.requestId,
    acceptedCount: batch.events.length,
    rejected: [],
    httpStatus: status,
    raw: body,
  };
}

function validateTelemetryBackendConfig(
  config: BackendTelemetryTransportConfig,
): Result<void, SdkError> {
  const missing = [
    ["baseUrl", config.baseUrl],
    ["telemetryAppId", config.telemetryAppId],
    ["telemetryIngestKey", config.telemetryIngestKey],
    ["telemetryEnvironment", config.telemetryEnvironment],
  ].filter(([, value]) => typeof value !== "string" || value.trim().length === 0);

  if (missing.length === 0) {
    return ok(undefined);
  }

  return fail(
    new SdkError("telemetry.auth_failed", "Telemetry backend config is incomplete.", {
      moduleName: "telemetry",
      metadata: { missing: missing.map(([key]) => key) },
    }),
  );
}

function resolveBatchUrl(config: BackendTelemetryTransportConfig): string {
  const path = config.telemetryBatchPath ?? DEFAULT_BACKEND_TELEMETRY_BATCH_PATH;
  return resolveBackendUrl(config.baseUrl, path);
}

function toWireEnvelope(batch: TelemetryTransportBatch, environment: string | undefined): unknown {
  const firstEvent = batch.events[0];
  const firstContext = firstEvent.context;
  return {
    sdk: {
      name: SDK_WIRE_NAME,
      version: firstContext.sdkVersion,
    },
    client: {
      game_id: firstContext.gameId,
      platform: firstContext.platform ?? "noop",
      environment: environment ?? firstContext.environment,
      release: firstContext.appVersion,
      build: firstContext.appVersion,
    },
    batch: {
      request_id: batch.requestId,
      sent_at_ms: batch.sentAtMs,
      session_id: batch.sessionId,
    },
    events: batch.events.map((event) => ({
      event_id: event.id,
      name: event.name,
      version: event.version,
      category: event.category,
      occurred_at_ms: event.createdAtMs,
      payload: event.payload,
      context: event.context,
    })),
  };
}

function readRejectedArray(value: unknown): readonly TelemetryRejectedEvent[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      return { index, reason: String(entry) };
    }

    const rawIndex = entry["index"];
    const rawEventId = entry["event_id"] ?? entry["eventId"] ?? entry["id"];
    const rawReason = entry["reason"] ?? entry["message"] ?? "rejected";
    return {
      ...(typeof rawIndex === "number" && Number.isInteger(rawIndex) ? { index: rawIndex } : {}),
      ...(typeof rawEventId === "string" ? { eventId: rawEventId } : {}),
      reason: typeof rawReason === "string" ? rawReason : "rejected",
      raw: entry,
    };
  });
}

function readIdArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }

      if (!isRecord(entry)) {
        return undefined;
      }

      const eventId = entry["event_id"] ?? entry["eventId"] ?? entry["id"];
      return typeof eventId === "string" ? eventId : undefined;
    })
    .filter((entry): entry is string => entry !== undefined);
}

function countAcceptedByRejected(eventCount: number, rejected: readonly TelemetryRejectedEvent[]): number {
  return Math.max(0, eventCount - rejected.length);
}

function countArrayStyleAccepted(
  eventCount: number,
  acceptedIds: readonly string[] | undefined,
  duplicatedIds: readonly string[] | undefined,
  rejected: readonly TelemetryRejectedEvent[],
): number {
  if (acceptedIds !== undefined) {
    return acceptedIds.length + (duplicatedIds?.length ?? 0);
  }

  if (rejected.length > 0) {
    return countAcceptedByRejected(eventCount, rejected);
  }

  return duplicatedIds?.length ?? 0;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readRequestId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const requestId = value["request_id"] ?? value["requestId"];
  return typeof requestId === "string" && requestId.length > 0 ? requestId : undefined;
}
