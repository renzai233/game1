import { fail, ok, type Result } from "../core/result";
import { createInvalidBundleError } from "./errors";
import { defineRecordEntry } from "./record";
import type { RewardBundle, SpendBundle } from "./types";

export interface NormalizedResourceAmount {
  readonly domain: "wallet" | "inventory";
  readonly resourceId: string;
  readonly amount: number;
}

export interface NormalizedEntitlementGrant {
  readonly resourceId: string;
}

export interface NormalizedRewardBundle {
  readonly reward: RewardBundle;
  readonly wallet: readonly NormalizedResourceAmount[];
  readonly inventory: readonly NormalizedResourceAmount[];
  readonly entitlements: readonly NormalizedEntitlementGrant[];
}

export interface NormalizedSpendBundle {
  readonly spend: SpendBundle;
  readonly wallet: readonly NormalizedResourceAmount[];
  readonly inventory: readonly NormalizedResourceAmount[];
}

export interface ValidateBundleOptions {
  readonly allowEmpty?: boolean;
}

type PlainRecord = Record<string, unknown>;

const REWARD_KEYS = new Set(["wallet", "inventory", "entitlements"]);
const SPEND_KEYS = new Set(["wallet", "inventory"]);

export function validateRewardBundle(
  bundle: unknown,
  options: ValidateBundleOptions = {},
): Result<NormalizedRewardBundle, ReturnType<typeof createInvalidBundleError>> {
  const root = validateBundleRoot(bundle, REWARD_KEYS, "reward");
  if (!root.ok) {
    return root;
  }

  const wallet = validateAmountDomain(root.value, "wallet");
  if (!wallet.ok) {
    return wallet;
  }

  const inventory = validateAmountDomain(root.value, "inventory");
  if (!inventory.ok) {
    return inventory;
  }

  const entitlements = validateEntitlementDomain(root.value);
  if (!entitlements.ok) {
    return entitlements;
  }

  const resourceCount = wallet.value.length + inventory.value.length + entitlements.value.length;
  if (resourceCount === 0 && options.allowEmpty !== true) {
    return fail(createInvalidBundleError("RewardBundle must contain at least one resource."));
  }

  return ok({
    reward: createRewardBundle(wallet.value, inventory.value, entitlements.value),
    wallet: wallet.value,
    inventory: inventory.value,
    entitlements: entitlements.value,
  });
}

export function validateSpendBundle(
  bundle: unknown,
  options: ValidateBundleOptions = {},
): Result<NormalizedSpendBundle, ReturnType<typeof createInvalidBundleError>> {
  const root = validateBundleRoot(bundle, SPEND_KEYS, "spend");
  if (!root.ok) {
    return root;
  }

  const wallet = validateAmountDomain(root.value, "wallet");
  if (!wallet.ok) {
    return wallet;
  }

  const inventory = validateAmountDomain(root.value, "inventory");
  if (!inventory.ok) {
    return inventory;
  }

  const resourceCount = wallet.value.length + inventory.value.length;
  if (resourceCount === 0 && options.allowEmpty !== true) {
    return fail(createInvalidBundleError("SpendBundle must contain at least one resource."));
  }

  return ok({
    spend: createSpendBundle(wallet.value, inventory.value),
    wallet: wallet.value,
    inventory: inventory.value,
  });
}

function validateBundleRoot(
  bundle: unknown,
  allowedKeys: ReadonlySet<string>,
  bundleName: "reward" | "spend",
): Result<PlainRecord, ReturnType<typeof createInvalidBundleError>> {
  if (!isPlainObject(bundle)) {
    return fail(createInvalidBundleError(`${bundleName} bundle must be a plain object.`));
  }

  if (Object.getOwnPropertySymbols(bundle).length > 0) {
    return fail(createInvalidBundleError(`${bundleName} bundle must not contain symbol keys.`));
  }

  const record = bundle as PlainRecord;
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      return fail(
        createInvalidBundleError(`${bundleName} bundle contains an unsupported domain.`, {
          domain: key,
        }),
      );
    }
  }

  return ok(record);
}

function validateAmountDomain(
  bundle: PlainRecord,
  domain: "wallet" | "inventory",
): Result<readonly NormalizedResourceAmount[], ReturnType<typeof createInvalidBundleError>> {
  if (!Object.prototype.hasOwnProperty.call(bundle, domain)) {
    return ok([]);
  }

  const value = bundle[domain];
  if (!isPlainObject(value)) {
    return fail(
      createInvalidBundleError(`${domain} resources must be a plain object.`, { domain }),
    );
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    return fail(
      createInvalidBundleError(`${domain} resources must not contain symbol keys.`, { domain }),
    );
  }

  const record = value as PlainRecord;
  const resources: NormalizedResourceAmount[] = [];
  for (const resourceId of Object.keys(record).sort()) {
    if (!isValidResourceId(resourceId)) {
      return fail(
        createInvalidBundleError("Resource id must be a non-empty string.", {
          domain,
          resourceId,
        }),
      );
    }

    const amount = record[resourceId];
    if (!isPositiveSafeInteger(amount)) {
      return fail(
        createInvalidBundleError("Resource amount must be a positive safe integer.", {
          domain,
          resourceId,
          amount,
        }),
      );
    }

    resources.push({ domain, resourceId, amount });
  }

  return ok(resources);
}

function validateEntitlementDomain(
  bundle: PlainRecord,
): Result<readonly NormalizedEntitlementGrant[], ReturnType<typeof createInvalidBundleError>> {
  if (!Object.prototype.hasOwnProperty.call(bundle, "entitlements")) {
    return ok([]);
  }

  const value = bundle.entitlements;
  if (!isPlainObject(value)) {
    return fail(
      createInvalidBundleError("entitlements resources must be a plain object.", {
        domain: "entitlements",
      }),
    );
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    return fail(
      createInvalidBundleError("entitlements resources must not contain symbol keys.", {
        domain: "entitlements",
      }),
    );
  }

  const record = value as PlainRecord;
  const entitlements: NormalizedEntitlementGrant[] = [];
  for (const resourceId of Object.keys(record).sort()) {
    if (!isValidResourceId(resourceId)) {
      return fail(
        createInvalidBundleError("Resource id must be a non-empty string.", {
          domain: "entitlements",
          resourceId,
        }),
      );
    }

    if (record[resourceId] !== true) {
      return fail(
        createInvalidBundleError("RewardBundle entitlements can only grant true ownership.", {
          domain: "entitlements",
          resourceId,
        }),
      );
    }

    entitlements.push({ resourceId });
  }

  return ok(entitlements);
}

function createRewardBundle(
  wallet: readonly NormalizedResourceAmount[],
  inventory: readonly NormalizedResourceAmount[],
  entitlements: readonly NormalizedEntitlementGrant[],
): RewardBundle {
  const reward: {
    wallet?: Record<string, number>;
    inventory?: Record<string, number>;
    entitlements?: Record<string, boolean>;
  } = {};

  if (wallet.length > 0) {
    reward.wallet = createAmountRecord(wallet);
  }
  if (inventory.length > 0) {
    reward.inventory = createAmountRecord(inventory);
  }
  if (entitlements.length > 0) {
    const entitlementRecord: Record<string, boolean> = {};
    for (const entry of entitlements) {
      defineRecordEntry(entitlementRecord, entry.resourceId, true);
    }
    reward.entitlements = entitlementRecord;
  }

  return reward;
}

function createSpendBundle(
  wallet: readonly NormalizedResourceAmount[],
  inventory: readonly NormalizedResourceAmount[],
): SpendBundle {
  const spend: {
    wallet?: Record<string, number>;
    inventory?: Record<string, number>;
  } = {};

  if (wallet.length > 0) {
    spend.wallet = createAmountRecord(wallet);
  }
  if (inventory.length > 0) {
    spend.inventory = createAmountRecord(inventory);
  }

  return spend;
}

function createAmountRecord(resources: readonly NormalizedResourceAmount[]): Record<string, number> {
  const record: Record<string, number> = {};
  for (const resource of resources) {
    defineRecordEntry(record, resource.resourceId, resource.amount);
  }
  return record;
}

function isPlainObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isValidResourceId(value: string): boolean {
  return value.trim().length > 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
