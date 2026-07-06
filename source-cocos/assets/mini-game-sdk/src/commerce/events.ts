import type { SdkContext } from "../core/context";
import type { SdkError } from "../core/errors";
import type {
  ClaimOpportunityOutput,
  CommerceCommandMeta,
  CommerceCommandType,
  CommerceMutationOutput,
  UpsertClaimOpportunityAppliedOutput,
} from "./types";

export function emitCommerceMutationAppliedEvent(
  context: SdkContext,
  commandType: "grant" | "spend" | "claim",
  input: unknown,
  output: CommerceMutationOutput | ClaimOpportunityOutput,
): void {
  const meta = readCommerceMeta(input);
  const result = context.events.emit("commerce.mutation.applied", {
    atMs: context.clock.now(),
    commandKey: output.receipt.commandKey,
    commandType,
    source: meta.source ?? "",
    reason: meta.reason ?? "",
    kind: output.kind,
  });

  if (!result.ok) {
    context.logger.warn("Commerce mutation applied event handler failed.", {
      error: result.error,
    });
  }
}

export function emitCommerceClaimOpportunityUpsertedEvent(
  context: SdkContext,
  input: unknown,
  output: UpsertClaimOpportunityAppliedOutput,
): void {
  const meta = readCommerceMeta(input);
  const result = context.events.emit("commerce.claim.opportunity_upserted", {
    atMs: context.clock.now(),
    commandKey: output.receipt.commandKey,
    source: meta.source ?? "",
    reason: meta.reason ?? "",
    sourceKey: output.opportunity.sourceKey,
    definitionHash: output.opportunity.definitionHash,
    kind: output.kind,
  });

  if (!result.ok) {
    context.logger.warn("Commerce claim opportunity upsert event handler failed.", {
      error: result.error,
    });
  }
}

export function emitCommerceCommandFailedEvent(
  context: SdkContext,
  commandType: CommerceCommandType | "can_afford",
  input: unknown,
  error: SdkError,
): void {
  const meta = readCommerceMeta(input);
  const result = context.events.emit("commerce.command.failed", {
    atMs: context.clock.now(),
    commandType,
    code: error.code,
    message: error.message,
    ...(meta.commandKey === undefined ? {} : { commandKey: meta.commandKey }),
    ...(meta.source === undefined ? {} : { source: meta.source }),
    ...(meta.reason === undefined ? {} : { reason: meta.reason }),
  });

  if (!result.ok) {
    context.logger.warn("Commerce command failed event handler failed.", {
      error: result.error,
    });
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
  };
}
