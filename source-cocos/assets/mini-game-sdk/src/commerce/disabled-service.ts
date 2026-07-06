import type { SdkContext } from "../core/context";
import { SdkError, type SdkErrorCode } from "../core/errors";
import { fail, ok, type Result } from "../core/result";
import {
  COMMERCE_MODULE_ID,
  CURRENT_COMMERCE_SCHEMA_VERSION,
  DEFAULT_COMMERCE_CLAIMED_TOMBSTONE_RETENTION_LIMIT,
  DEFAULT_COMMERCE_COMMAND_RECEIPT_RETENTION_LIMIT,
  DEFAULT_COMMERCE_INACTIVE_CLAIM_OPPORTUNITY_RETENTION_LIMIT,
  DEFAULT_COMMERCE_LEDGER_RETENTION_LIMIT,
  type CanAffordInput,
  type CanAffordOutput,
  type ClaimOpportunityInput,
  type ClaimOpportunityOutput,
  type CommerceCommandMeta,
  type CommerceCommandType,
  type CommerceModuleConfig,
  type CommerceMutationOutput,
  type CommerceRuntimeSnapshot,
  type CommerceRuntimeStatus,
  type CommerceService,
  type GrantRewardInput,
  type SpendBundleInput,
  type UpsertClaimOpportunityInput,
  type UpsertClaimOpportunityOutput,
} from "./types";

export interface CreateDisabledCommerceServiceOptions {
  readonly context?: SdkContext;
  readonly profile?: CommerceProfileService;
  readonly config?: CommerceModuleConfig;
  readonly now?: () => number;
}

interface CommerceProfileModuleConfig {
  readonly enabled?: boolean;
  readonly localStore?: unknown;
  readonly cloudSnapshotPort?: unknown;
  readonly commandReceiptRetentionLimit?: number;
}

interface CommerceProfileRuntimeSnapshot {
  readonly record?: unknown;
  readonly status: string;
  readonly enabled: boolean;
  readonly localStoreConfigured: boolean;
  readonly cloudSnapshotConfigured?: boolean;
  readonly commandReceiptRetentionLimit?: number;
  readonly generatedAtMs?: number;
}

interface CommerceProfileService {
  getSnapshot(): Promise<Result<CommerceProfileRuntimeSnapshot, SdkError>>;
}

interface PersistenceUnavailableDetails {
  readonly causeCode: SdkErrorCode;
  readonly causeMessage?: string;
  readonly profileEnabled?: boolean;
  readonly profileStatus?: string;
  readonly localStoreConfigured?: boolean;
}

type PersistenceAvailability =
  | {
      readonly ok: true;
      readonly snapshot: CommerceProfileRuntimeSnapshot;
    }
  | {
      readonly ok: false;
      readonly details: PersistenceUnavailableDetails;
    };

export function createDisabledCommerceService(
  options: CreateDisabledCommerceServiceOptions = {},
): CommerceService {
  return new DisabledCommerceService(options);
}

class DisabledCommerceService implements CommerceService {
  private readonly enabled: boolean;
  private readonly profile: CommerceProfileService | undefined;
  private readonly profileConfig: CommerceProfileModuleConfig | undefined;
  private readonly now: () => number;
  private readonly ledgerRetentionLimit: number;
  private readonly commandReceiptRetentionLimit: number;
  private readonly inactiveClaimOpportunityRetentionLimit: number;
  private readonly claimedTombstoneRetentionLimit: number;
  private destroyed = false;

  constructor(options: CreateDisabledCommerceServiceOptions) {
    const config = options.config ?? options.context?.config.modules?.commerce;
    this.enabled = config?.enabled ?? false;
    this.profile = options.profile;
    this.profileConfig = options.context?.config.modules?.profile;
    const context = options.context;
    this.now = options.now ?? (context === undefined
      ? Date.now
      : () => context.clock.now());
    this.ledgerRetentionLimit =
      config?.ledgerRetentionLimit ?? DEFAULT_COMMERCE_LEDGER_RETENTION_LIMIT;
    this.commandReceiptRetentionLimit =
      config?.commandReceiptRetentionLimit ?? DEFAULT_COMMERCE_COMMAND_RECEIPT_RETENTION_LIMIT;
    this.inactiveClaimOpportunityRetentionLimit =
      config?.inactiveClaimOpportunityRetentionLimit ??
      DEFAULT_COMMERCE_INACTIVE_CLAIM_OPPORTUNITY_RETENTION_LIMIT;
    this.claimedTombstoneRetentionLimit =
      config?.claimedTombstoneRetentionLimit ??
      DEFAULT_COMMERCE_CLAIMED_TOMBSTONE_RETENTION_LIMIT;
  }

  async getSnapshot(): Promise<Result<CommerceRuntimeSnapshot, SdkError>> {
    if (this.destroyed) {
      return ok(this.createSnapshot("destroyed", { causeCode: "commerce.destroyed" }));
    }

    if (!this.enabled) {
      return ok(this.createSnapshot("unavailable", { causeCode: "commerce.unavailable" }));
    }

    const persistence = await this.inspectPersistence();
    if (!persistence.ok) {
      return ok(this.createSnapshot("unavailable", persistence.details));
    }

    return ok(
      this.createSnapshot("unavailable", {
        causeCode: "commerce.unavailable",
        profileEnabled: persistence.snapshot.enabled,
        profileStatus: persistence.snapshot.status,
        localStoreConfigured: persistence.snapshot.localStoreConfigured,
      }),
    );
  }

  async canAfford(input: CanAffordInput): Promise<Result<CanAffordOutput, SdkError>> {
    const availability = await this.requireAvailable("can_afford", input);
    if (!availability.ok) {
      return fail(availability.error);
    }

    return fail(this.createUnavailableError("Commerce reducer is not available in this stage.", input));
  }

  async grant(input: GrantRewardInput): Promise<Result<CommerceMutationOutput, SdkError>> {
    const availability = await this.requireAvailable("grant", input);
    if (!availability.ok) {
      return fail(availability.error);
    }

    return fail(this.createUnavailableError("Commerce grant is not available in this stage.", input));
  }

  async spend(input: SpendBundleInput): Promise<Result<CommerceMutationOutput, SdkError>> {
    const availability = await this.requireAvailable("spend", input);
    if (!availability.ok) {
      return fail(availability.error);
    }

    return fail(this.createUnavailableError("Commerce spend is not available in this stage.", input));
  }

  async upsertClaimOpportunity(
    input: UpsertClaimOpportunityInput,
  ): Promise<Result<UpsertClaimOpportunityOutput, SdkError>> {
    const availability = await this.requireAvailable("upsert_claim_opportunity", input);
    if (!availability.ok) {
      return fail(availability.error);
    }

    return fail(
      this.createUnavailableError(
        "Commerce claim opportunity upsert is not available in this stage.",
        input,
      ),
    );
  }

  async claim(input: ClaimOpportunityInput): Promise<Result<ClaimOpportunityOutput, SdkError>> {
    const availability = await this.requireAvailable("claim", input);
    if (!availability.ok) {
      return fail(availability.error);
    }

    return fail(this.createUnavailableError("Commerce claim is not available in this stage.", input));
  }

  destroy(): void {
    this.destroyed = true;
  }

  private async requireAvailable(
    commandType: CommerceCommandType | "can_afford",
    input: unknown,
  ): Promise<Result<void, SdkError>> {
    if (this.destroyed) {
      return fail(this.createDestroyedError(commandType, input));
    }

    if (!this.enabled) {
      return fail(this.createUnavailableError("Commerce service is disabled.", input));
    }

    const persistence = await this.inspectPersistence();
    if (!persistence.ok) {
      return fail(this.createPersistenceUnavailableError(commandType, input, persistence.details));
    }

    return ok(undefined);
  }

  private async inspectPersistence(): Promise<PersistenceAvailability> {
    if (this.profileConfig !== undefined) {
      if (this.profileConfig.enabled !== true) {
        return {
          ok: false,
          details: {
            causeCode: "profile.unavailable",
            profileEnabled: false,
            localStoreConfigured: this.profileConfig.localStore !== undefined,
          },
        };
      }

      if (this.profileConfig.localStore === undefined) {
        return {
          ok: false,
          details: {
            causeCode: "profile.local_store_unavailable",
            profileEnabled: true,
            localStoreConfigured: false,
          },
        };
      }

      return {
        ok: true,
        snapshot: {
          record: null,
          status: "unavailable",
          enabled: true,
          localStoreConfigured: true,
          cloudSnapshotConfigured: this.profileConfig.cloudSnapshotPort !== undefined,
          commandReceiptRetentionLimit: this.profileConfig.commandReceiptRetentionLimit ?? 0,
          generatedAtMs: this.now(),
        },
      };
    }

    if (this.profile === undefined) {
      return {
        ok: false,
        details: {
          causeCode: "profile.unavailable",
          causeMessage: "Profile service is unavailable.",
        },
      };
    }

    let snapshotResult: Awaited<ReturnType<CommerceProfileService["getSnapshot"]>>;
    try {
      snapshotResult = await this.profile.getSnapshot();
    } catch (error) {
      return {
        ok: false,
        details: {
          causeCode: error instanceof SdkError ? error.code : "profile.unavailable",
          causeMessage: error instanceof Error ? error.message : "Profile snapshot failed.",
        },
      };
    }

    if (!snapshotResult.ok) {
      return {
        ok: false,
        details: {
          causeCode: snapshotResult.error.code,
          causeMessage: snapshotResult.error.message,
        },
      };
    }

    const snapshot = snapshotResult.value;
    if (!snapshot.enabled) {
      return {
        ok: false,
        details: {
          causeCode: "profile.unavailable",
          profileEnabled: snapshot.enabled,
          profileStatus: snapshot.status,
          localStoreConfigured: snapshot.localStoreConfigured,
        },
      };
    }

    if (!snapshot.localStoreConfigured) {
      return {
        ok: false,
        details: {
          causeCode: "profile.local_store_unavailable",
          profileEnabled: snapshot.enabled,
          profileStatus: snapshot.status,
          localStoreConfigured: snapshot.localStoreConfigured,
        },
      };
    }

    return { ok: true, snapshot };
  }

  private createSnapshot(
    status: CommerceRuntimeStatus,
    persistence: PersistenceUnavailableDetails,
  ): CommerceRuntimeSnapshot {
    return {
      moduleId: COMMERCE_MODULE_ID,
      schemaVersion: CURRENT_COMMERCE_SCHEMA_VERSION,
      enabled: this.enabled && !this.destroyed,
      status,
      state: null,
      ledgerRetentionLimit: this.ledgerRetentionLimit,
      commandReceiptRetentionLimit: this.commandReceiptRetentionLimit,
      inactiveClaimOpportunityRetentionLimit: this.inactiveClaimOpportunityRetentionLimit,
      claimedTombstoneRetentionLimit: this.claimedTombstoneRetentionLimit,
      persistence: this.createPersistenceSnapshot(persistence),
      generatedAtMs: this.now(),
    };
  }

  private createPersistenceSnapshot(
    details: PersistenceUnavailableDetails,
  ): CommerceRuntimeSnapshot["persistence"] {
    return {
      ...(details.profileEnabled === undefined ? {} : { profileEnabled: details.profileEnabled }),
      ...(details.profileStatus === undefined ? {} : { profileStatus: details.profileStatus }),
      ...(details.localStoreConfigured === undefined
        ? {}
        : { localStoreConfigured: details.localStoreConfigured }),
      causeCode: details.causeCode,
    };
  }

  private createDestroyedError(
    commandType: CommerceCommandType | "can_afford",
    input: unknown,
  ): SdkError {
    return new SdkError("commerce.destroyed", "Destroyed commerce service cannot run commands.", {
      moduleName: "commerce",
      metadata: this.createCommandMetadata(commandType, input),
    });
  }

  private createUnavailableError(message: string, input: unknown): SdkError {
    return new SdkError("commerce.unavailable", message, {
      moduleName: "commerce",
      metadata: {
        enabled: this.enabled,
        ...this.createCommandMetadata(undefined, input),
      },
    });
  }

  private createPersistenceUnavailableError(
    commandType: CommerceCommandType | "can_afford",
    input: unknown,
    details: PersistenceUnavailableDetails,
  ): SdkError {
    return new SdkError(
      "commerce.persistence_unavailable",
      "Commerce requires profile persistence before running commands.",
      {
        moduleName: "commerce",
        metadata: {
          ...this.createCommandMetadata(commandType, input),
          causeCode: details.causeCode,
          ...(details.causeMessage === undefined ? {} : { causeMessage: details.causeMessage }),
          ...(details.profileEnabled === undefined ? {} : { profileEnabled: details.profileEnabled }),
          ...(details.profileStatus === undefined ? {} : { profileStatus: details.profileStatus }),
          ...(details.localStoreConfigured === undefined
            ? {}
            : { localStoreConfigured: details.localStoreConfigured }),
        },
      },
    );
  }

  private createCommandMetadata(
    commandType: CommerceCommandType | "can_afford" | undefined,
    input: unknown,
  ): Readonly<Record<string, unknown>> {
    const meta = readCommerceMeta(input);
    return {
      ...(commandType === undefined ? {} : { commandType }),
      ...(meta.commandKey === undefined ? {} : { commandKey: meta.commandKey }),
      ...(meta.reason === undefined ? {} : { reason: meta.reason }),
      ...(meta.source === undefined ? {} : { source: meta.source }),
      ...(meta.traceId === undefined ? {} : { traceId: meta.traceId }),
    };
  }
}

function readCommerceMeta(input: unknown): Partial<CommerceCommandMeta> {
  if (typeof input !== "object" || input === null) {
    return {};
  }

  const record = input as Partial<Record<keyof CommerceCommandMeta, unknown>>;
  return {
    ...(typeof record.commandKey === "string" ? { commandKey: record.commandKey } : {}),
    ...(typeof record.reason === "string" ? { reason: record.reason } : {}),
    ...(typeof record.source === "string" ? { source: record.source } : {}),
    ...(typeof record.traceId === "string" ? { traceId: record.traceId } : {}),
  };
}
