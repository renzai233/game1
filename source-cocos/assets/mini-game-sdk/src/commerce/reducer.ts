import { fail, ok, type Result } from "../core/result";
import { evaluateSpendAffordability } from "./affordability";
import {
  validateRewardBundle,
  validateSpendBundle,
  type NormalizedRewardBundle,
  type NormalizedSpendBundle,
  type NormalizedResourceAmount,
} from "./bundle";
import {
  checkCommandReceiptReplay,
  hashCommerceCommandPayload,
  validateCommerceCommandMeta,
  type CommerceJsonObject,
  type ValidatedCommerceCommandMeta,
} from "./command";
import { createCommerceError, createInvalidBundleError } from "./errors";
import { defineRecordEntry, readOwn } from "./record";
import {
  cloneBooleanRecord,
  cloneNumberRecord,
  withCommandReceipt,
} from "./state";
import type { SdkError } from "../core/errors";
import type {
  CommerceCommandReceipt,
  CommerceCommandType,
  CommerceLedgerEntry,
  CommerceMutationOutput,
  CommerceResourceDelta,
  CommerceState,
  GrantRewardInput,
  RewardBundle,
  SpendBundle,
  SpendBundleInput,
} from "./types";

export interface CommerceReducerOptions {
  readonly nowMs?: number;
}

export function grantReward(
  state: CommerceState,
  input: GrantRewardInput,
  options: CommerceReducerOptions = {},
): Result<CommerceMutationOutput, SdkError> {
  const reward = validateRewardBundle(input.reward);
  if (!reward.ok) {
    return fail(reward.error);
  }

  const command = prepareMutationCommand("grant", input, { reward: reward.value.reward });
  if (!command.ok) {
    return fail(command.error);
  }

  const replay = checkCommandReceiptReplay(state, command.value);
  if (!replay.ok) {
    return fail(replay.error);
  }
  if (replay.value.kind === "replayed") {
    return ok({
      kind: "replayed",
      state,
      receipt: replay.value.receipt,
    });
  }

  const applied = applyReward(state, reward.value);
  if (!applied.ok) {
    return fail(applied.error);
  }

  return ok(createMutationOutput({
    state,
    nextWallet: applied.value.wallet,
    nextInventory: applied.value.inventory,
    nextEntitlements: applied.value.entitlements,
    deltas: applied.value.deltas,
    command: command.value,
    commandType: "grant",
    metadata: command.value.meta.metadata,
    nowMs: resolveNowMs(state, options),
  }));
}

export function spendResources(
  state: CommerceState,
  input: SpendBundleInput,
  options: CommerceReducerOptions = {},
): Result<CommerceMutationOutput, SdkError> {
  const spend = validateSpendBundle(input.spend);
  if (!spend.ok) {
    return fail(spend.error);
  }

  const command = prepareMutationCommand("spend", input, { spend: spend.value.spend });
  if (!command.ok) {
    return fail(command.error);
  }

  const replay = checkCommandReceiptReplay(state, command.value);
  if (!replay.ok) {
    return fail(replay.error);
  }
  if (replay.value.kind === "replayed") {
    return ok({
      kind: "replayed",
      state,
      receipt: replay.value.receipt,
    });
  }

  const affordability = evaluateSpendAffordability(state, spend.value);
  if (!affordability.affordable) {
    return fail(
      createCommerceError("commerce.insufficient_funds", "Commerce resources are insufficient.", {
        commandKey: command.value.commandKey,
        missing: affordability.missing,
      }),
    );
  }

  const applied = applySpend(state, spend.value);

  return ok(createMutationOutput({
    state,
    nextWallet: applied.wallet,
    nextInventory: applied.inventory,
    nextEntitlements: state.entitlements,
    deltas: applied.deltas,
    command: command.value,
    commandType: "spend",
    metadata: command.value.meta.metadata,
    nowMs: resolveNowMs(state, options),
  }));
}

interface PreparedMutationCommand {
  readonly commandKey: string;
  readonly commandType: CommerceCommandType;
  readonly payloadHash: string;
  readonly meta: ValidatedCommerceCommandMeta;
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

function prepareMutationCommand(
  commandType: "grant",
  input: GrantRewardInput,
  payload: { readonly reward: RewardBundle },
): Result<PreparedMutationCommand, SdkError>;
function prepareMutationCommand(
  commandType: "spend",
  input: SpendBundleInput,
  payload: { readonly spend: SpendBundle },
): Result<PreparedMutationCommand, SdkError>;
function prepareMutationCommand(
  commandType: "grant" | "spend",
  input: GrantRewardInput | SpendBundleInput,
  payload: { readonly reward: RewardBundle } | { readonly spend: SpendBundle },
): Result<PreparedMutationCommand, SdkError> {
  const meta = validateCommerceCommandMeta(input);
  if (!meta.ok) {
    return fail(meta.error);
  }

  const hashInput: CommerceJsonObject = {
    commandKey: meta.value.commandKey,
    reason: meta.value.reason,
    source: meta.value.source,
    ...("reward" in payload
      ? { reward: payload.reward as unknown as CommerceJsonObject }
      : { spend: payload.spend as unknown as CommerceJsonObject }),
    ...(meta.value.metadata === undefined ? {} : { metadata: meta.value.metadata }),
  };
  const payloadHash = hashCommerceCommandPayload(commandType, hashInput);
  if (!payloadHash.ok) {
    return fail(payloadHash.error);
  }

  return ok({
    commandKey: meta.value.commandKey,
    commandType,
    payloadHash: payloadHash.value,
    meta: meta.value,
  });
}

function applyReward(
  state: CommerceState,
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

function createMutationOutput(input: {
  readonly state: CommerceState;
  readonly nextWallet: Readonly<Record<string, number>>;
  readonly nextInventory: Readonly<Record<string, number>>;
  readonly nextEntitlements: Readonly<Record<string, boolean>>;
  readonly deltas: readonly CommerceResourceDelta[];
  readonly command: PreparedMutationCommand;
  readonly commandType: CommerceCommandType;
  readonly metadata: Readonly<Record<string, unknown>> | undefined;
  readonly nowMs: number;
}): CommerceMutationOutput {
  const ledgerEntry = createLedgerEntry(input);
  const receipt = createReceipt(input.command, input.nowMs, [ledgerEntry]);
  const nextState: CommerceState = {
    ...input.state,
    wallet: input.nextWallet,
    inventory: input.nextInventory,
    entitlements: input.nextEntitlements,
    ledger: [...input.state.ledger, ledgerEntry],
    commandReceipts: withCommandReceipt(input.state.commandReceipts, receipt),
    updatedAtMs: input.nowMs,
  };

  return {
    kind: "applied",
    state: nextState,
    receipt,
    ledgerEntries: [ledgerEntry],
  };
}

function createLedgerEntry(input: {
  readonly command: PreparedMutationCommand;
  readonly commandType: CommerceCommandType;
  readonly deltas: readonly CommerceResourceDelta[];
  readonly metadata: Readonly<Record<string, unknown>> | undefined;
  readonly nowMs: number;
}): CommerceLedgerEntry {
  return {
    ledgerId: `commerce.ledger:${input.commandType}:${input.command.commandKey}`,
    commandKey: input.command.commandKey,
    commandType: input.commandType,
    reason: input.command.meta.reason,
    source: input.command.meta.source,
    deltas: input.deltas,
    createdAtMs: input.nowMs,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
}

function createReceipt(
  command: PreparedMutationCommand,
  nowMs: number,
  ledgerEntries: readonly CommerceLedgerEntry[],
): CommerceCommandReceipt {
  return {
    commandKey: command.commandKey,
    commandType: command.commandType,
    payloadHash: command.payloadHash,
    resultKind: "applied",
    createdAtMs: nowMs,
    ledgerIds: ledgerEntries.map((entry) => entry.ledgerId),
  };
}

function resolveNowMs(state: CommerceState, options: CommerceReducerOptions): number {
  return options.nowMs ?? state.updatedAtMs;
}
