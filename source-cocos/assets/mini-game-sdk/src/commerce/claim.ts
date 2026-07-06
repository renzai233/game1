import { fail, ok, type Result } from "../core/result";
import { evaluateSpendAffordability } from "./affordability";
import {
  validateRewardBundle,
  validateSpendBundle,
  type NormalizedRewardBundle,
  type NormalizedResourceAmount,
  type NormalizedSpendBundle,
} from "./bundle";
import {
  checkCommandReceiptReplay,
  hashCommerceCommandPayload,
  hashCommerceJsonObject,
  validateCommerceCommandMeta,
  validateCommerceBudgetedString,
  type CommerceJsonObject,
  type ValidatedCommerceCommandMeta,
} from "./command";
import { createCommerceError, createInvalidBundleError } from "./errors";
import { defineRecordEntry, readOwn, withRecordEntry } from "./record";
import {
  cloneBooleanRecord,
  cloneNumberRecord,
  withCommandReceipt,
} from "./state";
import type { SdkError } from "../core/errors";
import type {
  ActiveClaimOpportunity,
  ClaimOpportunity,
  ClaimOpportunityInput,
  ClaimOpportunityOutput,
  ClaimTombstoneRetentionPolicy,
  ClaimedClaimOpportunityTombstone,
  CommerceCommandReceipt,
  CommerceLedgerEntry,
  CommerceResourceDelta,
  CommerceState,
  RewardBundle,
  SpendBundle,
  UpsertClaimOpportunityInput,
  UpsertClaimOpportunityOutput,
} from "./types";

const COMMERCE_SOURCE_KEY_MAX_LENGTH = 128;
const COMMERCE_SCOPE_KEY_MAX_LENGTH = 128;
const COMMERCE_CYCLE_KEY_MAX_LENGTH = 64;

export interface CommerceClaimReducerOptions {
  readonly nowMs?: number;
}

interface PreparedClaimCommand {
  readonly commandKey: string;
  readonly payloadHash: string;
  readonly meta: ValidatedCommerceCommandMeta;
}

interface PreparedUpsertDefinition {
  readonly sourceKey: string;
  readonly reward: NormalizedRewardBundle;
  readonly cost?: NormalizedSpendBundle;
  readonly claimLimit: number;
  readonly expiresAtMs?: number;
  readonly definitionHash: string;
  readonly metadata?: CommerceJsonObject;
  readonly tombstoneRetention?: ClaimTombstoneRetentionPolicy;
}

interface AppliedReward {
  readonly wallet: Record<string, number>;
  readonly inventory: Record<string, number>;
  readonly entitlements: Record<string, boolean>;
  readonly deltas: readonly CommerceResourceDelta[];
}

interface AppliedSpend {
  readonly wallet: Record<string, number>;
  readonly inventory: Record<string, number>;
  readonly deltas: readonly CommerceResourceDelta[];
}

export function upsertClaimOpportunityInState(
  state: CommerceState,
  input: UpsertClaimOpportunityInput,
  options: CommerceClaimReducerOptions = {},
): Result<UpsertClaimOpportunityOutput, SdkError> {
  const prepared = prepareUpsertClaimOpportunity(input);
  if (!prepared.ok) {
    return fail(prepared.error);
  }

  const command = prepareUpsertCommand(input, prepared.value);
  if (!command.ok) {
    return fail(command.error);
  }

  const replay = checkCommandReceiptReplay(state, {
    commandKey: command.value.commandKey,
    commandType: "upsert_claim_opportunity",
    payloadHash: command.value.payloadHash,
  });
  if (!replay.ok) {
    return fail(replay.error);
  }
  if (replay.value.kind === "replayed") {
    return ok({
      kind: "replayed",
      state,
      sourceKey: prepared.value.sourceKey,
      definitionHash: prepared.value.definitionHash,
      currentOpportunity: readOwn(state.claimOpportunities, prepared.value.sourceKey) ?? null,
      receipt: replay.value.receipt,
    });
  }

  const nowMs = resolveNowMs(state, options);
  const existing = readOwn(state.claimOpportunities, prepared.value.sourceKey);
  if (existing !== undefined) {
    if (existing.definitionHash !== prepared.value.definitionHash) {
      return fail(
        createCommerceError(
          "commerce.claim_definition_conflict",
          "Claim opportunity definition changed for an existing sourceKey.",
          {
            commandKey: command.value.commandKey,
            sourceKey: prepared.value.sourceKey,
            existingDefinitionHash: existing.definitionHash,
            definitionHash: prepared.value.definitionHash,
          },
        ),
      );
    }

    const receipt = createUpsertReceipt(command.value, nowMs, prepared.value);
    return ok({
      kind: "noop",
      state: {
        ...state,
        commandReceipts: withCommandReceipt(state.commandReceipts, receipt),
        updatedAtMs: nowMs,
      },
      opportunity: existing,
      receipt,
    });
  }

  const opportunity = createClaimOpportunity(prepared.value, nowMs);
  const receipt = createUpsertReceipt(command.value, nowMs, prepared.value);
  return ok({
    kind: "created",
    state: {
      ...state,
      claimOpportunities: withRecordEntry(
        state.claimOpportunities,
        prepared.value.sourceKey,
        opportunity,
      ),
      commandReceipts: withCommandReceipt(state.commandReceipts, receipt),
      updatedAtMs: nowMs,
    },
    opportunity,
    receipt,
  });
}

export function claimOpportunityInState(
  state: CommerceState,
  input: ClaimOpportunityInput,
  options: CommerceClaimReducerOptions = {},
): Result<ClaimOpportunityOutput, SdkError> {
  const command = prepareClaimCommand(input);
  if (!command.ok) {
    return fail(command.error);
  }

  const replay = checkCommandReceiptReplay(state, {
    commandKey: command.value.commandKey,
    commandType: "claim",
    payloadHash: command.value.payloadHash,
  });
  if (!replay.ok) {
    return fail(replay.error);
  }
  if (replay.value.kind === "replayed") {
    return replayClaimFromReceipt(state, replay.value.receipt);
  }

  const sourceKey = readSourceKey(input, command.value.commandKey);
  if (!sourceKey.ok) {
    return fail(sourceKey.error);
  }

  const opportunity = readOwn(state.claimOpportunities, sourceKey.value);
  if (opportunity === undefined) {
    return fail(
      createCommerceError("commerce.claim_not_found", "Claim opportunity was not found.", {
        commandKey: command.value.commandKey,
        sourceKey: sourceKey.value,
      }),
    );
  }

  const nowMs = resolveNowMs(state, options);
  if (opportunity.status === "claimed" || opportunity.claimedCount >= opportunity.claimLimit) {
    return fail(
      createCommerceError("commerce.claim_limit_exceeded", "Claim opportunity limit was exceeded.", {
        commandKey: command.value.commandKey,
        sourceKey: sourceKey.value,
        claimLimit: opportunity.claimLimit,
        claimedCount: opportunity.claimedCount,
      }),
    );
  }

  if (opportunity.status === "expired" || hasExpired(opportunity, nowMs)) {
    return fail(
      createCommerceError("commerce.claim_expired", "Claim opportunity has expired.", {
        commandKey: command.value.commandKey,
        sourceKey: sourceKey.value,
        expiresAtMs: opportunity.expiresAtMs,
      }),
    );
  }

  if (opportunity.status !== "open") {
    return fail(
      createCommerceError("commerce.claim_not_found", "Claim opportunity is not open.", {
        commandKey: command.value.commandKey,
        sourceKey: sourceKey.value,
        status: opportunity.status,
      }),
    );
  }

  const reward = validateRewardBundle(opportunity.reward);
  if (!reward.ok) {
    return fail(reward.error);
  }
  const cost = opportunity.cost === undefined ? undefined : validateSpendBundle(opportunity.cost);
  if (cost !== undefined && !cost.ok) {
    return fail(cost.error);
  }

  if (cost !== undefined) {
    const affordability = evaluateSpendAffordability(state, cost.value);
    if (!affordability.affordable) {
      return fail(
        createCommerceError("commerce.insufficient_funds", "Commerce resources are insufficient.", {
          commandKey: command.value.commandKey,
          sourceKey: sourceKey.value,
          missing: affordability.missing,
        }),
      );
    }
  }

  const spent = cost === undefined
    ? {
        wallet: cloneNumberRecord(state.wallet),
        inventory: cloneNumberRecord(state.inventory),
        deltas: [] as CommerceResourceDelta[],
      }
    : applySpend(state, cost.value);
  const rewarded = applyReward(
    {
      wallet: spent.wallet,
      inventory: spent.inventory,
      entitlements: cloneBooleanRecord(state.entitlements),
    },
    reward.value,
  );
  if (!rewarded.ok) {
    return fail(rewarded.error);
  }

  const claimedCount = opportunity.claimedCount + 1;
  const nextOpportunity = claimedCount >= opportunity.claimLimit
    ? createClaimedTombstone(opportunity, claimedCount, nowMs)
    : {
        ...opportunity,
        claimedCount,
        updatedAtMs: nowMs,
      };
  const claimId = `commerce.claim:${command.value.commandKey}`;
  const ledgerEntry = createClaimLedgerEntry({
    command: command.value,
    deltas: [...spent.deltas, ...rewarded.value.deltas],
    nowMs,
  });
  const receipt = createClaimReceipt(command.value, nowMs, claimId, sourceKey.value, [
    ledgerEntry.ledgerId,
  ]);

  const nextState: CommerceState = {
    ...state,
    wallet: rewarded.value.wallet,
    inventory: rewarded.value.inventory,
    entitlements: rewarded.value.entitlements,
    claimOpportunities: withRecordEntry(state.claimOpportunities, sourceKey.value, nextOpportunity),
    ledger: [...state.ledger, ledgerEntry],
    commandReceipts: withCommandReceipt(state.commandReceipts, receipt),
    updatedAtMs: nowMs,
  };

  return ok({
    kind: "applied",
    claimId,
    sourceKey: sourceKey.value,
    state: nextState,
    reward: reward.value.reward,
    ...(cost === undefined ? {} : { cost: cost.value.spend }),
    receipt,
    ledgerEntries: [ledgerEntry],
  });
}

export function normalizeExpiredClaimOpportunities(
  state: CommerceState,
  nowMs: number,
): CommerceState {
  let changed = false;
  const normalized: Record<string, ClaimOpportunity> = {};

  for (const sourceKey of Object.keys(state.claimOpportunities).sort()) {
    const opportunity = state.claimOpportunities[sourceKey];
    if (opportunity.status === "open" && hasExpired(opportunity, nowMs)) {
      changed = true;
      defineRecordEntry(normalized, sourceKey, {
        ...opportunity,
        status: "expired",
      });
      continue;
    }

    defineRecordEntry(normalized, sourceKey, opportunity);
  }

  if (!changed) {
    return state;
  }

  return {
    ...state,
    claimOpportunities: normalized,
  };
}

export function computeClaimDefinitionHash(input: {
  readonly reward: RewardBundle;
  readonly cost?: SpendBundle;
  readonly claimLimit: number;
  readonly expiresAtMs?: number;
  readonly metadata?: CommerceJsonObject;
  readonly tombstoneRetention?: ClaimTombstoneRetentionPolicy;
}): Result<string, SdkError> {
  const definition: CommerceJsonObject = {
    reward: input.reward as unknown as CommerceJsonObject,
    claimLimit: input.claimLimit,
    ...(input.cost === undefined ? {} : { cost: input.cost as unknown as CommerceJsonObject }),
    ...(input.expiresAtMs === undefined ? {} : { expiresAtMs: input.expiresAtMs }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    ...(input.tombstoneRetention === undefined
      ? {}
      : { tombstoneRetention: input.tombstoneRetention as unknown as CommerceJsonObject }),
  };

  return hashCommerceJsonObject(definition);
}

function prepareUpsertClaimOpportunity(
  input: UpsertClaimOpportunityInput,
): Result<PreparedUpsertDefinition, SdkError> {
  const commandMeta = validateCommerceCommandMeta(input);
  if (!commandMeta.ok) {
    return fail(commandMeta.error);
  }

  const sourceKey = readSourceKey(input, commandMeta.value.commandKey);
  if (!sourceKey.ok) {
    return fail(sourceKey.error);
  }

  const reward = validateRewardBundle(input.reward);
  if (!reward.ok) {
    return fail(reward.error);
  }

  const cost = input.cost === undefined ? undefined : validateSpendBundle(input.cost);
  if (cost !== undefined && !cost.ok) {
    return fail(cost.error);
  }

  const claimLimit = input.claimLimit ?? 1;
  if (!isPositiveSafeInteger(claimLimit)) {
    return fail(
      createInvalidBundleError("Claim opportunity claimLimit must be a positive safe integer.", {
        commandKey: commandMeta.value.commandKey,
        sourceKey: sourceKey.value,
        claimLimit,
      }),
    );
  }

  if (input.expiresAtMs !== undefined && !isFiniteTimestamp(input.expiresAtMs)) {
    return fail(
      createInvalidBundleError("Claim opportunity expiresAtMs must be a finite timestamp.", {
        commandKey: commandMeta.value.commandKey,
        sourceKey: sourceKey.value,
        expiresAtMs: input.expiresAtMs,
      }),
    );
  }

  const tombstoneRetention = normalizeClaimTombstoneRetentionPolicy(input.tombstoneRetention, {
    commandKey: commandMeta.value.commandKey,
    sourceKey: sourceKey.value,
  });
  if (!tombstoneRetention.ok) {
    return fail(tombstoneRetention.error);
  }

  const definitionHash = computeClaimDefinitionHash({
    reward: reward.value.reward,
    ...(cost === undefined ? {} : { cost: cost.value.spend }),
    claimLimit,
    ...(input.expiresAtMs === undefined ? {} : { expiresAtMs: input.expiresAtMs }),
    ...(commandMeta.value.metadata === undefined ? {} : { metadata: commandMeta.value.metadata }),
    ...(tombstoneRetention.value === undefined
      ? {}
      : { tombstoneRetention: tombstoneRetention.value }),
  });
  if (!definitionHash.ok) {
    return fail(definitionHash.error);
  }

  return ok({
    sourceKey: sourceKey.value,
    reward: reward.value,
    ...(cost === undefined ? {} : { cost: cost.value }),
    claimLimit,
    ...(input.expiresAtMs === undefined ? {} : { expiresAtMs: input.expiresAtMs }),
    definitionHash: definitionHash.value,
    ...(commandMeta.value.metadata === undefined ? {} : { metadata: commandMeta.value.metadata }),
    ...(tombstoneRetention.value === undefined
      ? {}
      : { tombstoneRetention: tombstoneRetention.value }),
  });
}

function prepareUpsertCommand(
  input: UpsertClaimOpportunityInput,
  definition: PreparedUpsertDefinition,
): Result<PreparedClaimCommand, SdkError> {
  const meta = validateCommerceCommandMeta(input);
  if (!meta.ok) {
    return fail(meta.error);
  }

  const payloadHash = hashCommerceCommandPayload("upsert_claim_opportunity", {
    commandKey: meta.value.commandKey,
    reason: meta.value.reason,
    source: meta.value.source,
    sourceKey: definition.sourceKey,
    reward: definition.reward.reward as unknown as CommerceJsonObject,
    ...(definition.cost === undefined
      ? {}
      : { cost: definition.cost.spend as unknown as CommerceJsonObject }),
    claimLimit: definition.claimLimit,
    ...(definition.expiresAtMs === undefined ? {} : { expiresAtMs: definition.expiresAtMs }),
    ...(meta.value.metadata === undefined ? {} : { metadata: meta.value.metadata }),
    ...(definition.tombstoneRetention === undefined
      ? {}
      : { tombstoneRetention: definition.tombstoneRetention as unknown as CommerceJsonObject }),
  });
  if (!payloadHash.ok) {
    return fail(payloadHash.error);
  }

  return ok({
    commandKey: meta.value.commandKey,
    payloadHash: payloadHash.value,
    meta: meta.value,
  });
}

function prepareClaimCommand(input: ClaimOpportunityInput): Result<PreparedClaimCommand, SdkError> {
  const meta = validateCommerceCommandMeta(input);
  if (!meta.ok) {
    return fail(meta.error);
  }

  const sourceKey = readSourceKey(input, meta.value.commandKey);
  if (!sourceKey.ok) {
    return fail(sourceKey.error);
  }

  const payloadHash = hashCommerceCommandPayload("claim", {
    commandKey: meta.value.commandKey,
    reason: meta.value.reason,
    source: meta.value.source,
    sourceKey: sourceKey.value,
    ...(meta.value.metadata === undefined ? {} : { metadata: meta.value.metadata }),
  });
  if (!payloadHash.ok) {
    return fail(payloadHash.error);
  }

  return ok({
    commandKey: meta.value.commandKey,
    payloadHash: payloadHash.value,
    meta: meta.value,
  });
}

function replayClaimFromReceipt(
  state: CommerceState,
  receipt: CommerceCommandReceipt,
): Result<ClaimOpportunityOutput, SdkError> {
  if (receipt.claimId === undefined || receipt.sourceKey === undefined) {
    return fail(
      createCommerceError("commerce.persistence_invalid", "Claim command receipt is missing replay data.", {
        commandKey: receipt.commandKey,
      }),
    );
  }

  return ok({
    kind: "replayed",
    claimId: receipt.claimId,
    sourceKey: receipt.sourceKey,
    state,
    receipt,
  });
}

function createClaimOpportunity(
  definition: PreparedUpsertDefinition,
  nowMs: number,
): ActiveClaimOpportunity {
  return {
    sourceKey: definition.sourceKey,
    definitionHash: definition.definitionHash,
    status: definition.expiresAtMs !== undefined && definition.expiresAtMs <= nowMs
      ? "expired"
      : "open",
    reward: definition.reward.reward,
    ...(definition.cost === undefined ? {} : { cost: definition.cost.spend }),
    claimLimit: definition.claimLimit,
    claimedCount: 0,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    ...(definition.expiresAtMs === undefined ? {} : { expiresAtMs: definition.expiresAtMs }),
    ...(definition.metadata === undefined ? {} : { metadata: definition.metadata }),
    ...(definition.tombstoneRetention === undefined
      ? {}
      : { tombstoneRetention: definition.tombstoneRetention }),
  };
}

function createClaimedTombstone(
  opportunity: ActiveClaimOpportunity,
  claimedCount: number,
  nowMs: number,
): ClaimedClaimOpportunityTombstone {
  return {
    sourceKey: opportunity.sourceKey,
    definitionHash: opportunity.definitionHash,
    status: "claimed",
    claimLimit: opportunity.claimLimit,
    claimedCount,
    createdAtMs: opportunity.createdAtMs,
    updatedAtMs: nowMs,
    ...(opportunity.expiresAtMs === undefined ? {} : { expiresAtMs: opportunity.expiresAtMs }),
    ...(opportunity.tombstoneRetention === undefined
      ? {}
      : { tombstoneRetention: opportunity.tombstoneRetention }),
  };
}

function createUpsertReceipt(
  command: PreparedClaimCommand,
  nowMs: number,
  definition: PreparedUpsertDefinition,
): CommerceCommandReceipt {
  return {
    commandKey: command.commandKey,
    commandType: "upsert_claim_opportunity",
    payloadHash: command.payloadHash,
    resultKind: "applied",
    createdAtMs: nowMs,
    sourceKey: definition.sourceKey,
  };
}

function createClaimReceipt(
  command: PreparedClaimCommand,
  nowMs: number,
  claimId: string,
  sourceKey: string,
  ledgerIds: readonly string[],
): CommerceCommandReceipt {
  return {
    commandKey: command.commandKey,
    commandType: "claim",
    payloadHash: command.payloadHash,
    resultKind: "applied",
    createdAtMs: nowMs,
    ledgerIds,
    claimId,
    sourceKey,
  };
}

function createClaimLedgerEntry(input: {
  readonly command: PreparedClaimCommand;
  readonly deltas: readonly CommerceResourceDelta[];
  readonly nowMs: number;
}): CommerceLedgerEntry {
  return {
    ledgerId: `commerce.ledger:claim:${input.command.commandKey}`,
    commandKey: input.command.commandKey,
    commandType: "claim",
    reason: input.command.meta.reason,
    source: input.command.meta.source,
    deltas: input.deltas,
    createdAtMs: input.nowMs,
    ...(input.command.meta.metadata === undefined ? {} : { metadata: input.command.meta.metadata }),
  };
}

function applyReward(
  state: {
    readonly wallet: Readonly<Record<string, number>>;
    readonly inventory: Readonly<Record<string, number>>;
    readonly entitlements: Readonly<Record<string, boolean>>;
  },
  reward: NormalizedRewardBundle,
): Result<AppliedReward, SdkError> {
  const wallet = cloneNumberRecord(state.wallet);
  const inventory = cloneNumberRecord(state.inventory);
  const entitlements = cloneBooleanRecord(state.entitlements);
  const deltas: CommerceResourceDelta[] = [];

  for (const resource of reward.wallet) {
    const applied = applyPositiveAmount(wallet, resource);
    if (!applied.ok) {
      return fail(applied.error);
    }
    deltas.push(applied.value);
  }

  for (const resource of reward.inventory) {
    const applied = applyPositiveAmount(inventory, resource);
    if (!applied.ok) {
      return fail(applied.error);
    }
    deltas.push(applied.value);
  }

  for (const entitlement of reward.entitlements) {
    const previousOwned = readOwn(entitlements, entitlement.resourceId) === true;
    defineRecordEntry(entitlements, entitlement.resourceId, true);
    deltas.push({
      domain: "entitlement",
      resourceId: entitlement.resourceId,
      amountDelta: previousOwned ? 0 : 1,
      previousOwned,
      nextOwned: true,
    });
  }

  return ok({ wallet, inventory, entitlements, deltas });
}

function applySpend(state: CommerceState, spend: NormalizedSpendBundle): AppliedSpend {
  const wallet = cloneNumberRecord(state.wallet);
  const inventory = cloneNumberRecord(state.inventory);
  const deltas: CommerceResourceDelta[] = [];

  for (const resource of spend.wallet) {
    deltas.push(applyNegativeAmount(wallet, resource));
  }

  for (const resource of spend.inventory) {
    deltas.push(applyNegativeAmount(inventory, resource));
  }

  return { wallet, inventory, deltas };
}

function applyPositiveAmount(
  record: Record<string, number>,
  resource: NormalizedResourceAmount,
): Result<CommerceResourceDelta, SdkError> {
  const previousAmount = readOwn(record, resource.resourceId) ?? 0;
  const nextAmount = previousAmount + resource.amount;
  if (!Number.isSafeInteger(nextAmount)) {
    return fail(
      createInvalidBundleError("Resource balance must remain a safe integer.", {
        domain: resource.domain,
        resourceId: resource.resourceId,
        previousAmount,
        amount: resource.amount,
      }),
    );
  }

  defineRecordEntry(record, resource.resourceId, nextAmount);
  return ok({
    domain: resource.domain,
    resourceId: resource.resourceId,
    amountDelta: resource.amount,
    previousAmount,
    nextAmount,
  });
}

function applyNegativeAmount(
  record: Record<string, number>,
  resource: NormalizedResourceAmount,
): CommerceResourceDelta {
  const previousAmount = readOwn(record, resource.resourceId) ?? 0;
  const nextAmount = previousAmount - resource.amount;
  if (nextAmount === 0) {
    delete record[resource.resourceId];
  } else {
    defineRecordEntry(record, resource.resourceId, nextAmount);
  }

  return {
    domain: resource.domain,
    resourceId: resource.resourceId,
    amountDelta: -resource.amount,
    previousAmount,
    nextAmount,
  };
}

function readSourceKey(
  input: unknown,
  commandKey: string | undefined,
): Result<string, SdkError> {
  if (typeof input !== "object" || input === null) {
    return fail(createInvalidBundleError("Claim sourceKey must be a non-empty string.", {
      ...(commandKey === undefined ? {} : { commandKey }),
    }));
  }

  const sourceKey = (input as Partial<ClaimOpportunityInput>).sourceKey;
  return validateCommerceBudgetedString(
    sourceKey,
    "sourceKey",
    COMMERCE_SOURCE_KEY_MAX_LENGTH,
    {
      ...(commandKey === undefined ? {} : { commandKey }),
    },
  );
}

function normalizeClaimTombstoneRetentionPolicy(
  value: unknown,
  metadata: Readonly<Record<string, unknown>>,
): Result<ClaimTombstoneRetentionPolicy | undefined, SdkError> {
  if (value === undefined) {
    return ok(undefined);
  }
  if (!isPlainRecord(value)) {
    return fail(createInvalidBundleError("Claim tombstone retention must be an object.", metadata));
  }

  switch (value["kind"]) {
    case "permanent":
      return ok(undefined);
    case "cycle": {
      const scopeKey = validateCommerceBudgetedString(
        value["scopeKey"],
        "scopeKey",
        COMMERCE_SCOPE_KEY_MAX_LENGTH,
        metadata,
      );
      if (!scopeKey.ok) {
        return fail(scopeKey.error);
      }
      const cycleKey = validateCommerceBudgetedString(
        value["cycleKey"],
        "cycleKey",
        COMMERCE_CYCLE_KEY_MAX_LENGTH,
        metadata,
      );
      if (!cycleKey.ok) {
        return fail(cycleKey.error);
      }
      if (value["maxCycles"] !== undefined && !isPositiveSafeInteger(value["maxCycles"])) {
        return fail(
          createInvalidBundleError(
            "Cycle claim tombstone retention maxCycles must be a positive safe integer.",
            {
              ...metadata,
              maxCycles: value["maxCycles"],
            },
          ),
        );
      }
      return ok({
        kind: "cycle",
        scopeKey: scopeKey.value,
        cycleKey: cycleKey.value,
        ...(value["maxCycles"] === undefined ? {} : { maxCycles: value["maxCycles"] }),
      });
    }
    case "ephemeral": {
      const scopeKey = value["scopeKey"] === undefined
        ? undefined
        : validateCommerceBudgetedString(
            value["scopeKey"],
            "scopeKey",
            COMMERCE_SCOPE_KEY_MAX_LENGTH,
            metadata,
          );
      if (scopeKey !== undefined && !scopeKey.ok) {
        return fail(scopeKey.error);
      }
      if (value["ttlMs"] !== undefined && !isPositiveSafeInteger(value["ttlMs"])) {
        return fail(
          createInvalidBundleError(
            "Ephemeral claim tombstone retention ttlMs must be a positive safe integer.",
            {
              ...metadata,
              ttlMs: value["ttlMs"],
            },
          ),
        );
      }
      if (value["maxEntries"] !== undefined && !isPositiveSafeInteger(value["maxEntries"])) {
        return fail(
          createInvalidBundleError(
            "Ephemeral claim tombstone retention maxEntries must be a positive safe integer.",
            {
              ...metadata,
              maxEntries: value["maxEntries"],
            },
          ),
        );
      }
      return ok({
        kind: "ephemeral",
        ...(scopeKey === undefined ? {} : { scopeKey: scopeKey.value }),
        ...(value["ttlMs"] === undefined ? {} : { ttlMs: value["ttlMs"] }),
        ...(value["maxEntries"] === undefined ? {} : { maxEntries: value["maxEntries"] }),
      });
    }
    default:
      return fail(
        createInvalidBundleError(
          "Claim tombstone retention kind must be permanent, cycle, or ephemeral.",
          {
            ...metadata,
            kind: value["kind"],
          },
        ),
      );
  }
}

function hasExpired(opportunity: ClaimOpportunity, nowMs: number): boolean {
  return opportunity.expiresAtMs !== undefined && opportunity.expiresAtMs <= nowMs;
}

function resolveNowMs(state: CommerceState, options: CommerceClaimReducerOptions): number {
  return options.nowMs ?? state.updatedAtMs;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
