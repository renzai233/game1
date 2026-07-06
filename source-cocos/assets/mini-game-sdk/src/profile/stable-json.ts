import { SdkError } from "../core/errors";
import { fail, ok, type Result } from "../core/result";
import type { ProfileJsonObject, ProfileJsonValue } from "./types";

const HASH_OFFSET_BASIS = 0xcbf29ce484222325n;
const HASH_PRIME = 0x100000001b3n;
const HASH_MASK = 0xffffffffffffffffn;

export function validateAndCloneProfileJsonObject(
  value: unknown,
  metadata: Readonly<Record<string, unknown>> = {},
): Result<ProfileJsonObject, SdkError> {
  const result = normalizeJsonValue(value, "$", new WeakSet<object>());
  if (!result.ok) {
    return fail(createJsonError(result.error, metadata));
  }

  if (!isJsonObject(result.value)) {
    return fail(createJsonError("Profile module data must be a JSON object.", metadata));
  }

  return ok(result.value);
}

export function cloneProfileJsonObject(value: ProfileJsonObject): ProfileJsonObject {
  const result = validateAndCloneProfileJsonObject(value);
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

export function stableProfileJsonStringify(value: ProfileJsonValue): string {
  return stringifyNormalizedJson(value);
}

export function hashProfileJson(value: ProfileJsonValue): string {
  const stable = stableProfileJsonStringify(value);
  let hash = HASH_OFFSET_BASIS;

  for (let index = 0; index < stable.length; index += 1) {
    hash ^= BigInt(stable.charCodeAt(index));
    hash = (hash * HASH_PRIME) & HASH_MASK;
  }

  return hash.toString(16).padStart(16, "0");
}

function normalizeJsonValue(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
): Result<ProfileJsonValue, string> {
  if (value === null) {
    return ok(null);
  }

  switch (typeof value) {
    case "string":
    case "boolean":
      return ok(value);
    case "number":
      if (!Number.isFinite(value)) {
        return fail(`${path} must be a finite number.`);
      }
      return ok(value);
    case "object":
      return normalizeJsonObjectLike(value, path, seen);
    case "bigint":
    case "function":
    case "symbol":
    case "undefined":
      return fail(`${path} must be JSON-safe.`);
  }

  return fail(`${path} must be JSON-safe.`);
}

function normalizeJsonObjectLike(
  value: object,
  path: string,
  seen: WeakSet<object>,
): Result<ProfileJsonValue, string> {
  if (seen.has(value)) {
    return fail(`${path} must not contain cyclic references.`);
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const output: ProfileJsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          return fail(`${path}[${index}] must not be a sparse array hole.`);
        }

        const child = normalizeJsonValue(value[index], `${path}[${index}]`, seen);
        if (!child.ok) {
          return child;
        }
        output.push(child.value);
      }
      return ok(output);
    }

    if (!isPlainJsonObject(value)) {
      return fail(`${path} must be a plain JSON object.`);
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      return fail(`${path} must not contain symbol keys.`);
    }

    const output: Record<string, ProfileJsonValue> = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      const child = normalizeJsonValue(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`,
        seen,
      );
      if (!child.ok) {
        return child;
      }

      Object.defineProperty(output, key, {
        value: child.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }

    return ok(output);
  } finally {
    seen.delete(value);
  }
}

function stringifyNormalizedJson(value: ProfileJsonValue): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return JSON.stringify(value);
    case "object":
      if (Array.isArray(value)) {
        return `[${value.map((item) => stringifyNormalizedJson(item)).join(",")}]`;
      }

      const objectValue = value as ProfileJsonObject;
      return `{${Object.keys(objectValue)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stringifyNormalizedJson(objectValue[key])}`)
        .join(",")}}`;
  }
}

function isJsonObject(value: ProfileJsonValue): value is ProfileJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainJsonObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function createJsonError(
  message: string,
  metadata: Readonly<Record<string, unknown>>,
): SdkError {
  return new SdkError("profile.module_invalid", message, {
    moduleName: "profile",
    metadata,
  });
}
