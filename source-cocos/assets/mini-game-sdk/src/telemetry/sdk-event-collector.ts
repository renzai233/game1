import type { EventBus, SdkEventMap, Unsubscribe } from "../core";
import type { PlatformLaunchOptions } from "../platform";
import type { TelemetryPayload, TrackingPlan } from "./types";

export const SDK_PUBLIC_EVENTS_TRACKING_PLAN: TrackingPlan = {
  name: "mini-game-sdk-public-events",
  version: "1",
  events: [
    { name: "sdk.initialized", version: 1, category: "behavior" },
    { name: "sdk.started", version: 1, category: "behavior" },
    { name: "sdk.destroyed", version: 1, category: "behavior" },
    { name: "platform.launch", version: 1, category: "session" },
    { name: "platform.show", version: 1, category: "session" },
    { name: "platform.hide", version: 1, category: "session" },
    { name: "account.session.started", version: 1, category: "behavior" },
    { name: "account.session.cleared", version: 1, category: "behavior" },
    { name: "account.login.failed", version: 1, category: "error" },
  ],
};

export interface InstallSdkEventTelemetryCollectorOptions {
  readonly events: EventBus<SdkEventMap>;
  readonly track: (
    name: string,
    payload: TelemetryPayload,
    options: { readonly atMs: number },
  ) => void;
  readonly updateLaunchContext: (launchOptions: PlatformLaunchOptions | undefined) => void;
}

export function installSdkEventTelemetryCollector(
  options: InstallSdkEventTelemetryCollectorOptions,
): Unsubscribe[] {
  return [
    options.events.on("sdk.initialized", (payload) => {
      options.track("sdk.initialized", {}, { atMs: payload.atMs });
    }),
    options.events.on("sdk.started", (payload) => {
      options.track("sdk.started", {}, { atMs: payload.atMs });
    }),
    options.events.on("sdk.destroyed", (payload) => {
      options.track(
        "sdk.destroyed",
        payload.flushAttempted === undefined ? {} : { flushAttempted: payload.flushAttempted },
        { atMs: payload.atMs },
      );
    }),
    options.events.on("platform.launch", (payload) => {
      const launchOptions = readLaunchOptions(payload.launchOptions);
      options.updateLaunchContext(launchOptions);
      const channel = toTelemetryString(launchOptions?.channel);
      options.track(
        "platform.launch",
        {
          ...(launchOptions?.scene === undefined ? {} : { launchScene: launchOptions.scene }),
          ...(channel === undefined ? {} : { channel }),
          ...(launchOptions?.entryType === undefined ? {} : { entryType: launchOptions.entryType }),
        },
        { atMs: payload.atMs },
      );
    }),
    options.events.on("platform.show", (payload) => {
      const launchOptions = readLaunchOptions(payload.launchOptions);
      options.updateLaunchContext(launchOptions);
      options.track(
        "platform.show",
        {
          ...(launchOptions?.scene === undefined ? {} : { launchScene: launchOptions.scene }),
          ...(payload.backgroundDurationMs === undefined
            ? {}
            : { backgroundDurationMs: payload.backgroundDurationMs }),
        },
        { atMs: payload.atMs },
      );
    }),
    options.events.on("platform.hide", (payload) => {
      options.track(
        "platform.hide",
        payload.foregroundDurationMs === undefined
          ? {}
          : { foregroundDurationMs: payload.foregroundDurationMs },
        { atMs: payload.atMs },
      );
    }),
    options.events.on("account.session.started", (payload) => {
      options.track(
        "account.session.started",
        {
          hasAccessToken: true,
          ...(payload.expiresAtMs === undefined ? {} : { expiresAtMs: payload.expiresAtMs }),
        },
        { atMs: payload.atMs },
      );
    }),
    options.events.on("account.session.cleared", (payload) => {
      options.track(
        "account.session.cleared",
        payload.reason === undefined ? {} : { reason: payload.reason },
        { atMs: payload.atMs },
      );
    }),
    options.events.on("account.login.failed", (payload) => {
      options.track(
        "account.login.failed",
        {
          errorCode: payload.code,
          retryable: isRetryableAccountError(payload.code),
        },
        { atMs: payload.atMs },
      );
    }),
  ];
}

export function toTelemetryString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function isRetryableAccountError(code: string): boolean {
  return code === "account.backend_timeout" || code === "account.backend_unavailable";
}

function readLaunchOptions(value: unknown): PlatformLaunchOptions | undefined {
  return typeof value === "object" && value !== null ? (value as PlatformLaunchOptions) : undefined;
}
