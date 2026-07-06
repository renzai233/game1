import { SdkError, type SdkErrorCode } from "../core/errors";

export function createCommerceError(
  code: SdkErrorCode,
  message: string,
  metadata?: Readonly<Record<string, unknown>>,
): SdkError {
  return new SdkError(code, message, {
    moduleName: "commerce",
    ...(metadata === undefined ? {} : { metadata }),
  });
}

export function createInvalidBundleError(
  message: string,
  metadata?: Readonly<Record<string, unknown>>,
): SdkError {
  return createCommerceError("commerce.invalid_bundle", message, metadata);
}
