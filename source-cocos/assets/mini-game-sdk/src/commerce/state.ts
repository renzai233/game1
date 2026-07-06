import {
  CURRENT_COMMERCE_SCHEMA_VERSION,
  type CommerceCommandReceipt,
  type CommerceState,
} from "./types";
import { cloneRecord, withRecordEntry as withRecordEntryValue } from "./record";

export function createEmptyCommerceState(nowMs = 0): CommerceState {
  return {
    schemaVersion: CURRENT_COMMERCE_SCHEMA_VERSION,
    wallet: {},
    inventory: {},
    entitlements: {},
    claimOpportunities: {},
    ledger: [],
    commandReceipts: {},
    updatedAtMs: nowMs,
  };
}

export function cloneNumberRecord(
  record: Readonly<Record<string, number>>,
): Record<string, number> {
  return cloneRecord(record);
}

export function cloneBooleanRecord(
  record: Readonly<Record<string, boolean>>,
): Record<string, boolean> {
  return cloneRecord(record);
}

export function withCommandReceipt(
  receipts: Readonly<Record<string, CommerceCommandReceipt>>,
  receipt: CommerceCommandReceipt,
): Record<string, CommerceCommandReceipt> {
  return withRecordEntryValue(receipts, receipt.commandKey, receipt);
}
