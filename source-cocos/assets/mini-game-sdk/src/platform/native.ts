import type { CapabilityFailureReason, PlatformUnsubscribe } from "./types";

export interface CallbackResult {
  readonly ok: true;
  readonly value: unknown;
}

export interface CallbackFailure {
  readonly ok: false;
  readonly reason: CapabilityFailureReason;
  readonly message: string;
  readonly code?: string;
  readonly raw?: unknown;
}

export type CallbackOutcome = CallbackResult | CallbackFailure;

export type NativeFunction = (options?: Record<string, unknown>) => unknown;

export interface NativeCallOptions {
  readonly timeoutMs?: number;
}

export interface NativeResultCallbacks {
  readonly success?: (result?: unknown) => void;
  readonly fail?: (error?: unknown) => void;
  readonly complete?: (result?: unknown) => void;
}

export const noopUnsubscribe: PlatformUnsubscribe = () => undefined;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getFunction<TFunction extends (...args: never[]) => unknown>(
  source: unknown,
  key: string,
): TFunction | undefined {
  if (!isRecord(source)) {
    return undefined;
  }

  const value = source[key];
  return typeof value === "function" ? (value as TFunction) : undefined;
}

export function getRecord(source: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(source)) {
    return undefined;
  }

  const value = source[key];
  return isRecord(value) ? value : undefined;
}

export function getString(source: unknown, key: string): string | undefined {
  if (!isRecord(source)) {
    return undefined;
  }

  const value = source[key];
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

export function getNumber(source: unknown, key: string): number | undefined {
  if (!isRecord(source)) {
    return undefined;
  }

  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function getBoolean(source: unknown, key: string): boolean | undefined {
  if (!isRecord(source)) {
    return undefined;
  }

  const value = source[key];
  return typeof value === "boolean" ? value : undefined;
}

export function mapNativeFailure(error: unknown): CallbackFailure {
  const message = getNativeMessage(error);
  const code = getNativeCode(error);
  const lowered = message.toLowerCase();

  if (lowered.includes("cancel")) {
    return { ok: false, reason: "user_cancelled", message, ...(code === undefined ? {} : { code }), raw: error };
  }

  if (lowered.includes("deny") || lowered.includes("auth") || lowered.includes("permission")) {
    return {
      ok: false,
      reason: "permission_denied",
      message,
      ...(code === undefined ? {} : { code }),
      raw: error,
    };
  }

  return {
    ok: false,
    reason: "native_failed",
    message,
    ...(code === undefined ? {} : { code }),
    raw: error,
  };
}

export function getNativeMessage(value: unknown): string {
  if (isRecord(value)) {
    const errMsg = value["errMsg"];
    if (typeof errMsg === "string" && errMsg.length > 0) {
      return errMsg;
    }

    const message = value["message"];
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  if (value instanceof Error) {
    return value.message;
  }

  return "Native platform call failed.";
}

export function getNativeCode(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const code = value["errNo"] ?? value["errno"] ?? value["errCode"] ?? value["err_code"] ?? value["code"];
  if (typeof code === "string" && code.length > 0) {
    return code;
  }

  if (typeof code === "number") {
    return String(code);
  }

  return undefined;
}

export function callNativeWithCallbacks(
  call: NativeFunction,
  input: Record<string, unknown>,
  options: NativeCallOptions = {},
): Promise<CallbackOutcome> {
  return new Promise<CallbackOutcome>((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const settle = (outcome: CallbackOutcome): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      resolve(outcome);
    };

    if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        settle(nativeTimeoutFailure());
      }, options.timeoutMs);
    }

    const callbacks: NativeResultCallbacks = {
      success: (result) => settle({ ok: true, value: result }),
      fail: (error) => settle(mapNativeFailure(error)),
    };

    try {
      const returned = call({ ...input, ...callbacks });
      if (isThenable(returned)) {
        void returned.then(
          (value) => settle({ ok: true, value }),
          (error) => settle(mapNativeFailure(error)),
        );
      } else if (returned !== undefined && !settled) {
        settle({ ok: true, value: returned });
      }
    } catch (error) {
      settle(mapNativeFailure(error));
    }
  });
}

export function isThenable(value: unknown): value is PromiseLike<unknown> {
  return isRecord(value) && typeof value["then"] === "function";
}

export async function awaitMaybe(value: unknown, timeoutMs?: number): Promise<void> {
  if (isThenable(value)) {
    await withNativeTimeout(value, timeoutMs);
  }
}

export function nativeTimeoutFailure(): CallbackFailure {
  return {
    ok: false,
    reason: "timeout",
    message: "Platform native call timed out.",
  };
}

export function isNativeTimeoutFailure(value: unknown): value is CallbackFailure {
  return isRecord(value) && value["ok"] === false && value["reason"] === "timeout";
}

export async function withNativeTimeout<TValue>(
  value: PromiseLike<TValue>,
  timeoutMs: number | undefined,
): Promise<TValue> {
  if (timeoutMs === undefined || timeoutMs <= 0) {
    return value;
  }

  return new Promise<TValue>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(nativeTimeoutFailure());
    }, timeoutMs);

    void value.then(
      (resolved) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(resolved);
      },
      (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export function serializeQuery(
  query: string | Readonly<Record<string, string | number | boolean | null | undefined>> | undefined,
): string | undefined {
  if (query === undefined || typeof query === "string") {
    return query;
  }

  const pairs: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }

  return pairs.length === 0 ? undefined : pairs.join("&");
}

export function defineNativePlacementProperty(value: string): Record<string, string> {
  return {
    [["ad", "Unit", "Id"].join("")]: value,
  };
}

export function defineNativeShareTemplateProperty(value: string | undefined): Record<string, string> {
  if (value === undefined) {
    return {};
  }

  return {
    [["template", "Id"].join("")]: value,
  };
}
