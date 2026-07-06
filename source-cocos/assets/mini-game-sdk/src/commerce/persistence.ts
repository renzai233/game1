import { SdkError, type SdkErrorCode } from "../core/errors";
import { fail, ok, type Result } from "../core/result";
import type {
  PlayerProfileRecord,
  ProfileJsonObject,
  ProfileJsonValue,
  ProfileModuleEnvelope,
} from "../profile";
import {
  COMMERCE_MODULE_ID,
  CURRENT_COMMERCE_SCHEMA_VERSION,
  type ClaimOpportunity,
  type ClaimTombstoneRetentionPolicy,
  type CommerceCommandReceipt,
  type CommerceCommandType,
  type CommerceLedgerEntry,
  type CommerceResourceDelta,
  type CommerceState,
  type RewardBundle,
  type SpendBundle,
} from "./types";
import { validateRewardBundle, validateSpendBundle } from "./bundle";
import { defineRecordEntry, readOwn } from "./record";

export const COMMERCE_PROFILE_MODULE_OWNER = "sdk:commerce" as const;
export const COMMERCE_PROFILE_MODULE_VERSION = 1;

export interface CommerceProfileModuleRead {
  readonly module: ProfileModuleEnvelope<ProfileJsonObject> | null;
  readonly state: CommerceState | null;
  readonly expectedModuleRevision: number | null;
}

export function readCommerceModuleFromProfileRecord(
  record: PlayerProfileRecord,
): Result<CommerceProfileModuleRead, SdkError> {
  const module = readOwn(record.modules, COMMERCE_MODULE_ID);
  if (module === undefined) {
    return ok({
      module: null,
      state: null,
      expectedModuleRevision: null,
    });
  }

  const state = validateCommerceStateFromProfileModule(module);
  if (!state.ok) {
    return fail(state.error);
  }

  return ok({
    module,
    state: state.value,
    expectedModuleRevision: module.moduleRevision,
  });
}

export function validateCommerceStateFromProfileModule(
  module: ProfileModuleEnvelope,
): Result<CommerceState, SdkError> {
  if (module.moduleId !== COMMERCE_MODULE_ID) {
    return fail(createCommercePersistenceInvalidError("Commerce profile module id is invalid.", {
      moduleId: module.moduleId,
    }));
  }

  if (module.owner !== COMMERCE_PROFILE_MODULE_OWNER) {
    return fail(createCommercePersistenceInvalidError("Commerce profile module owner is invalid.", {
      moduleId: module.moduleId,
      owner: module.owner,
    }));
  }

  if (module.moduleVersion !== COMMERCE_PROFILE_MODULE_VERSION) {
    return fail(createCommercePersistenceInvalidError("Commerce profile module version is incompatible.", {
      moduleId: module.moduleId,
      moduleVersion: module.moduleVersion,
    }));
  }

  return validateCommerceState(module.data, { moduleId: module.moduleId });
}

export function toProfileJsonCommerceState(state: CommerceState): ProfileJsonObject {
  return JSON.parse(JSON.stringify(state)) as ProfileJsonObject;
}

export function mapProfilePersistenceError(
  error: SdkError,
  metadata: Readonly<Record<string, unknown>> = {},
): SdkError {
  const mappedCode = mapProfileCodeToCommercePersistenceCode(error.code);
  return new SdkError(
    mappedCode,
    createMappedPersistenceMessage(mappedCode),
    {
      moduleName: "commerce",
      cause: error,
      metadata: {
        ...metadata,
        causeCode: error.code,
        causeMessage: error.message,
      },
    },
  );
}

export function createCommercePersistenceInvalidError(
  message: string,
  metadata: Readonly<Record<string, unknown>> = {},
): SdkError {
  return new SdkError("commerce.persistence_invalid", message, {
    moduleName: "commerce",
    metadata,
  });
}

export function createCommercePersistenceConflictError(
  message: string,
  causeCode: SdkErrorCode,
  metadata: Readonly<Record<string, unknown>> = {},
): SdkError {
  return new SdkError("commerce.persistence_conflict", message, {
    moduleName: "commerce",
    metadata: {
      ...metadata,
      causeCode,
    },
  });
}

function validateCommerceState(
  value: unknown,
  metadata: Readonly<Record<string, unknown>>,
): Result<CommerceState, SdkError> {
  if (!isPlainRecord(value)) {
    return fail(createCommercePersistenceInvalidError("Commerce state must be an object.", metadata));
  }

  if (value["schemaVersion"] !== CURRENT_COMMERCE_SCHEMA_VERSION) {
    return fail(createCommercePersistenceInvalidError("Commerce state schemaVersion is incompatible.", {
      ...metadata,
      schemaVersion: value["schemaVersion"],
    }));
  }

  const wallet = readNumberRecord(value, "wallet", metadata);
  if (!wallet.ok) {
    return fail(wallet.error);
  }
  const inventory = readNumberRecord(value, "inventory", metadata);
  if (!inventory.ok) {
    return fail(inventory.error);
  }
  const entitlements = readBooleanRecord(value, "entitlements", metadata);
  if (!entitlements.ok) {
    return fail(entitlements.error);
  }
  const claimOpportunities = readClaimOpportunities(value["claimOpportunities"], metadata);
  if (!claimOpportunities.ok) {
    return fail(claimOpportunities.error);
  }
  const ledger = readLedger(value["ledger"], metadata);
  if (!ledger.ok) {
    return fail(ledger.error);
  }
  const commandReceipts = readCommandReceipts(value["commandReceipts"], metadata);
  if (!commandReceipts.ok) {
    return fail(commandReceipts.error);
  }

  if (!isFiniteTimestamp(value["updatedAtMs"])) {
    return fail(createCommercePersistenceInvalidError("Commerce state updatedAtMs must be a finite timestamp.", metadata));
  }

  return ok({
    schemaVersion: CURRENT_COMMERCE_SCHEMA_VERSION,
    wallet: wallet.value,
    inventory: inventory.value,
    entitlements: entitlements.value,
    claimOpportunities: claimOpportunities.value,
    ledger: ledger.value,
    commandReceipts: commandReceipts.value,
    updatedAtMs: value["updatedAtMs"],
  });
}

function readNumberRecord(
  value: Readonly<Record<string, unknown>>,
  field: string,
  metadata: Readonly<Record<string, unknown>>,
): Result<Readonly<Record<string, number>>, SdkError> {
  const record = value[field];
  if (!isPlainRecord(record)) {
    return fail(createCommercePersistenceInvalidError(`Commerce state ${field} must be an object.`, metadata));
  }

  const output: Record<string, number> = {};
  for (const key of Object.keys(record).sort()) {
    const amount = record[key];
    if (!isNonEmptyString(key) || !isNonNegativeSafeInteger(amount)) {
      return fail(createCommercePersistenceInvalidError(`Commerce state ${field} entry is invalid.`, {
        ...metadata,
        resourceId: key,
        amount,
      }));
    }
    defineRecordEntry(output, key, amount);
  }
  return ok(output);
}

function readBooleanRecord(
  value: Readonly<Record<string, unknown>>,
  field: string,
  metadata: Readonly<Record<string, unknown>>,
): Result<Readonly<Record<string, boolean>>, SdkError> {
  const record = value[field];
  if (!isPlainRecord(record)) {
    return fail(createCommercePersistenceInvalidError(`Commerce state ${field} must be an object.`, metadata));
  }

  const output: Record<string, boolean> = {};
  for (const key of Object.keys(record).sort()) {
    const owned = record[key];
    if (!isNonEmptyString(key) || typeof owned !== "boolean") {
      return fail(createCommercePersistenceInvalidError(`Commerce state ${field} entry is invalid.`, {
        ...metadata,
        resourceId: key,
        owned,
      }));
    }
    defineRecordEntry(output, key, owned);
  }
  return ok(output);
}

function readClaimOpportunities(
  value: unknown,
  metadata: Readonly<Record<string, unknown>>,
): Result<Readonly<Record<string, ClaimOpportunity>>, SdkError> {
  if (!isPlainRecord(value)) {
    return fail(createCommercePersistenceInvalidError("Commerce claimOpportunities must be an object.", metadata));
  }

  const output: Record<string, ClaimOpportunity> = {};
  for (const sourceKey of Object.keys(value).sort()) {
    const opportunity = value[sourceKey];
    if (!isPlainRecord(opportunity) || opportunity["sourceKey"] !== sourceKey) {
      return fail(createCommercePersistenceInvalidError("Commerce claim opportunity is invalid.", {
        ...metadata,
        sourceKey,
      }));
    }
    if (
      !isNonEmptyString(opportunity["definitionHash"]) ||
      !isClaimStatus(opportunity["status"]) ||
      !isPositiveSafeInteger(opportunity["claimLimit"]) ||
      !isNonNegativeSafeInteger(opportunity["claimedCount"]) ||
      !isFiniteTimestamp(opportunity["createdAtMs"]) ||
      !isFiniteTimestamp(opportunity["updatedAtMs"])
    ) {
      return fail(createCommercePersistenceInvalidError("Commerce claim opportunity fields are invalid.", {
        ...metadata,
        sourceKey,
      }));
    }
    let reward: RewardBundle | undefined;
    let cost: SpendBundle | undefined;
    if (opportunity["status"] === "claimed") {
      if (
        opportunity["reward"] !== undefined ||
        opportunity["cost"] !== undefined ||
        opportunity["metadata"] !== undefined
      ) {
        return fail(createCommercePersistenceInvalidError("Commerce claimed tombstone contains active fields.", {
          ...metadata,
          sourceKey,
        }));
      }
    } else {
      const rewardResult = readPersistedRewardBundle(opportunity["reward"], {
        ...metadata,
        sourceKey,
        field: "reward",
      });
      if (!rewardResult.ok) {
        return fail(rewardResult.error);
      }
      reward = rewardResult.value;

      if (opportunity["cost"] !== undefined) {
        const costResult = readPersistedSpendBundle(opportunity["cost"], {
          ...metadata,
          sourceKey,
          field: "cost",
        });
        if (!costResult.ok) {
          return fail(costResult.error);
        }
        cost = costResult.value;
      }

      if (opportunity["metadata"] !== undefined && !isJsonObject(opportunity["metadata"])) {
        return fail(createCommercePersistenceInvalidError("Commerce claim opportunity metadata is invalid.", {
          ...metadata,
          sourceKey,
        }));
      }
    }
    if (opportunity["expiresAtMs"] !== undefined && !isFiniteTimestamp(opportunity["expiresAtMs"])) {
      return fail(createCommercePersistenceInvalidError("Commerce claim opportunity expiresAtMs is invalid.", {
        ...metadata,
        sourceKey,
      }));
    }
    const tombstoneRetention = readPersistedClaimTombstoneRetentionPolicy(
      opportunity["tombstoneRetention"],
      {
        ...metadata,
        sourceKey,
        field: "tombstoneRetention",
      },
    );
    if (!tombstoneRetention.ok) {
      return fail(tombstoneRetention.error);
    }
    const baseOpportunity = {
      sourceKey,
      definitionHash: opportunity["definitionHash"],
      status: opportunity["status"],
      claimLimit: opportunity["claimLimit"],
      claimedCount: opportunity["claimedCount"],
      createdAtMs: opportunity["createdAtMs"],
      updatedAtMs: opportunity["updatedAtMs"],
      ...(opportunity["expiresAtMs"] === undefined
        ? {}
        : { expiresAtMs: opportunity["expiresAtMs"] }),
      ...(tombstoneRetention.value === undefined
        ? {}
        : { tombstoneRetention: tombstoneRetention.value }),
    };
    defineRecordEntry(output, sourceKey, opportunity["status"] === "claimed"
      ? baseOpportunity as ClaimOpportunity
      : {
          ...baseOpportunity,
          reward: reward as RewardBundle,
          ...(cost === undefined
            ? {}
            : { cost }),
          ...(opportunity["metadata"] === undefined
            ? {}
            : { metadata: cloneJsonObject(opportunity["metadata"]) }),
        } as ClaimOpportunity);
  }
  return ok(output);
}

function readLedger(
  value: unknown,
  metadata: Readonly<Record<string, unknown>>,
): Result<readonly CommerceLedgerEntry[], SdkError> {
  if (!Array.isArray(value)) {
    return fail(createCommercePersistenceInvalidError("Commerce ledger must be an array.", metadata));
  }

  const ledger: CommerceLedgerEntry[] = [];
  for (const entry of value) {
    if (
      !isPlainRecord(entry) ||
      !isNonEmptyString(entry["ledgerId"]) ||
      !isNonEmptyString(entry["commandKey"]) ||
      !isCommerceCommandType(entry["commandType"]) ||
      !isNonEmptyString(entry["reason"]) ||
      !isNonEmptyString(entry["source"]) ||
      !isFiniteTimestamp(entry["createdAtMs"]) ||
      !Array.isArray(entry["deltas"])
    ) {
      return fail(createCommercePersistenceInvalidError("Commerce ledger entry is invalid.", metadata));
    }

    const deltas = readDeltas(entry["deltas"], {
      ...metadata,
      ledgerId: entry["ledgerId"],
    });
    if (!deltas.ok) {
      return fail(deltas.error);
    }
    if (entry["metadata"] !== undefined && !isJsonObject(entry["metadata"])) {
      return fail(createCommercePersistenceInvalidError("Commerce ledger metadata is invalid.", {
        ...metadata,
        ledgerId: entry["ledgerId"],
      }));
    }

    ledger.push({
      ledgerId: entry["ledgerId"],
      commandKey: entry["commandKey"],
      commandType: entry["commandType"],
      reason: entry["reason"],
      source: entry["source"],
      deltas: deltas.value,
      createdAtMs: entry["createdAtMs"],
      ...(entry["metadata"] === undefined
        ? {}
        : { metadata: entry["metadata"] as Readonly<Record<string, unknown>> }),
    });
  }

  return ok(ledger);
}

function readDeltas(
  value: readonly unknown[],
  metadata: Readonly<Record<string, unknown>>,
): Result<readonly CommerceResourceDelta[], SdkError> {
  const deltas: CommerceResourceDelta[] = [];
  for (const delta of value) {
    if (
      !isPlainRecord(delta) ||
      !isResourceDomain(delta["domain"]) ||
      !isNonEmptyString(delta["resourceId"]) ||
      !Number.isSafeInteger(delta["amountDelta"])
    ) {
      return fail(createCommercePersistenceInvalidError("Commerce ledger delta is invalid.", metadata));
    }
    if (delta["previousAmount"] !== undefined && !isNonNegativeSafeInteger(delta["previousAmount"])) {
      return fail(createCommercePersistenceInvalidError("Commerce ledger previousAmount is invalid.", metadata));
    }
    if (delta["nextAmount"] !== undefined && !isNonNegativeSafeInteger(delta["nextAmount"])) {
      return fail(createCommercePersistenceInvalidError("Commerce ledger nextAmount is invalid.", metadata));
    }
    if (delta["previousOwned"] !== undefined && typeof delta["previousOwned"] !== "boolean") {
      return fail(createCommercePersistenceInvalidError("Commerce ledger previousOwned is invalid.", metadata));
    }
    if (delta["nextOwned"] !== undefined && typeof delta["nextOwned"] !== "boolean") {
      return fail(createCommercePersistenceInvalidError("Commerce ledger nextOwned is invalid.", metadata));
    }

    deltas.push(delta as unknown as CommerceResourceDelta);
  }
  return ok(deltas);
}

function readCommandReceipts(
  value: unknown,
  metadata: Readonly<Record<string, unknown>>,
): Result<Readonly<Record<string, CommerceCommandReceipt>>, SdkError> {
  if (!isPlainRecord(value)) {
    return fail(createCommercePersistenceInvalidError("Commerce commandReceipts must be an object.", metadata));
  }

  const output: Record<string, CommerceCommandReceipt> = {};
  for (const commandKey of Object.keys(value).sort()) {
    const receipt = value[commandKey];
    if (
      !isPlainRecord(receipt) ||
      receipt["commandKey"] !== commandKey ||
      !isCommerceCommandType(receipt["commandType"]) ||
      !isNonEmptyString(receipt["payloadHash"]) ||
      !isCommandResultKind(receipt["resultKind"]) ||
      !isFiniteTimestamp(receipt["createdAtMs"])
    ) {
      return fail(createCommercePersistenceInvalidError("Commerce command receipt is invalid.", {
        ...metadata,
        commandKey,
      }));
    }
    if (receipt["ledgerIds"] !== undefined && !isStringArray(receipt["ledgerIds"])) {
      return fail(createCommercePersistenceInvalidError("Commerce command receipt ledgerIds are invalid.", {
        ...metadata,
        commandKey,
      }));
    }
    if (receipt["claimId"] !== undefined && !isNonEmptyString(receipt["claimId"])) {
      return fail(createCommercePersistenceInvalidError("Commerce command receipt claimId is invalid.", {
        ...metadata,
        commandKey,
      }));
    }
    if (receipt["sourceKey"] !== undefined && !isNonEmptyString(receipt["sourceKey"])) {
      return fail(createCommercePersistenceInvalidError("Commerce command receipt sourceKey is invalid.", {
        ...metadata,
        commandKey,
      }));
    }
    defineRecordEntry(output, commandKey, {
      commandKey,
      commandType: receipt["commandType"],
      payloadHash: receipt["payloadHash"],
      resultKind: receipt["resultKind"],
      createdAtMs: receipt["createdAtMs"],
      ...(receipt["ledgerIds"] === undefined ? {} : { ledgerIds: receipt["ledgerIds"] as readonly string[] }),
      ...(receipt["claimId"] === undefined ? {} : { claimId: receipt["claimId"] }),
      ...(receipt["sourceKey"] === undefined ? {} : { sourceKey: receipt["sourceKey"] }),
    });
  }
  return ok(output);
}

function readPersistedRewardBundle(
  value: unknown,
  metadata: Readonly<Record<string, unknown>>,
): Result<RewardBundle, SdkError> {
  const reward = validateRewardBundle(value);
  if (!reward.ok) {
    return fail(createCommercePersistenceInvalidError("Commerce persisted reward bundle is invalid.", {
      ...metadata,
      causeCode: reward.error.code,
      causeMessage: reward.error.message,
      ...(reward.error.metadata === undefined ? {} : { causeMetadata: reward.error.metadata }),
    }));
  }

  return ok(reward.value.reward);
}

function readPersistedSpendBundle(
  value: unknown,
  metadata: Readonly<Record<string, unknown>>,
): Result<SpendBundle, SdkError> {
  const spend = validateSpendBundle(value);
  if (!spend.ok) {
    return fail(createCommercePersistenceInvalidError("Commerce persisted spend bundle is invalid.", {
      ...metadata,
      causeCode: spend.error.code,
      causeMessage: spend.error.message,
      ...(spend.error.metadata === undefined ? {} : { causeMetadata: spend.error.metadata }),
    }));
  }

  return ok(spend.value.spend);
}

function readPersistedClaimTombstoneRetentionPolicy(
  value: unknown,
  metadata: Readonly<Record<string, unknown>>,
): Result<ClaimTombstoneRetentionPolicy | undefined, SdkError> {
  if (value === undefined) {
    return ok(undefined);
  }
  if (!isPlainRecord(value)) {
    return fail(createCommercePersistenceInvalidError("Commerce claim tombstone retention is invalid.", metadata));
  }

  switch (value["kind"]) {
    case "permanent":
      return ok(undefined);
    case "cycle":
      if (!isNonEmptyString(value["scopeKey"]) || !isNonEmptyString(value["cycleKey"])) {
        return fail(createCommercePersistenceInvalidError("Commerce cycle tombstone retention is invalid.", metadata));
      }
      if (value["maxCycles"] !== undefined && !isPositiveSafeInteger(value["maxCycles"])) {
        return fail(createCommercePersistenceInvalidError("Commerce cycle tombstone maxCycles is invalid.", metadata));
      }
      return ok({
        kind: "cycle",
        scopeKey: value["scopeKey"],
        cycleKey: value["cycleKey"],
        ...(value["maxCycles"] === undefined ? {} : { maxCycles: value["maxCycles"] }),
      });
    case "ephemeral":
      if (value["scopeKey"] !== undefined && !isNonEmptyString(value["scopeKey"])) {
        return fail(createCommercePersistenceInvalidError("Commerce ephemeral tombstone scopeKey is invalid.", metadata));
      }
      if (value["ttlMs"] !== undefined && !isPositiveSafeInteger(value["ttlMs"])) {
        return fail(createCommercePersistenceInvalidError("Commerce ephemeral tombstone ttlMs is invalid.", metadata));
      }
      if (value["maxEntries"] !== undefined && !isPositiveSafeInteger(value["maxEntries"])) {
        return fail(createCommercePersistenceInvalidError("Commerce ephemeral tombstone maxEntries is invalid.", metadata));
      }
      return ok({
        kind: "ephemeral",
        ...(value["scopeKey"] === undefined ? {} : { scopeKey: value["scopeKey"] }),
        ...(value["ttlMs"] === undefined ? {} : { ttlMs: value["ttlMs"] }),
        ...(value["maxEntries"] === undefined ? {} : { maxEntries: value["maxEntries"] }),
      });
    default:
      return fail(createCommercePersistenceInvalidError("Commerce claim tombstone retention kind is invalid.", {
        ...metadata,
        kind: value["kind"],
      }));
  }
}

function mapProfileCodeToCommercePersistenceCode(code: SdkErrorCode): SdkErrorCode {
  switch (code) {
    case "profile.unavailable":
    case "profile.local_store_unavailable":
      return "commerce.persistence_unavailable";
    case "profile.sync_conflict_open":
    case "profile.local_revision_conflict":
    case "profile.command_replay_conflict":
      return "commerce.persistence_conflict";
    case "profile.module_invalid":
    case "profile.module_owner_forbidden":
    case "profile.module_revision_conflict":
      return "commerce.persistence_invalid";
    default:
      return "commerce.persistence_unavailable";
  }
}

function createMappedPersistenceMessage(code: SdkErrorCode): string {
  switch (code) {
    case "commerce.persistence_unavailable":
      return "Commerce profile persistence is unavailable.";
    case "commerce.persistence_conflict":
      return "Commerce profile persistence has a conflict.";
    case "commerce.persistence_invalid":
      return "Commerce profile persistence is invalid.";
    default:
      return "Commerce profile persistence failed.";
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonObject(value: unknown): value is Record<string, ProfileJsonValue> {
  return isPlainRecord(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isCommerceCommandType(value: unknown): value is CommerceCommandType {
  return (
    value === "grant" ||
    value === "spend" ||
    value === "upsert_claim_opportunity" ||
    value === "claim"
  );
}

function isResourceDomain(value: unknown): value is "wallet" | "inventory" | "entitlement" {
  return value === "wallet" || value === "inventory" || value === "entitlement";
}

function isCommandResultKind(value: unknown): value is "applied" | "replayed" {
  return value === "applied" || value === "replayed";
}

function isClaimStatus(value: unknown): value is "open" | "claimed" | "expired" | "closed" {
  return value === "open" || value === "claimed" || value === "expired" || value === "closed";
}

function cloneJsonObject<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
