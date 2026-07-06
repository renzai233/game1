import { fail, ok, type Result } from "../core/result";
import { createCommerceError, createInvalidBundleError } from "./errors";
import { defineRecordEntry, readOwn } from "./record";
import type {
  CommerceCommandMeta,
  CommerceCommandReceipt,
  CommerceCommandType,
  CommerceState,
} from "./types";
import type { SdkError } from "../core/errors";

const HASH_OFFSET_BASIS = 0xcbf29ce484222325n;
const HASH_PRIME = 0x100000001b3n;
const HASH_MASK = 0xffffffffffffffffn;
const COMMERCE_COMMAND_KEY_MAX_LENGTH = 128;
const COMMERCE_REASON_MAX_LENGTH = 64;
const COMMERCE_SOURCE_MAX_LENGTH = 64;
const COMMERCE_METADATA_MAX_BYTES = 1024;

export type CommerceJsonValue =
  | null
  | string
  | number
  | boolean
  | readonly CommerceJsonValue[]
  | CommerceJsonObject;

export interface CommerceJsonObject {
  readonly [key: string]: CommerceJsonValue;
}

export interface ValidatedCommerceCommandMeta {
  readonly commandKey: string;
  readonly reason: string;
  readonly source: string;
  readonly metadata?: CommerceJsonObject;
}

export type CommandReceiptReplayResult =
  | { readonly kind: "new" }
  | {
      readonly kind: "replayed";
      readonly receipt: CommerceCommandReceipt;
    };

export function validateCommerceCommandMeta(
  input: unknown,
): Result<ValidatedCommerceCommandMeta, SdkError> {
  if (!isPlainObject(input)) {
    return fail(createInvalidBundleError("Commerce command input must be a plain object."));
  }

  const record = input as Partial<CommerceCommandMeta>;
  const commandKey = validateBudgetedString(
    record.commandKey,
    "commandKey",
    COMMERCE_COMMAND_KEY_MAX_LENGTH,
  );
  if (!commandKey.ok) {
    return fail(commandKey.error);
  }
  const reason = validateBudgetedString(record.reason, "reason", COMMERCE_REASON_MAX_LENGTH, {
    commandKey: commandKey.value,
  });
  if (!reason.ok) {
    return fail(reason.error);
  }
  const source = validateBudgetedString(record.source, "source", COMMERCE_SOURCE_MAX_LENGTH, {
    commandKey: commandKey.value,
  });
  if (!source.ok) {
    return fail(source.error);
  }

  if (record.metadata === undefined) {
    return ok({
      commandKey: commandKey.value,
      reason: reason.value,
      source: source.value,
    });
  }

  const metadata = normalizeCommerceJsonObject(record.metadata, {
    commandKey: commandKey.value,
    field: "metadata",
  });
  if (!metadata.ok) {
    return fail(metadata.error);
  }
  const metadataSize = assertCommerceJsonByteBudget(metadata.value, COMMERCE_METADATA_MAX_BYTES, {
    commandKey: commandKey.value,
    field: "metadata",
  });
  if (!metadataSize.ok) {
    return fail(metadataSize.error);
  }

  return ok({
    commandKey: commandKey.value,
    reason: reason.value,
    source: source.value,
    metadata: metadata.value,
  });
}

export function hashCommerceCommandPayload(
  commandType: CommerceCommandType,
  input: CommerceJsonObject,
): Result<string, SdkError> {
  const payload = normalizeCommerceJsonValue(
    {
      commandType,
      input,
    },
    "$",
    new WeakSet<object>(),
  );
  if (!payload.ok) {
    return fail(createInvalidBundleError(payload.error));
  }

  return ok(hashCommerceJson(payload.value));
}

export function hashCommerceJsonObject(input: CommerceJsonObject): Result<string, SdkError> {
  const payload = normalizeCommerceJsonValue(input, "$", new WeakSet<object>());
  if (!payload.ok) {
    return fail(createInvalidBundleError(payload.error));
  }

  if (!isCommerceJsonObject(payload.value)) {
    return fail(createInvalidBundleError("Commerce JSON value must be an object."));
  }

  return ok(hashCommerceJson(payload.value));
}

export function checkCommandReceiptReplay(
  state: CommerceState,
  input: {
    readonly commandKey: string;
    readonly commandType: CommerceCommandType;
    readonly payloadHash: string;
  },
): Result<CommandReceiptReplayResult, SdkError> {
  const receipt = readOwn(state.commandReceipts, input.commandKey);
  if (receipt === undefined) {
    return ok({ kind: "new" });
  }

  if (receipt.commandType !== input.commandType || receipt.payloadHash !== input.payloadHash) {
    return fail(
      createCommerceError(
        "commerce.command_replay_conflict",
        "A commerce command with the same commandKey was already applied with a different payload.",
        {
          commandKey: input.commandKey,
          commandType: input.commandType,
          existingCommandType: receipt.commandType,
          existingPayloadHash: receipt.payloadHash,
          payloadHash: input.payloadHash,
        },
      ),
    );
  }

  return ok({
    kind: "replayed",
    receipt,
  });
}

export function normalizeCommerceJsonObject(
  value: unknown,
  metadata: Readonly<Record<string, unknown>> = {},
): Result<CommerceJsonObject, SdkError> {
  const normalized = normalizeCommerceJsonValue(value, "$", new WeakSet<object>());
  if (!normalized.ok) {
    return fail(createInvalidBundleError(normalized.error, metadata));
  }

  if (!isCommerceJsonObject(normalized.value)) {
    return fail(createInvalidBundleError("Commerce JSON value must be an object.", metadata));
  }

  return ok(normalized.value);
}

export function validateCommerceBudgetedString(
  value: unknown,
  field: string,
  maxLength: number,
  metadata: Readonly<Record<string, unknown>> = {},
): Result<string, SdkError> {
  return validateBudgetedString(value, field, maxLength, metadata);
}

function assertCommerceJsonByteBudget(
  value: CommerceJsonValue,
  maxBytes: number,
  metadata: Readonly<Record<string, unknown>> = {},
): Result<void, SdkError> {
  const actualBytes = utf8ByteLength(stableCommerceJsonStringify(value));
  if (actualBytes > maxBytes) {
    return fail(createInvalidBundleError("Commerce JSON payload exceeds byte budget.", {
      ...metadata,
      actualBytes,
      maxBytes,
    }));
  }

  return ok(undefined);
}

function validateBudgetedString(
  value: unknown,
  field: string,
  maxLength: number,
  metadata: Readonly<Record<string, unknown>> = {},
): Result<string, SdkError> {
  if (!isNonEmptyString(value)) {
    return fail(createInvalidBundleError(`Commerce ${field} must be a non-empty string.`, {
      ...metadata,
      field,
      [field]: value,
    }));
  }

  if (value.length > maxLength) {
    return fail(createInvalidBundleError(`Commerce ${field} exceeds length budget.`, {
      ...metadata,
      field,
      actualLength: value.length,
      maxLength,
    }));
  }

  return ok(value);
}

function normalizeCommerceJsonValue(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
): Result<CommerceJsonValue, string> {
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
      return normalizeCommerceJsonObjectLike(value, path, seen);
    case "bigint":
    case "function":
    case "symbol":
    case "undefined":
      return fail(`${path} must be JSON-safe.`);
  }

  return fail(`${path} must be JSON-safe.`);
}

function normalizeCommerceJsonObjectLike(
  value: object,
  path: string,
  seen: WeakSet<object>,
): Result<CommerceJsonValue, string> {
  if (seen.has(value)) {
    return fail(`${path} must not contain cyclic references.`);
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const output: CommerceJsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          return fail(`${path}[${index}] must not be a sparse array hole.`);
        }

        const child = normalizeCommerceJsonValue(value[index], `${path}[${index}]`, seen);
        if (!child.ok) {
          return child;
        }
        output.push(child.value);
      }
      return ok(output);
    }

    if (!isPlainObject(value)) {
      return fail(`${path} must be a plain JSON object.`);
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      return fail(`${path} must not contain symbol keys.`);
    }

    const output: Record<string, CommerceJsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      const child = normalizeCommerceJsonValue(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`,
        seen,
      );
      if (!child.ok) {
        return child;
      }

      defineRecordEntry(output, key, child.value);
    }

    return ok(output);
  } finally {
    seen.delete(value);
  }
}

function hashCommerceJson(value: CommerceJsonValue): string {
  const stable = stableCommerceJsonStringify(value);
  let hash = HASH_OFFSET_BASIS;

  for (let index = 0; index < stable.length; index += 1) {
    hash ^= BigInt(stable.charCodeAt(index));
    hash = (hash * HASH_PRIME) & HASH_MASK;
  }

  return hash.toString(16).padStart(16, "0");
}

function stableCommerceJsonStringify(value: CommerceJsonValue): string {
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
        return `[${value.map((item) => stableCommerceJsonStringify(item)).join(",")}]`;
      }

      const objectValue = value as CommerceJsonObject;
      return `{${Object.keys(objectValue)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableCommerceJsonStringify(objectValue[key])}`)
        .join(",")}}`;
  }
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

function isCommerceJsonObject(value: CommerceJsonValue): value is CommerceJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
