import { SdkError } from "../core/errors";
import { fail, ok, type Result } from "../core/result";
import type { SendTelemetryBatchOutcome, TelemetryAckResolution, TelemetryQueueItem } from "./queue-types";
import { isPlainTelemetryRecord } from "./record-utils";
import type { TelemetryTransportAck } from "./types";

export function resolveTelemetryAck(
  items: readonly TelemetryQueueItem[],
  ack: TelemetryTransportAck,
): TelemetryAckResolution {
  const rejectedItems = mapRejectedItems(items, ack.rejected ?? []);
  const acceptedItems = new Set<TelemetryQueueItem>();

  addItemsById(acceptedItems, items, ack.acceptedIds ?? []);
  addItemsById(acceptedItems, items, ack.duplicatedIds ?? []);

  if (
    acceptedItems.size === 0 &&
    ack.duplicatedIds === undefined &&
    ack.acceptedIds === undefined &&
    ack.acceptedCount + rejectedItems.size >= items.length
  ) {
    for (const item of items) {
      if (!rejectedItems.has(item)) {
        acceptedItems.add(item);
      }
    }
  }

  for (const item of rejectedItems) {
    acceptedItems.delete(item);
  }

  const processedItems = new Set<TelemetryQueueItem>();
  acceptedItems.forEach((item) => {
    processedItems.add(item);
  });
  rejectedItems.forEach((item) => {
    processedItems.add(item);
  });
  const unconfirmedItems = items.filter((item) => !processedItems.has(item));

  return {
    acceptedItems,
    rejectedItems,
    processedItems,
    unconfirmedItems,
  };
}

export function mergeTelemetryBatchOutcomes(
  left: SendTelemetryBatchOutcome,
  right: SendTelemetryBatchOutcome,
): SendTelemetryBatchOutcome {
  const retryAfterMs = left.retryAfterMs ?? right.retryAfterMs;
  const httpStatus = left.httpStatus ?? right.httpStatus;
  const error = left.error ?? right.error;
  return {
    ok: left.ok && right.ok,
    accepted: left.accepted + right.accepted,
    rejected: left.rejected + right.rejected,
    retryable: left.retryable === true || right.retryable === true,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(error === undefined ? {} : { error }),
  };
}

export function normalizeTelemetryTransportResult(
  result: unknown,
): Result<TelemetryTransportAck, SdkError> {
  if (!isPlainTelemetryRecord(result) || typeof result["ok"] !== "boolean") {
    return fail(createTelemetryTransportFailure("Telemetry transport must return a Result.", { result }));
  }

  if (!result["ok"]) {
    const error = result["error"];
    if (error instanceof SdkError) {
      return fail(error);
    }

    return fail(createTelemetryTransportFailure("Telemetry transport returned an invalid failure.", { error }));
  }

  return normalizeTelemetryTransportAck(result["value"]);
}

function mapRejectedItems(
  items: readonly TelemetryQueueItem[],
  rejected: readonly { readonly index?: number; readonly eventId?: string }[],
): Set<TelemetryQueueItem> {
  const result = new Set<TelemetryQueueItem>();
  for (const rejection of rejected) {
    if (rejection.index !== undefined) {
      const item = items[rejection.index];
      if (item !== undefined) {
        result.add(item);
      }
    }

    if (rejection.eventId !== undefined) {
      for (const item of items) {
        if (item.event.id === rejection.eventId) {
          result.add(item);
        }
      }
    }
  }

  return result;
}

function addItemsById(
  target: Set<TelemetryQueueItem>,
  items: readonly TelemetryQueueItem[],
  eventIds: readonly string[],
): void {
  if (eventIds.length === 0) {
    return;
  }

  const idSet = new Set(eventIds);
  for (const item of items) {
    if (idSet.has(item.event.id)) {
      target.add(item);
    }
  }
}

function normalizeTelemetryTransportAck(value: unknown): Result<TelemetryTransportAck, SdkError> {
  if (!isPlainTelemetryRecord(value)) {
    return fail(createTelemetryTransportFailure("Telemetry transport ack must be an object.", { value }));
  }

  const acceptedCount = readTelemetryAcceptedCount(value);
  if (!acceptedCount.ok) {
    return fail(acceptedCount.error);
  }

  const acceptedIds = readTelemetryStringArray(value, "acceptedIds");
  if (!acceptedIds.ok) {
    return fail(acceptedIds.error);
  }
  const duplicatedIds = readTelemetryStringArray(value, "duplicatedIds");
  if (!duplicatedIds.ok) {
    return fail(duplicatedIds.error);
  }
  const rejected = readTelemetryRejectedEvents(value);
  if (!rejected.ok) {
    return fail(rejected.error);
  }
  const requestId = readTelemetryOptionalString(value, "requestId");
  if (!requestId.ok) {
    return fail(requestId.error);
  }
  const retryable = readTelemetryOptionalBoolean(value, "retryable");
  if (!retryable.ok) {
    return fail(retryable.error);
  }
  const splitAndRetry = readTelemetryOptionalBoolean(value, "splitAndRetry");
  if (!splitAndRetry.ok) {
    return fail(splitAndRetry.error);
  }
  const authExpired = readTelemetryOptionalBoolean(value, "authExpired");
  if (!authExpired.ok) {
    return fail(authExpired.error);
  }
  const dropWholeBatch = readTelemetryOptionalBoolean(value, "dropWholeBatch");
  if (!dropWholeBatch.ok) {
    return fail(dropWholeBatch.error);
  }
  const retryAfterMs = readTelemetryOptionalNonNegativeNumber(value, "retryAfterMs");
  if (!retryAfterMs.ok) {
    return fail(retryAfterMs.error);
  }
  const httpStatus = readTelemetryOptionalNonNegativeInteger(value, "httpStatus");
  if (!httpStatus.ok) {
    return fail(httpStatus.error);
  }

  return ok({
    acceptedCount: acceptedCount.value,
    ...(requestId.value === undefined ? {} : { requestId: requestId.value }),
    ...(acceptedIds.value === undefined ? {} : { acceptedIds: acceptedIds.value }),
    ...(rejected.value === undefined ? {} : { rejected: rejected.value }),
    ...(duplicatedIds.value === undefined ? {} : { duplicatedIds: duplicatedIds.value }),
    ...(retryable.value === undefined ? {} : { retryable: retryable.value }),
    ...(splitAndRetry.value === undefined ? {} : { splitAndRetry: splitAndRetry.value }),
    ...(authExpired.value === undefined ? {} : { authExpired: authExpired.value }),
    ...(dropWholeBatch.value === undefined ? {} : { dropWholeBatch: dropWholeBatch.value }),
    ...(retryAfterMs.value === undefined ? {} : { retryAfterMs: retryAfterMs.value }),
    ...(httpStatus.value === undefined ? {} : { httpStatus: httpStatus.value }),
    ...(value["raw"] === undefined ? {} : { raw: value["raw"] }),
  });
}

function readTelemetryAcceptedCount(
  source: Record<string, unknown>,
): Result<number, SdkError> {
  const value = source["acceptedCount"];
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return ok(value);
  }

  if (
    value === undefined &&
    (source["authExpired"] === true || source["splitAndRetry"] === true || source["dropWholeBatch"] === true)
  ) {
    return ok(0);
  }

  return fail(
    createTelemetryTransportFailure("Telemetry transport ack acceptedCount must be a non-negative integer.", {
      acceptedCount: value,
    }),
  );
}

function readTelemetryStringArray(
  source: Record<string, unknown>,
  key: string,
): Result<readonly string[] | undefined, SdkError> {
  const value = source[key];
  if (value === undefined) {
    return ok(undefined);
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return ok([...value]);
  }

  return fail(createTelemetryTransportFailure(`Telemetry transport ack ${key} must be a string array.`, { [key]: value }));
}

function readTelemetryRejectedEvents(
  source: Record<string, unknown>,
): Result<ReadonlyArray<NonNullable<TelemetryTransportAck["rejected"]>[number]> | undefined, SdkError> {
  const value = source["rejected"];
  if (value === undefined) {
    return ok(undefined);
  }

  if (!Array.isArray(value)) {
    return fail(createTelemetryTransportFailure("Telemetry transport ack rejected must be an array.", { rejected: value }));
  }

  const rejected: Array<NonNullable<TelemetryTransportAck["rejected"]>[number]> = [];
  for (const item of value) {
    if (!isPlainTelemetryRecord(item) || typeof item["reason"] !== "string") {
      return fail(createTelemetryTransportFailure("Telemetry transport ack rejected item is malformed.", { item }));
    }

    const index = item["index"];
    if (index !== undefined && (typeof index !== "number" || !Number.isInteger(index) || index < 0)) {
      return fail(createTelemetryTransportFailure("Telemetry transport ack rejected index is invalid.", { index }));
    }

    const eventId = item["eventId"];
    if (eventId !== undefined && typeof eventId !== "string") {
      return fail(createTelemetryTransportFailure("Telemetry transport ack rejected eventId is invalid.", { eventId }));
    }

    rejected.push({
      reason: item["reason"],
      ...(index === undefined ? {} : { index }),
      ...(eventId === undefined ? {} : { eventId }),
      ...(item["raw"] === undefined ? {} : { raw: item["raw"] }),
    });
  }

  return ok(rejected);
}

function readTelemetryOptionalString(
  source: Record<string, unknown>,
  key: string,
): Result<string | undefined, SdkError> {
  const value = source[key];
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value === "string") {
    return ok(value);
  }

  return fail(createTelemetryTransportFailure(`Telemetry transport ack ${key} must be a string.`, { [key]: value }));
}

function readTelemetryOptionalBoolean(
  source: Record<string, unknown>,
  key: string,
): Result<boolean | undefined, SdkError> {
  const value = source[key];
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value === "boolean") {
    return ok(value);
  }

  return fail(createTelemetryTransportFailure(`Telemetry transport ack ${key} must be a boolean.`, { [key]: value }));
}

function readTelemetryOptionalNonNegativeNumber(
  source: Record<string, unknown>,
  key: string,
): Result<number | undefined, SdkError> {
  const value = source[key];
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return ok(value);
  }

  return fail(createTelemetryTransportFailure(`Telemetry transport ack ${key} must be a non-negative number.`, {
    [key]: value,
  }));
}

function readTelemetryOptionalNonNegativeInteger(
  source: Record<string, unknown>,
  key: string,
): Result<number | undefined, SdkError> {
  const value = source[key];
  if (value === undefined) {
    return ok(undefined);
  }

  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return ok(value);
  }

  return fail(createTelemetryTransportFailure(`Telemetry transport ack ${key} must be a non-negative integer.`, {
    [key]: value,
  }));
}

function createTelemetryTransportFailure(
  message: string,
  metadata: Readonly<Record<string, unknown>>,
): SdkError {
  return new SdkError("telemetry.transport_failed", message, {
    moduleName: "telemetry",
    metadata,
  });
}
