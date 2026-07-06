import {
  DEFAULT_COMMERCE_CYCLE_CLAIMED_TOMBSTONE_RETENTION_LIMIT,
  DEFAULT_COMMERCE_EPHEMERAL_CLAIMED_TOMBSTONE_RETENTION_LIMIT,
} from "./types";
import type {
  ClaimOpportunity,
  CommerceCommandReceipt,
  CommerceLedgerEntry,
  CommerceState,
} from "./types";

export interface CommerceRetentionLimits {
  readonly ledgerRetentionLimit: number;
  readonly commandReceiptRetentionLimit: number;
  readonly inactiveClaimOpportunityRetentionLimit: number;
  readonly claimedTombstoneRetentionLimit: number;
}

export interface CommerceRetentionProtection {
  readonly commandKeys?: readonly string[];
  readonly ledgerIds?: readonly string[];
  readonly sourceKeys?: readonly string[];
}

export function normalizeCommerceStateRetention(
  state: CommerceState,
  limits: CommerceRetentionLimits,
  protection: CommerceRetentionProtection = {},
): CommerceState {
  const protectedCommandKeys = new Set(protection.commandKeys ?? []);
  const protectedLedgerIds = new Set(protection.ledgerIds ?? []);
  const protectedSourceKeys = new Set(protection.sourceKeys ?? []);

  const ledger = pruneArray({
    items: state.ledger,
    limit: limits.ledgerRetentionLimit,
    key: (entry) => entry.ledgerId,
    isProtected: (entry) => protectedLedgerIds.has(entry.ledgerId),
    compareOldestFirst: compareLedgerEntry,
  });
  const commandReceipts = pruneRecord({
    record: state.commandReceipts,
    limit: limits.commandReceiptRetentionLimit,
    key: (receipt) => receipt.commandKey,
    isProtected: (receipt) => protectedCommandKeys.has(receipt.commandKey),
    compareOldestFirst: compareCommandReceipt,
  });
  const claimOpportunities = pruneClaimOpportunities({
    opportunities: state.claimOpportunities,
    inactiveLimit: limits.inactiveClaimOpportunityRetentionLimit,
    claimedTombstoneLimit: limits.claimedTombstoneRetentionLimit,
    nowMs: state.updatedAtMs,
    protectedSourceKeys,
  });

  if (
    ledger === state.ledger &&
    commandReceipts === state.commandReceipts &&
    claimOpportunities === state.claimOpportunities
  ) {
    return state;
  }

  return {
    ...state,
    ledger,
    commandReceipts,
    claimOpportunities,
  };
}

function pruneArray<TItem>(input: {
  readonly items: readonly TItem[];
  readonly limit: number;
  readonly key: (item: TItem) => string;
  readonly isProtected: (item: TItem) => boolean;
  readonly compareOldestFirst: (a: TItem, b: TItem) => number;
}): readonly TItem[] {
  if (input.items.length <= input.limit) {
    return input.items;
  }

  const removable = input.items
    .filter((item) => !input.isProtected(item))
    .slice()
    .sort(input.compareOldestFirst);
  const removeCount = Math.min(input.items.length - input.limit, removable.length);
  if (removeCount <= 0) {
    return input.items;
  }

  const removed = new Set(removable.slice(0, removeCount).map(input.key));
  return input.items.filter((item) => !removed.has(input.key(item)));
}

function pruneRecord<TItem>(input: {
  readonly record: Readonly<Record<string, TItem>>;
  readonly limit: number;
  readonly key: (item: TItem) => string;
  readonly isProtected: (item: TItem) => boolean;
  readonly compareOldestFirst: (a: TItem, b: TItem) => number;
}): Readonly<Record<string, TItem>> {
  const values = Object.values(input.record);
  if (values.length <= input.limit) {
    return input.record;
  }

  const kept = pruneArray({
    items: values,
    limit: input.limit,
    key: input.key,
    isProtected: input.isProtected,
    compareOldestFirst: input.compareOldestFirst,
  });
  if (kept.length === values.length) {
    return input.record;
  }

  return Object.fromEntries(
    kept
      .slice()
      .sort((a, b) => input.key(a).localeCompare(input.key(b)))
      .map((item) => [input.key(item), item]),
  );
}

function pruneClaimOpportunities(input: {
  readonly opportunities: Readonly<Record<string, ClaimOpportunity>>;
  readonly inactiveLimit: number;
  readonly claimedTombstoneLimit: number;
  readonly nowMs: number;
  readonly protectedSourceKeys: ReadonlySet<string>;
}): Readonly<Record<string, ClaimOpportunity>> {
  let opportunities = input.opportunities;
  opportunities = pruneInactiveUnclaimedOpportunities({
    opportunities,
    limit: input.inactiveLimit,
    protectedSourceKeys: input.protectedSourceKeys,
  });
  opportunities = pruneExpiredEphemeralClaimedTombstones({
    opportunities,
    nowMs: input.nowMs,
    protectedSourceKeys: input.protectedSourceKeys,
  });
  opportunities = pruneCycleClaimedTombstones({
    opportunities,
    protectedSourceKeys: input.protectedSourceKeys,
  });
  opportunities = pruneEphemeralClaimedTombstoneGroups({
    opportunities,
    protectedSourceKeys: input.protectedSourceKeys,
  });
  opportunities = pruneClaimedTombstonesToGlobalLimit({
    opportunities,
    limit: input.claimedTombstoneLimit,
    protectedSourceKeys: input.protectedSourceKeys,
  });

  return opportunities;
}

function pruneInactiveUnclaimedOpportunities(input: {
  readonly opportunities: Readonly<Record<string, ClaimOpportunity>>;
  readonly limit: number;
  readonly protectedSourceKeys: ReadonlySet<string>;
}): Readonly<Record<string, ClaimOpportunity>> {
  const inactive = Object.values(input.opportunities).filter((opportunity) =>
    isInactiveUnclaimedOpportunity(opportunity) &&
    !input.protectedSourceKeys.has(opportunity.sourceKey),
  );
  if (inactive.length <= input.limit) {
    return input.opportunities;
  }

  const removeCount = inactive.length - input.limit;
  const removed = new Set(
    inactive
      .slice()
      .sort(compareInactiveOpportunity)
      .slice(0, removeCount)
      .map((opportunity) => opportunity.sourceKey),
  );

  return removeOpportunities(input.opportunities, removed);
}

function pruneExpiredEphemeralClaimedTombstones(input: {
  readonly opportunities: Readonly<Record<string, ClaimOpportunity>>;
  readonly nowMs: number;
  readonly protectedSourceKeys: ReadonlySet<string>;
}): Readonly<Record<string, ClaimOpportunity>> {
  const removed = new Set<string>();
  for (const opportunity of Object.values(input.opportunities)) {
    if (
      opportunity.status === "claimed" &&
      opportunity.tombstoneRetention?.kind === "ephemeral" &&
      opportunity.tombstoneRetention.ttlMs !== undefined &&
      opportunity.updatedAtMs + opportunity.tombstoneRetention.ttlMs <= input.nowMs &&
      !input.protectedSourceKeys.has(opportunity.sourceKey)
    ) {
      removed.add(opportunity.sourceKey);
    }
  }

  return removed.size === 0
    ? input.opportunities
    : removeOpportunities(input.opportunities, removed);
}

function pruneCycleClaimedTombstones(input: {
  readonly opportunities: Readonly<Record<string, ClaimOpportunity>>;
  readonly protectedSourceKeys: ReadonlySet<string>;
}): Readonly<Record<string, ClaimOpportunity>> {
  const byScope = new Map<string, ClaimOpportunity[]>();
  for (const opportunity of Object.values(input.opportunities)) {
    if (opportunity.status !== "claimed" || opportunity.tombstoneRetention?.kind !== "cycle") {
      continue;
    }

    const scoped = byScope.get(opportunity.tombstoneRetention.scopeKey) ?? [];
    scoped.push(opportunity);
    byScope.set(opportunity.tombstoneRetention.scopeKey, scoped);
  }

  const removed = new Set<string>();
  for (const opportunities of byScope.values()) {
    const maxCycles = Math.max(
      ...opportunities.map((opportunity) =>
        opportunity.tombstoneRetention?.kind === "cycle" &&
        opportunity.tombstoneRetention.maxCycles !== undefined
          ? opportunity.tombstoneRetention.maxCycles
          : DEFAULT_COMMERCE_CYCLE_CLAIMED_TOMBSTONE_RETENTION_LIMIT,
      ),
    );
    const cycleLatest = new Map<string, number>();
    for (const opportunity of opportunities) {
      if (opportunity.tombstoneRetention?.kind !== "cycle") {
        continue;
      }
      const current = cycleLatest.get(opportunity.tombstoneRetention.cycleKey);
      if (current === undefined || opportunity.updatedAtMs > current) {
        cycleLatest.set(opportunity.tombstoneRetention.cycleKey, opportunity.updatedAtMs);
      }
    }

    const keptCycles = new Set(
      Array.from(cycleLatest.entries())
        .sort((left, right) =>
          compareNumberThenString(
            right[1],
            left[1],
            right[0],
            left[0],
          ),
        )
        .slice(0, maxCycles)
        .map(([cycleKey]) => cycleKey),
    );

    for (const opportunity of opportunities) {
      if (
        opportunity.tombstoneRetention?.kind === "cycle" &&
        !keptCycles.has(opportunity.tombstoneRetention.cycleKey) &&
        !input.protectedSourceKeys.has(opportunity.sourceKey)
      ) {
        removed.add(opportunity.sourceKey);
      }
    }
  }

  return removed.size === 0
    ? input.opportunities
    : removeOpportunities(input.opportunities, removed);
}

function pruneEphemeralClaimedTombstoneGroups(input: {
  readonly opportunities: Readonly<Record<string, ClaimOpportunity>>;
  readonly protectedSourceKeys: ReadonlySet<string>;
}): Readonly<Record<string, ClaimOpportunity>> {
  const byScope = new Map<string, ClaimOpportunity[]>();
  for (const opportunity of Object.values(input.opportunities)) {
    if (opportunity.status !== "claimed" || opportunity.tombstoneRetention?.kind !== "ephemeral") {
      continue;
    }

    const scopeKey = opportunity.tombstoneRetention.scopeKey ?? "";
    const scoped = byScope.get(scopeKey) ?? [];
    scoped.push(opportunity);
    byScope.set(scopeKey, scoped);
  }

  const removed = new Set<string>();
  for (const opportunities of byScope.values()) {
    const limit = Math.max(
      ...opportunities.map((opportunity) =>
        opportunity.tombstoneRetention?.kind === "ephemeral" &&
        opportunity.tombstoneRetention.maxEntries !== undefined
          ? opportunity.tombstoneRetention.maxEntries
          : DEFAULT_COMMERCE_EPHEMERAL_CLAIMED_TOMBSTONE_RETENTION_LIMIT,
      ),
    );
    if (opportunities.length <= limit) {
      continue;
    }

    const removable = opportunities
      .filter((opportunity) => !input.protectedSourceKeys.has(opportunity.sourceKey))
      .slice()
      .sort(compareInactiveOpportunity);
    const removeCount = Math.min(opportunities.length - limit, removable.length);
    for (const opportunity of removable.slice(0, removeCount)) {
      removed.add(opportunity.sourceKey);
    }
  }

  return removed.size === 0
    ? input.opportunities
    : removeOpportunities(input.opportunities, removed);
}

function pruneClaimedTombstonesToGlobalLimit(input: {
  readonly opportunities: Readonly<Record<string, ClaimOpportunity>>;
  readonly limit: number;
  readonly protectedSourceKeys: ReadonlySet<string>;
}): Readonly<Record<string, ClaimOpportunity>> {
  const claimed = Object.values(input.opportunities).filter((opportunity) =>
    opportunity.status === "claimed",
  );
  if (claimed.length <= input.limit) {
    return input.opportunities;
  }

  const removable = claimed
    .filter((opportunity) => !input.protectedSourceKeys.has(opportunity.sourceKey))
    .slice()
    .sort(compareInactiveOpportunity);
  const removeCount = Math.min(claimed.length - input.limit, removable.length);
  if (removeCount <= 0) {
    return input.opportunities;
  }

  return removeOpportunities(
    input.opportunities,
    new Set(removable.slice(0, removeCount).map((opportunity) => opportunity.sourceKey)),
  );
}

function removeOpportunities(
  opportunities: Readonly<Record<string, ClaimOpportunity>>,
  removed: ReadonlySet<string>,
): Readonly<Record<string, ClaimOpportunity>> {
  return Object.fromEntries(
    Object.values(opportunities)
      .filter((opportunity) => !removed.has(opportunity.sourceKey))
      .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey))
      .map((opportunity) => [opportunity.sourceKey, opportunity]),
  );
}

function isInactiveUnclaimedOpportunity(opportunity: ClaimOpportunity): boolean {
  return (
    (opportunity.status === "closed" || opportunity.status === "expired") &&
    opportunity.claimedCount === 0
  );
}

function compareLedgerEntry(a: CommerceLedgerEntry, b: CommerceLedgerEntry): number {
  return compareNumberThenString(a.createdAtMs, b.createdAtMs, a.ledgerId, b.ledgerId);
}

function compareCommandReceipt(a: CommerceCommandReceipt, b: CommerceCommandReceipt): number {
  return compareNumberThenString(a.createdAtMs, b.createdAtMs, a.commandKey, b.commandKey);
}

function compareInactiveOpportunity(a: ClaimOpportunity, b: ClaimOpportunity): number {
  return compareNumberThenString(a.updatedAtMs, b.updatedAtMs, a.sourceKey, b.sourceKey);
}

function compareNumberThenString(
  aNumber: number,
  bNumber: number,
  aString: string,
  bString: string,
): number {
  if (aNumber !== bNumber) {
    return aNumber - bNumber;
  }

  return aString.localeCompare(bString);
}
