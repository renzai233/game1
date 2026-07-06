export type Result<TValue, TError = Error> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: TError };

export function ok<TValue>(value: TValue): Result<TValue, never> {
  return { ok: true, value };
}

export function fail<TError>(error: TError): Result<never, TError> {
  return { ok: false, error };
}

export function isOk<TValue, TError>(
  result: Result<TValue, TError>,
): result is { readonly ok: true; readonly value: TValue } {
  return result.ok;
}

export function isErr<TValue, TError>(
  result: Result<TValue, TError>,
): result is { readonly ok: false; readonly error: TError } {
  return !result.ok;
}

export function unwrap<TValue, TError>(result: Result<TValue, TError>): TValue {
  if (result.ok) {
    return result.value;
  }

  throw result.error;
}
