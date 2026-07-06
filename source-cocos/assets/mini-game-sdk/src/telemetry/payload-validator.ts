import { SdkError } from "../core/errors";
import { fail, ok, type Result } from "../core/result";
import type {
  TelemetryPayload,
  TelemetryPayloadValidator,
  TrackingPlanEvent,
} from "./types";

const DEFAULT_MAX_PAYLOAD_BYTES = 32 * 1024;

export interface PayloadValidationOptions {
  readonly maxPayloadBytes?: number;
  readonly globalValidator?: TelemetryPayloadValidator;
}

export function validateTelemetryPayload<TPayload extends TelemetryPayload>(
  event: TrackingPlanEvent<TPayload>,
  eventName: string,
  payload: TPayload,
  options: PayloadValidationOptions,
): Result<TPayload, SdkError> {
  if (!isTelemetryPayloadRecord(payload)) {
    return invalidPayload("Telemetry payload must be a JSON-safe object.", {
      eventName,
      payloadType: Array.isArray(payload) ? "array" : typeof payload,
    });
  }

  for (const requiredKey of event.required ?? []) {
    if (!(requiredKey in payload)) {
      return invalidPayload(`Telemetry payload is missing required field: ${requiredKey}`, {
        eventName,
        field: requiredKey,
      });
    }
  }

  for (const [key, value] of Object.entries(payload)) {
    if (!isTelemetryPayloadValue(value)) {
      return invalidPayload(`Telemetry payload field is not a supported primitive value: ${key}`, {
        eventName,
        field: key,
      });
    }
  }

  const maxPayloadBytes =
    event.maxPayloadBytes ?? options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  const payloadBytes = jsonByteLength(payload);
  if (payloadBytes > maxPayloadBytes) {
    return invalidPayload("Telemetry payload exceeds the configured size limit.", {
      eventName,
      payloadBytes,
      maxPayloadBytes,
    });
  }

  if (event.validator !== undefined) {
    try {
      const result = event.validator(eventName, payload);
      if (!result.ok) {
        return result;
      }
    } catch (error) {
      return validatorFailed("Telemetry event validator failed.", eventName, "event", error);
    }
  }

  if (options.globalValidator !== undefined) {
    try {
      const result = options.globalValidator(eventName, payload);
      if (!result.ok) {
        return result as Result<TPayload, SdkError>;
      }
    } catch (error) {
      return validatorFailed("Telemetry global validator failed.", eventName, "global", error);
    }
  }

  return ok(payload);
}

function isTelemetryPayloadRecord(value: unknown): value is TelemetryPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isTelemetryPayloadValue(value: unknown): boolean {
  return isTelemetryPrimitive(value) || (Array.isArray(value) && value.every(isTelemetryPrimitive));
}

function jsonByteLength(value: unknown): number {
  let json: string;
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      return 0;
    }
    json = serialized;
  } catch {
    return Number.POSITIVE_INFINITY;
  }

  try {
    if (typeof TextEncoder === "function") {
      return new TextEncoder().encode(json).length;
    }
  } catch {
    // Fall through to runtime-independent UTF-8 length calculation.
  }

  const buffer = (globalThis as { Buffer?: { byteLength(input: string, encoding?: string): number } }).Buffer;
  if (buffer !== undefined && typeof buffer.byteLength === "function") {
    return buffer.byteLength(json, "utf8");
  }

  return utf8ByteLength(json);
}

function isTelemetryPrimitive(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
  );
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index) ?? 0;
    if (codePoint <= 0x7f) {
      bytes += 1;
    } else if (codePoint <= 0x7ff) {
      bytes += 2;
    } else if (codePoint <= 0xffff) {
      bytes += 3;
    } else {
      bytes += 4;
      index += 1;
    }
  }

  return bytes;
}

function invalidPayload(
  message: string,
  metadata: Readonly<Record<string, unknown>>,
): Result<never, SdkError> {
  return fail(
    new SdkError("telemetry.event_invalid", message, {
      moduleName: "telemetry",
      metadata,
    }),
  );
}

function validatorFailed(
  message: string,
  eventName: string,
  validator: "event" | "global",
  cause: unknown,
): Result<never, SdkError> {
  return fail(
    new SdkError("telemetry.event_invalid", message, {
      moduleName: "telemetry",
      cause,
      metadata: { eventName, validator },
    }),
  );
}
