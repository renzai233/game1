export function readOwn<TValue>(
  record: Readonly<Record<string, TValue>>,
  key: string,
): TValue | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

export function defineRecordEntry<TValue>(
  record: Record<string, TValue>,
  key: string,
  value: TValue,
): void {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

export function cloneRecord<TValue>(
  record: Readonly<Record<string, TValue>>,
): Record<string, TValue> {
  const output: Record<string, TValue> = {};
  for (const key of Object.keys(record)) {
    const value = readOwn(record, key);
    if (value !== undefined) {
      defineRecordEntry(output, key, value);
    }
  }
  return output;
}

export function withRecordEntry<TValue>(
  record: Readonly<Record<string, TValue>>,
  key: string,
  value: TValue,
): Record<string, TValue> {
  const output = cloneRecord(record);
  defineRecordEntry(output, key, value);
  return output;
}
