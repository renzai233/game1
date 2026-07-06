import type { SdkError, SdkErrorCode } from "../core/errors";
import type { Result } from "../core/result";

export const COMMERCE_MODULE_ID = "sdk.commerce";
export const CURRENT_COMMERCE_SCHEMA_VERSION = 3;
export const DEFAULT_COMMERCE_LEDGER_RETENTION_LIMIT = 256;
export const DEFAULT_COMMERCE_COMMAND_RECEIPT_RETENTION_LIMIT = 256;
export const DEFAULT_COMMERCE_INACTIVE_CLAIM_OPPORTUNITY_RETENTION_LIMIT = 128;
export const DEFAULT_COMMERCE_CLAIMED_TOMBSTONE_RETENTION_LIMIT = 256;
export const DEFAULT_COMMERCE_CYCLE_CLAIMED_TOMBSTONE_RETENTION_LIMIT = 2;
export const DEFAULT_COMMERCE_EPHEMERAL_CLAIMED_TOMBSTONE_RETENTION_LIMIT = 16;

export interface CommerceModuleConfig {
  readonly enabled?: boolean;
  readonly ledgerRetentionLimit?: number;
  readonly commandReceiptRetentionLimit?: number;
  readonly inactiveClaimOpportunityRetentionLimit?: number;
  readonly claimedTombstoneRetentionLimit?: number;
}

export type CommerceRuntimeStatus = "ready" | "unavailable" | "destroyed";
export type CommerceCommandResultKind = "applied" | "replayed";
export type CommerceCommandType =
  | "grant"
  | "spend"
  | "upsert_claim_opportunity"
  | "claim";
export type CommerceResourceDomain = "wallet" | "inventory" | "entitlement";

export interface RewardBundle {
  readonly wallet?: Readonly<Record<string, number>>;
  readonly inventory?: Readonly<Record<string, number>>;
  readonly entitlements?: Readonly<Record<string, boolean>>;
}

export interface SpendBundle {
  readonly wallet?: Readonly<Record<string, number>>;
  readonly inventory?: Readonly<Record<string, number>>;
}

export interface CommerceCommandMeta {
  readonly commandKey: string;
  readonly reason: string;
  readonly source: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly traceId?: string;
}

export interface CanAffordInput {
  readonly spend: SpendBundle;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly traceId?: string;
}

export interface CanAffordMissingResource {
  readonly domain: "wallet" | "inventory";
  readonly resourceId: string;
  readonly required: number;
  readonly available: number;
  readonly missing: number;
}

export interface CanAffordOutput {
  readonly affordable: boolean;
  readonly missing: readonly CanAffordMissingResource[];
}

export interface GrantRewardInput extends CommerceCommandMeta {
  readonly reward: RewardBundle;
}

export interface SpendBundleInput extends CommerceCommandMeta {
  readonly spend: SpendBundle;
}

export interface UpsertClaimOpportunityInput extends CommerceCommandMeta {
  readonly sourceKey: string;
  readonly reward: RewardBundle;
  readonly cost?: SpendBundle;
  readonly claimLimit?: number;
  readonly expiresAtMs?: number;
  readonly tombstoneRetention?: ClaimTombstoneRetentionPolicy;
}

export interface ClaimOpportunityInput extends CommerceCommandMeta {
  readonly sourceKey: string;
}

export interface CommerceResourceDelta {
  readonly domain: CommerceResourceDomain;
  readonly resourceId: string;
  readonly amountDelta: number;
  readonly previousAmount?: number;
  readonly nextAmount?: number;
  readonly previousOwned?: boolean;
  readonly nextOwned?: boolean;
}

export interface CommerceLedgerEntry {
  readonly ledgerId: string;
  readonly commandKey: string;
  readonly commandType: CommerceCommandType;
  readonly reason: string;
  readonly source: string;
  readonly deltas: readonly CommerceResourceDelta[];
  readonly createdAtMs: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CommerceCommandReceipt {
  readonly commandKey: string;
  readonly commandType: CommerceCommandType;
  readonly payloadHash: string;
  readonly resultKind: CommerceCommandResultKind;
  readonly createdAtMs: number;
  readonly ledgerIds?: readonly string[];
  readonly claimId?: string;
  readonly sourceKey?: string;
}

export type ClaimOpportunityStatus = "open" | "claimed" | "expired" | "closed";

export type ClaimTombstoneRetentionKind = "permanent" | "cycle" | "ephemeral";

export interface PermanentClaimTombstoneRetentionPolicy {
  readonly kind: "permanent";
}

export interface CycleClaimTombstoneRetentionPolicy {
  readonly kind: "cycle";
  readonly scopeKey: string;
  readonly cycleKey: string;
  readonly maxCycles?: number;
}

export interface EphemeralClaimTombstoneRetentionPolicy {
  readonly kind: "ephemeral";
  readonly scopeKey?: string;
  readonly ttlMs?: number;
  readonly maxEntries?: number;
}

export type ClaimTombstoneRetentionPolicy =
  | PermanentClaimTombstoneRetentionPolicy
  | CycleClaimTombstoneRetentionPolicy
  | EphemeralClaimTombstoneRetentionPolicy;

export interface ClaimOpportunityBase {
  readonly sourceKey: string;
  readonly definitionHash: string;
  readonly status: ClaimOpportunityStatus;
  readonly claimLimit: number;
  readonly claimedCount: number;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly expiresAtMs?: number;
  readonly tombstoneRetention?: ClaimTombstoneRetentionPolicy;
}

export interface ActiveClaimOpportunity extends ClaimOpportunityBase {
  readonly status: "open" | "expired" | "closed";
  readonly reward: RewardBundle;
  readonly cost?: SpendBundle;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ClaimedClaimOpportunityTombstone extends ClaimOpportunityBase {
  readonly status: "claimed";
}

export type ClaimOpportunity = ActiveClaimOpportunity | ClaimedClaimOpportunityTombstone;

export interface CommerceState {
  readonly schemaVersion: typeof CURRENT_COMMERCE_SCHEMA_VERSION;
  readonly wallet: Readonly<Record<string, number>>;
  readonly inventory: Readonly<Record<string, number>>;
  readonly entitlements: Readonly<Record<string, boolean>>;
  readonly claimOpportunities: Readonly<Record<string, ClaimOpportunity>>;
  readonly ledger: readonly CommerceLedgerEntry[];
  readonly commandReceipts: Readonly<Record<string, CommerceCommandReceipt>>;
  readonly updatedAtMs: number;
}

export interface CommerceRuntimeSnapshot {
  readonly moduleId: typeof COMMERCE_MODULE_ID;
  readonly schemaVersion: typeof CURRENT_COMMERCE_SCHEMA_VERSION;
  readonly enabled: boolean;
  readonly status: CommerceRuntimeStatus;
  readonly state: CommerceState | null;
  readonly ledgerRetentionLimit: number;
  readonly commandReceiptRetentionLimit: number;
  readonly inactiveClaimOpportunityRetentionLimit: number;
  readonly claimedTombstoneRetentionLimit: number;
  readonly persistence: {
    readonly profileEnabled?: boolean;
    readonly profileStatus?: string;
    readonly localStoreConfigured?: boolean;
    readonly causeCode?: SdkErrorCode;
  };
  readonly generatedAtMs: number;
}

export type CommerceMutationOutput =
  | CommerceMutationAppliedOutput
  | CommerceMutationReplayedOutput;

export interface CommerceMutationAppliedOutput {
  readonly kind: "applied";
  readonly state: CommerceState;
  readonly receipt: CommerceCommandReceipt;
  readonly ledgerEntries: readonly CommerceLedgerEntry[];
}

export interface CommerceMutationReplayedOutput {
  readonly kind: "replayed";
  readonly state: CommerceState;
  readonly receipt: CommerceCommandReceipt;
}

export type UpsertClaimOpportunityOutput =
  | UpsertClaimOpportunityAppliedOutput
  | UpsertClaimOpportunityReplayedOutput;

export interface UpsertClaimOpportunityAppliedOutput {
  readonly kind: "created" | "updated" | "noop";
  readonly state: CommerceState;
  readonly opportunity: ClaimOpportunity;
  readonly receipt: CommerceCommandReceipt;
}

export interface UpsertClaimOpportunityReplayedOutput {
  readonly kind: "replayed";
  readonly state: CommerceState;
  readonly sourceKey: string;
  readonly definitionHash: string;
  readonly currentOpportunity: ClaimOpportunity | null;
  readonly receipt: CommerceCommandReceipt;
}

export type ClaimOpportunityOutput =
  | ClaimOpportunityAppliedOutput
  | ClaimOpportunityReplayedOutput;

export interface ClaimOpportunityAppliedOutput {
  readonly kind: "applied";
  readonly claimId: string;
  readonly sourceKey: string;
  readonly state: CommerceState;
  readonly reward: RewardBundle;
  readonly cost?: SpendBundle;
  readonly receipt: CommerceCommandReceipt;
  readonly ledgerEntries: readonly CommerceLedgerEntry[];
}

export interface ClaimOpportunityReplayedOutput {
  readonly kind: "replayed";
  readonly claimId: string;
  readonly sourceKey: string;
  readonly state: CommerceState;
  readonly receipt: CommerceCommandReceipt;
}

export interface CommerceService {
  getSnapshot(): Promise<Result<CommerceRuntimeSnapshot, SdkError>>;
  canAfford(input: CanAffordInput): Promise<Result<CanAffordOutput, SdkError>>;
  grant(input: GrantRewardInput): Promise<Result<CommerceMutationOutput, SdkError>>;
  spend(input: SpendBundleInput): Promise<Result<CommerceMutationOutput, SdkError>>;
  upsertClaimOpportunity(
    input: UpsertClaimOpportunityInput,
  ): Promise<Result<UpsertClaimOpportunityOutput, SdkError>>;
  claim(input: ClaimOpportunityInput): Promise<Result<ClaimOpportunityOutput, SdkError>>;
  destroy(): void | Promise<void>;
}
