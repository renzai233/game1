import type { SdkContext, SdkEventMap } from "./context";

export function emitSdkEventAndWarn<TKey extends keyof SdkEventMap & string>(
  context: SdkContext,
  eventName: TKey,
  payload: SdkEventMap[TKey],
  warningMessage: string,
): void {
  const result = context.events.emit(eventName, payload);
  if (!result.ok) {
    context.logger.warn(warningMessage, {
      error: result.error,
    });
  }
}
