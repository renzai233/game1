import {
  DEFAULT_BACKEND_LOGIN_PATH_TEMPLATE,
  type BackendRequest,
  type BackendResponse,
} from "../core/config";
import { createFetchBackendRequest, resolveBackendUrl } from "../core/backend-request";
import { SdkError } from "../core/errors";
import { isRecord, readFiniteNumber, readNonEmptyString, readStringOrFiniteNumber } from "../core/record-reader";
import { fail, ok, type Result } from "../core/result";
import type { PlatformTarget } from "../platform";
import type { BackendSilentLoginInput, BackendSilentLoginOutput, BackendSilentLoginPort } from "./types";

const DEFAULT_TIMEOUT_MS = 10000;

export interface HttpBackendSilentLoginPortConfig {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly loginPathTemplate?: string;
  readonly request?: BackendRequest;
}

export function createHttpBackendSilentLoginPort(
  config: HttpBackendSilentLoginPortConfig,
): BackendSilentLoginPort {
  return new HttpBackendSilentLoginPort(config);
}

class HttpBackendSilentLoginPort implements BackendSilentLoginPort {
  private readonly request: BackendRequest;

  constructor(private readonly config: HttpBackendSilentLoginPortConfig) {
    this.request =
      config.request ??
      createFetchBackendRequest({
        unavailableCode: "account.backend_unavailable",
        unavailableMessage: "No backend request implementation is available.",
        moduleName: "account",
      });
  }

  async login(input: BackendSilentLoginInput): Promise<Result<BackendSilentLoginOutput, SdkError>> {
    const url = resolveLoginUrl(this.config, input.platform);
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let response: BackendResponse;
    try {
      response = await this.request({
        url,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          code: input.code,
          ...(input.referralCode === undefined ? {} : { referral_code: input.referralCode }),
        },
        timeoutMs,
      });
    } catch (error) {
      return fail(mapRequestError(error));
    }

    if (response.status < 200 || response.status >= 300) {
      return fail(mapStatusError(response.status, response.body));
    }

    return normalizeBackendLoginResponse(input.platform, response.status, response.body);
  }
}

export function normalizeBackendLoginResponse(
  platform: PlatformTarget,
  status: number,
  body: unknown,
): Result<BackendSilentLoginOutput, SdkError> {
  if (!isRecord(body)) {
    return fail(invalidResponse("Backend login response must be a JSON object.", { status, body }));
  }

  const envelopeCode = body["code"];
  if (!isSuccessCode(envelopeCode)) {
    return fail(
      new SdkError("account.backend_auth_failed", readMessage(body) ?? "Backend login was rejected.", {
        moduleName: "account",
        metadata: {
          status,
          backendCode: envelopeCode,
        },
      }),
    );
  }

  const data = body["data"];
  if (!isRecord(data)) {
    return fail(invalidResponse("Backend login response data must be an object.", { status, body }));
  }

  const accountId = readRequiredUserId(data);
  if (accountId === undefined) {
    return fail(invalidResponse("Backend login response is missing data.user_id.", { status, body }));
  }

  const accessToken = readNonEmptyString(data, "token");
  if (accessToken === undefined) {
    return fail(invalidResponse("Backend login response is missing data.token.", { status, body }));
  }

  const responseReceivedAtMs = Date.now();
  const explicitExpiresAtMs = readExplicitExpiresAtMs(data, responseReceivedAtMs);
  const jwtExpiresAtMs = explicitExpiresAtMs ?? readJwtExpiresAtMs(accessToken);

  return ok({
    accountId,
    platform,
    accessToken,
    ...(jwtExpiresAtMs === undefined ? {} : { expiresAtMs: jwtExpiresAtMs }),
    raw: body,
  });
}

function resolveLoginUrl(config: HttpBackendSilentLoginPortConfig, platform: PlatformTarget): string {
  const template = config.loginPathTemplate ?? DEFAULT_BACKEND_LOGIN_PATH_TEMPLATE;
  const path = template.replace("{platform}", encodeURIComponent(platform));
  return resolveBackendUrl(config.baseUrl, path);
}

function mapRequestError(error: unknown): SdkError {
  if (error instanceof SdkError) {
    return error;
  }

  if (isAbortError(error) || messageIncludes(error, "timeout")) {
    return new SdkError("account.backend_timeout", "Backend login request timed out.", {
      moduleName: "account",
      cause: error,
    });
  }

  return SdkError.fromUnknown("account.backend_unavailable", "Backend login request failed.", error, {
    moduleName: "account",
  });
}

function mapStatusError(status: number, body: unknown): SdkError {
  const message = readMessage(body) ?? `Backend login failed with HTTP ${status}.`;
  const metadata = { status, ...(isRecord(body) ? { backendCode: body["code"] } : {}) };

  if (status === 408 || status === 504) {
    return new SdkError("account.backend_timeout", message, { moduleName: "account", metadata });
  }

  if (status === 400 || status === 401 || status === 403) {
    return new SdkError("account.backend_auth_failed", message, { moduleName: "account", metadata });
  }

  if (status >= 500) {
    return new SdkError("account.backend_unavailable", message, { moduleName: "account", metadata });
  }

  return new SdkError("account.backend_auth_failed", message, { moduleName: "account", metadata });
}

function invalidResponse(message: string, metadata: Readonly<Record<string, unknown>>): SdkError {
  return new SdkError("account.backend_invalid_response", message, {
    moduleName: "account",
    metadata,
  });
}

function isSuccessCode(value: unknown): boolean {
  return value === 0 || value === "0";
}

function readMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const message = value["message"];
  return typeof message === "string" && message.length > 0 ? message : undefined;
}

function readRequiredUserId(data: Record<string, unknown>): string | undefined {
  return readStringOrFiniteNumber(data, "user_id");
}

function readExplicitExpiresAtMs(data: Record<string, unknown>, receivedAtMs: number): number | undefined {
  const absoluteMs =
    readFiniteNumber(data, "expiresAtMs") ??
    readFiniteNumber(data, "expires_at_ms") ??
    readFiniteNumber(data, "token_expires_at_ms") ??
    readFiniteNumber(data, "access_token_expires_at_ms");

  if (absoluteMs !== undefined) {
    return absoluteMs;
  }

  const absolute =
    readEpochValue(data, "expiresAt") ??
    readEpochValue(data, "expires_at") ??
    readEpochValue(data, "token_expires_at") ??
    readEpochValue(data, "access_token_expires_at");

  if (absolute !== undefined) {
    return absolute;
  }

  const durationMs = readFiniteNumber(data, "expiresInMs") ?? readFiniteNumber(data, "expires_in_ms");
  if (durationMs !== undefined) {
    return receivedAtMs + durationMs;
  }

  const durationSeconds =
    readFiniteNumber(data, "expiresIn") ??
    readFiniteNumber(data, "expires_in") ??
    readFiniteNumber(data, "expires_in_seconds") ??
    readFiniteNumber(data, "token_expires_in");

  return durationSeconds === undefined ? undefined : receivedAtMs + durationSeconds * 1000;
}

function readEpochValue(data: Record<string, unknown>, key: string): number | undefined {
  const value = data[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function readJwtExpiresAtMs(token: string): number | undefined {
  const parts = token.split(".");
  if (parts.length < 2) {
    return undefined;
  }

  const payload = decodeJwtPayload(parts[1]);
  if (!isRecord(payload)) {
    return undefined;
  }

  const exp = payload["exp"];
  if (typeof exp === "number" && Number.isFinite(exp)) {
    return exp * 1000;
  }

  if (typeof exp === "string" && exp.trim().length > 0) {
    const parsed = Number(exp);
    return Number.isFinite(parsed) ? parsed * 1000 : undefined;
  }

  return undefined;
}

function decodeJwtPayload(segment: string): unknown {
  if (typeof globalThis.atob !== "function") {
    return undefined;
  }

  try {
    const normalized = segment.replace(/-/gu, "+").replace(/_/gu, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(globalThis.atob(padded)) as unknown;
  } catch {
    return undefined;
  }
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error["name"] === "AbortError";
}

function messageIncludes(error: unknown, pattern: string): boolean {
  const message = error instanceof Error ? error.message : isRecord(error) ? error["message"] : undefined;
  return typeof message === "string" && message.toLowerCase().includes(pattern);
}
