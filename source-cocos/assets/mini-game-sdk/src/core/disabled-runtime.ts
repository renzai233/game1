import type { SdkContext } from "./context";
import type { Unsubscribe } from "./event-bus";
import { ok } from "./result";

export const noopUnsubscribe: Unsubscribe = () => undefined;

export function createDisabledContext(): SdkContext {
  return {
    config: {
      app: {
        gameId: "disabled",
        appVersion: "0.0.0",
        environment: "dev",
      },
    },
    events: {
      on: () => noopUnsubscribe,
      once: () => noopUnsubscribe,
      emit: () => ok(undefined),
      clear: () => undefined,
    },
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    clock: {
      now: () => Date.now(),
      date: () => new Date(),
    },
    runtime: {
      sdkVersion: "0.0.0",
      createdAtMs: Date.now(),
    },
  };
}
