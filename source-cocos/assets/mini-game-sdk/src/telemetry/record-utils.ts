export function isPlainTelemetryRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isNonEmptyTelemetryString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
