import { fail, ok, type Result } from "../core/result";
import { isNonEmptyTelemetryString, isPlainTelemetryRecord } from "./record-utils";
import type { TelemetryEvent } from "./types";

const DEFAULT_PENDING_STORAGE_KEY = "mini-game-sdk:telemetry:pending";
const TELEMETRY_CONTEXT_KEYS = new Set([
  "gameId",
  "appVersion",
  "environment",
  "platform",
  "accountId",
  "sessionId",
  "deviceId",
  "sdkVersion",
  "launchScene",
  "channel",
  "eventTimeMs",
  "sequenceId",
]);
const FORBIDDEN_TELEMETRY_CONTEXT_KEYS = new Set([
  "openid",
  "sessionkey",
  "platformaccountid",
  "xingestkey",
  "unionid",
  "anonymouscode",
]);

export { isNonEmptyTelemetryString };

export function createTelemetryPendingStorageKey(gameId: string, environment: string): string {
  return `${DEFAULT_PENDING_STORAGE_KEY}:${encodeURIComponent(gameId)}:${encodeURIComponent(environment)}`;
}

export function rewriteEventDeviceId(event: TelemetryEvent, deviceId: string): void {
  (event.context as { deviceId: string }).deviceId = deviceId;
}

export function normalizeRestoredTelemetryContext(value: unknown): Result<TelemetryEvent["context"], string> {
  if (!isPlainTelemetryRecord(value)) {
    return fail("Telemetry restored event context must be an object.");
  }

  for (const key of Object.keys(value)) {
    const normalizedKey = normalizeTelemetryContextKey(key);
    if (FORBIDDEN_TELEMETRY_CONTEXT_KEYS.has(normalizedKey)) {
      return fail(`Telemetry restored event context contains forbidden field: ${key}`);
    }

    if (!TELEMETRY_CONTEXT_KEYS.has(key)) {
      return fail(`Telemetry restored event context contains unknown field: ${key}`);
    }
  }

  const gameId = readRequiredTelemetryString(value, "gameId");
  if (!gameId.ok) {
    return gameId;
  }
  const appVersion = readRequiredTelemetryString(value, "appVersion");
  if (!appVersion.ok) {
    return appVersion;
  }
  const environment = readRequiredTelemetryString(value, "environment");
  if (!environment.ok) {
    return environment;
  }
  const sessionId = readRequiredTelemetryString(value, "sessionId");
  if (!sessionId.ok) {
    return sessionId;
  }
  const deviceId = readRequiredTelemetryString(value, "deviceId");
  if (!deviceId.ok) {
    return deviceId;
  }
  const sdkVersion = readRequiredTelemetryString(value, "sdkVersion");
  if (!sdkVersion.ok) {
    return sdkVersion;
  }
  const eventTimeMs = readRequiredFiniteTelemetryNumber(value, "eventTimeMs");
  if (!eventTimeMs.ok) {
    return eventTimeMs;
  }
  const sequenceId = readRequiredTelemetrySequence(value, "sequenceId");
  if (!sequenceId.ok) {
    return sequenceId;
  }
  const accountId = readOptionalTelemetryString(value, "accountId");
  if (!accountId.ok) {
    return accountId;
  }
  const launchScene = readOptionalTelemetryString(value, "launchScene");
  if (!launchScene.ok) {
    return launchScene;
  }
  const channel = readOptionalTelemetryString(value, "channel");
  if (!channel.ok) {
    return channel;
  }

  const platform = value["platform"];
  if (platform !== undefined && !isTelemetryPlatformTarget(platform)) {
    return fail("Telemetry restored event context platform is invalid.");
  }

  return ok({
    gameId: gameId.value,
    appVersion: appVersion.value,
    environment: environment.value,
    ...(platform === undefined ? {} : { platform }),
    ...(accountId.value === undefined ? {} : { accountId: accountId.value }),
    sessionId: sessionId.value,
    deviceId: deviceId.value,
    sdkVersion: sdkVersion.value,
    ...(launchScene.value === undefined ? {} : { launchScene: launchScene.value }),
    ...(channel.value === undefined ? {} : { channel: channel.value }),
    eventTimeMs: eventTimeMs.value,
    sequenceId: sequenceId.value,
  });
}

export function isTelemetryEventSnapshot(value: unknown): value is TelemetryEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<TelemetryEvent>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.version === "number" &&
    typeof candidate.category === "string" &&
    typeof candidate.createdAtMs === "number" &&
    typeof candidate.payload === "object" &&
    candidate.payload !== null &&
    typeof candidate.context === "object" &&
    candidate.context !== null
  );
}

function readRequiredTelemetryString(
  source: Record<string, unknown>,
  key: string,
): Result<string, string> {
  const value = source[key];
  if (!isNonEmptyTelemetryString(value)) {
    return fail(`Telemetry restored event context ${key} must be a non-empty string.`);
  }

  return ok(value.trim());
}

function readOptionalTelemetryString(
  source: Record<string, unknown>,
  key: string,
): Result<string | undefined, string> {
  const value = source[key];
  if (value === undefined) {
    return ok(undefined);
  }

  if (!isNonEmptyTelemetryString(value)) {
    return fail(`Telemetry restored event context ${key} must be a non-empty string when present.`);
  }

  return ok(value.trim());
}

function readRequiredFiniteTelemetryNumber(
  source: Record<string, unknown>,
  key: string,
): Result<number, string> {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(`Telemetry restored event context ${key} must be a finite number.`);
  }

  return ok(value);
}

function readRequiredTelemetrySequence(
  source: Record<string, unknown>,
  key: string,
): Result<number, string> {
  const value = source[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return fail(`Telemetry restored event context ${key} must be a non-negative integer.`);
  }

  return ok(value);
}

function isTelemetryPlatformTarget(
  value: unknown,
): value is NonNullable<TelemetryEvent["context"]["platform"]> {
  return value === "douyin" || value === "wechat" || value === "web" || value === "noop";
}

function normalizeTelemetryContextKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/gu, "");
}
