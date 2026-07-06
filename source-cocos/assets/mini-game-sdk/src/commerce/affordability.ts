import { fail, ok, type Result } from "../core/result";
import { validateSpendBundle, type NormalizedSpendBundle } from "./bundle";
import { readOwn } from "./record";
import type { CanAffordMissingResource, CanAffordOutput, CommerceState } from "./types";
import type { SdkError } from "../core/errors";

export function canAffordCommerceState(
  state: CommerceState,
  spend: unknown,
): Result<CanAffordOutput, SdkError> {
  const normalized = validateSpendBundle(spend, { allowEmpty: true });
  if (!normalized.ok) {
    return fail(normalized.error);
  }

  return ok(evaluateSpendAffordability(state, normalized.value));
}

export function evaluateSpendAffordability(
  state: CommerceState,
  spend: NormalizedSpendBundle,
): CanAffordOutput {
  const missing: CanAffordMissingResource[] = [];

  for (const resource of spend.wallet) {
    const available = readOwn(state.wallet, resource.resourceId) ?? 0;
    if (available < resource.amount) {
      missing.push({
        domain: "wallet",
        resourceId: resource.resourceId,
        required: resource.amount,
        available,
        missing: resource.amount - available,
      });
    }
  }

  for (const resource of spend.inventory) {
    const available = readOwn(state.inventory, resource.resourceId) ?? 0;
    if (available < resource.amount) {
      missing.push({
        domain: "inventory",
        resourceId: resource.resourceId,
        required: resource.amount,
        available,
        missing: resource.amount - available,
      });
    }
  }

  return {
    affordable: missing.length === 0,
    missing,
  };
}
