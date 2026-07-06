import type { AccountService } from "../account";
import type { TelemetryQueueConfig, Unsubscribe } from "../core";
import { createDisabledContext, noopUnsubscribe } from "../core/disabled-runtime";
import { SdkError } from "../core/errors";
import { emitSdkEventAndWarn } from "../core/event-publisher";
import { fail, ok, type Result } from "../core/result";
import { createNoopPlatformFacade, type PlatformLaunchOptions } from "../platform";
import {
  mergeTelemetryBatchOutcomes,
  normalizeTelemetryTransportResult,
  resolveTelemetryAck,
} from "./ack-resolver";
import { validateTelemetryPayload } from "./payload-validator";
import type { SendTelemetryBatchOutcome, TelemetryQueueItem } from "./queue-types";
import {
  installSdkEventTelemetryCollector,
  SDK_PUBLIC_EVENTS_TRACKING_PLAN,
  toTelemetryString,
} from "./sdk-event-collector";
import {
  createTelemetryPendingStorageKey,
  isNonEmptyTelemetryString,
  isTelemetryEventSnapshot,
  normalizeRestoredTelemetryContext,
  rewriteEventDeviceId,
} from "./storage-snapshot";
import { TrackingPlanRegistry, type RegisteredTrackingPlanEvent } from "./tracking-plan";
import type {
  CreateTelemetryServiceOptions,
  TelemetryAuthState,
  TelemetryDebugSink,
  TelemetryDroppedEvent,
  TelemetryEvent,
  TelemetryFlushDebugRecord,
  TelemetryPayload,
  TelemetryPayloadValidator,
  TelemetryService,
  TelemetryStoragePort,
  TelemetryTokenProvider,
  TelemetryTransport,
  TelemetryTransportAck,
  TelemetryTransportBatch,
  TrackingPlan,
} from "./types";

const DEFAULT_MAX_EVENTS = 1000;
const DEFAULT_MAX_BATCH_SIZE = 50;
const DEFAULT_FLUSH_INTERVAL_MS = 10000;
const DEFAULT_RETRY_LIMIT = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 1000;
const DEFAULT_RETRY_MAX_DELAY_MS = 30000;
const DEFAULT_MAX_EVENT_BYTES = 32 * 1024;
const DEFAULT_DEVICE_ID_STORAGE_KEY = "mini-game-sdk:telemetry:device-id";

type QueueDropPolicy = NonNullable<TelemetryQueueConfig["dropPolicy"]>;

export function createTelemetryService(options: CreateTelemetryServiceOptions): TelemetryService {
  return new DefaultTelemetryService(options);
}

export function createDisabledTelemetryService(
  options: { readonly enabled?: boolean } = {},
): TelemetryService {
  return new DefaultTelemetryService({
    context: createDisabledContext(),
    platform: createNoopPlatformFacade("noop"),
    account: createDisabledAccount(),
    enabled: options.enabled ?? false,
  });
}

class DefaultTelemetryService implements TelemetryService {
  private readonly registry = new TrackingPlanRegistry();
  private readonly queue: TelemetryQueueItem[] = [];
  private readonly subscriptions: Unsubscribe[] = [];
  private readonly enabled: boolean;
  private readonly autoTrackSdkEvents: boolean;
  private readonly queueConfig: TelemetryQueueConfig;
  private readonly debugSinks: readonly TelemetryDebugSink[];
  private readonly storage: TelemetryStoragePort | undefined;
  private readonly transport: TelemetryTransport | undefined;
  private readonly tokenProvider: TelemetryTokenProvider | undefined;
  private readonly payloadValidator: TelemetryPayloadValidator | undefined;
  private readonly sessionId = createId("sess");
  private readonly requestPrefix = createId("req");
  private readonly deviceIdStorageKey: string;
  private readonly pendingStorageKey: string;
  private sequenceId = 0;
  private requestSequence = 0;
  private deviceId: string;
  private launchScene: string | undefined;
  private channel: string | undefined;
  private flushTimer: ReturnType<typeof setInterval> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private flushing = false;
  private acceptingEvents = true;
  private destroyed = false;
  private retryBackoffLevel = 0;
  private deviceIdHydrated = false;
  private pendingQueueHydrated = false;
  private deviceIdHydration: Promise<void> = Promise.resolve();
  private pendingQueueHydration: Promise<void> = Promise.resolve();
  private startupHydration: Promise<void> = Promise.resolve();
  private inFlightFlush: Promise<Result<void, SdkError>> | undefined;
  private pendingStorageWrite: Promise<void> = Promise.resolve();

  constructor(private readonly options: CreateTelemetryServiceOptions) {
    this.enabled = options.enabled ?? true;
    this.autoTrackSdkEvents = options.autoTrackSdkEvents ?? true;
    this.queueConfig = options.queue ?? {};
    this.debugSinks = options.debugSinks ?? [];
    this.storage = options.storage;
    this.transport = options.transport;
    this.tokenProvider = options.tokenProvider;
    this.payloadValidator = options.payloadValidator;
    this.deviceId = options.deviceId ?? createId("device");
    this.deviceIdStorageKey = options.deviceIdStorageKey ?? DEFAULT_DEVICE_ID_STORAGE_KEY;
    this.pendingStorageKey =
      options.pendingStorageKey ??
      createTelemetryPendingStorageKey(
        options.context.config.app.gameId,
        options.context.config.app.environment,
      );

    if (!this.enabled) {
      return;
    }

    const sdkPlanResult = this.registry.register(SDK_PUBLIC_EVENTS_TRACKING_PLAN);
    if (!sdkPlanResult.ok) {
      this.options.context.logger.warn("SDK telemetry tracking plan registration failed.", {
        error: sdkPlanResult.error,
      });
    }

    if (options.trackingPlan !== undefined) {
      const result = this.registry.register(options.trackingPlan);
      if (!result.ok) {
        this.options.context.logger.warn("Configured telemetry tracking plan registration failed.", {
          error: result.error,
        });
      }
    }

    this.deviceIdHydration = this.hydrateDeviceId();
    this.pendingQueueHydration = this.hydratePendingQueue();
    this.startupHydration = Promise.all([
      this.deviceIdHydration,
      this.pendingQueueHydration,
    ]).then(() => {
      this.finalizePendingDeviceIds();
      this.recordReadyDebugEvents();
      return this.persistQueue();
    });

    if (this.autoTrackSdkEvents) {
      this.installSdkEventCollector();
    }

    this.startFlushTimer();
  }

  registerTrackingPlan(plan: TrackingPlan): Result<void, SdkError> {
    if (this.destroyed) {
      return fail(
        new SdkError("lifecycle.invalid_state", "Destroyed telemetry service cannot register plans.", {
          moduleName: "telemetry",
        }),
      );
    }

    return this.registry.register(plan);
  }

  track<TPayload extends TelemetryPayload>(
    name: string,
    payload: TPayload,
    options: { readonly eventId?: string; readonly atMs?: number; readonly version?: number } = {},
  ): TelemetryEvent<TPayload> | null {
    if (!this.enabled || !this.acceptingEvents || this.destroyed) {
      this.drop({ name, reason: "disabled" });
      return null;
    }

    const resolved = this.registry.resolve(name, options.version);
    if (resolved === "unknown") {
      this.drop({ name, reason: "unknown_event" });
      return null;
    }

    if (resolved === "inactive") {
      this.drop({ name, reason: "inactive_event" });
      return null;
    }

    const validation = validateTelemetryPayload(
      resolved as unknown as RegisteredTrackingPlanEvent<TPayload>,
      name,
      payload,
      {
        maxPayloadBytes: this.queueConfig.maxEventBytes ?? DEFAULT_MAX_EVENT_BYTES,
        ...(this.payloadValidator === undefined ? {} : { globalValidator: this.payloadValidator }),
      },
    );

    if (!validation.ok) {
      const reason = isOversizePayload(validation.error) ? "oversize_payload" : "invalid_payload";
      this.drop({
        name,
        reason,
        category: resolved.category,
        message: validation.error.message,
      });
      return null;
    }

    const createdAtMs = options.atMs ?? this.options.context.clock.now();
    const sequenceId = this.nextSequenceId();
    const event: TelemetryEvent<TPayload> = {
      id: options.eventId ?? `${this.sessionId}:${sequenceId}`,
      name,
      version: resolved.version,
      category: resolved.category,
      payload: validation.value,
      context: this.createEventContext(createdAtMs, sequenceId),
      createdAtMs,
    };

    if (!this.enqueue(event)) {
      return null;
    }

    return event;
  }

  async flush(): Promise<Result<void, SdkError>> {
    if (!this.enabled) {
      return ok(undefined);
    }

    if (this.inFlightFlush !== undefined) {
      return this.inFlightFlush;
    }

    const flushPromise = this.performFlush();
    this.inFlightFlush = flushPromise;
    try {
      return await flushPromise;
    } finally {
      if (this.inFlightFlush === flushPromise) {
        this.inFlightFlush = undefined;
      }
    }
  }

  private async performFlush(): Promise<Result<void, SdkError>> {
    await this.startupHydration;
    this.finalizePendingDeviceIds();
    this.recordReadyDebugEvents();

    if (this.queue.length === 0) {
      return ok(undefined);
    }

    if (this.transport === undefined) {
      const error = new SdkError("telemetry.transport_failed", "Telemetry transport is not configured.", {
        moduleName: "telemetry",
      });
      this.emitFlushFailed(error, false);
      this.debugFlush({ ok: false, accepted: 0, rejected: 0, message: error.message });
      return fail(error);
    }

    this.flushing = true;
    let accepted = 0;
    let rejected = 0;

    try {
      while (this.queue.length > 0) {
        this.finalizePendingDeviceIds();
        this.recordReadyDebugEvents();
        const batchItems = this.queue.slice(0, this.maxBatchSize());
        const outcome = await this.sendBatchItems(batchItems, true);
        accepted += outcome.accepted;
        rejected += outcome.rejected;

        if (!outcome.ok) {
          if (outcome.retryable) {
            this.scheduleRetry(outcome.retryAfterMs);
          }

          const error =
            outcome.error ??
            new SdkError("telemetry.transport_failed", "Telemetry flush failed.", {
              moduleName: "telemetry",
              metadata: { retryable: outcome.retryable, httpStatus: outcome.httpStatus },
            });
          this.emitFlushFailed(error, outcome.retryable ?? false);
          this.debugFlush({
            ok: false,
            accepted,
            rejected,
            ...(outcome.retryable === undefined ? {} : { retryable: outcome.retryable }),
            ...(outcome.httpStatus === undefined ? {} : { httpStatus: outcome.httpStatus }),
            message: error.message,
          });
          return fail(error);
        }
      }
    } finally {
      this.flushing = false;
      await this.persistQueue();
    }

    this.retryBackoffLevel = 0;
    this.emitFlushCompleted(accepted, rejected);
    this.debugFlush({ ok: true, accepted, rejected });
    return ok(undefined);
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.acceptingEvents = false;
    this.clearTimers();

    try {
      await this.flush();
    } catch (error) {
      this.options.context.logger.warn("Telemetry destroy flush failed.", { error });
    }

    await this.pendingStorageWrite;

    for (const unsubscribe of this.subscriptions) {
      try {
        unsubscribe();
      } catch {
        // Best-effort subscription cleanup.
      }
    }
    this.subscriptions.length = 0;
    this.clearTimers();
    this.destroyed = true;
  }

  private async sendBatchItems(
    items: readonly TelemetryQueueItem[],
    allowAuthRefresh: boolean,
  ): Promise<SendTelemetryBatchOutcome> {
    if (items.length === 0) {
      return { ok: true, accepted: 0, rejected: 0 };
    }

    const batch: TelemetryTransportBatch = {
      requestId: `${this.requestPrefix}:${++this.requestSequence}`,
      events: items.map((item) => item.event),
      sentAtMs: this.options.context.clock.now(),
      sessionId: this.sessionId,
    };
    let result: unknown;
    try {
      result = await this.transport?.send(batch);
    } catch (error) {
      this.markRetry(items);
      return {
        ok: false,
        accepted: 0,
        rejected: 0,
        retryable: true,
        error: new SdkError("telemetry.transport_failed", "Telemetry transport send failed.", {
          moduleName: "telemetry",
          cause: error,
        }),
      };
    }

    if (result === undefined) {
      return {
        ok: false,
        accepted: 0,
        rejected: 0,
        error: new SdkError("telemetry.transport_failed", "Telemetry transport is not configured.", {
          moduleName: "telemetry",
        }),
      };
    }

    const normalizedResult = normalizeTelemetryTransportResult(result);
    if (!normalizedResult.ok) {
      this.markRetry(items);
      return {
        ok: false,
        accepted: 0,
        rejected: 0,
        retryable: true,
        error: normalizedResult.error,
      };
    }

    const ack = normalizedResult.value;
    if (ack.authExpired && allowAuthRefresh) {
      const refreshResult = await this.refreshAuthState();
      if (!refreshResult.ok) {
        const retryable = this.markRetry(items);
        return {
          ok: false,
          accepted: 0,
          rejected: retryable.dropped,
          retryable: retryable.remaining > 0,
          ...(ack.httpStatus === undefined ? {} : { httpStatus: ack.httpStatus }),
          error: refreshResult.error,
        };
      }
      return this.sendBatchItems(items, false);
    }

    if (ack.splitAndRetry) {
      if (items.length <= 1) {
        this.removeItems(items);
        for (const item of items) {
          this.drop({
            name: item.event.name,
            reason: "oversize_payload",
            category: item.event.category,
            eventId: item.event.id,
          });
        }
        return {
          ok: true,
          accepted: 0,
          rejected: items.length,
          ...(ack.httpStatus === undefined ? {} : { httpStatus: ack.httpStatus }),
        };
      }

      const mid = Math.ceil(items.length / 2);
      const left = await this.sendBatchItems(items.slice(0, mid), allowAuthRefresh);
      const right = await this.sendBatchItems(items.slice(mid), allowAuthRefresh);
      return mergeTelemetryBatchOutcomes(left, right);
    }

    if (ack.retryable) {
      const retryable = this.markRetry(items);
      return {
        ok: false,
        accepted: 0,
        rejected: retryable.dropped,
        retryable: retryable.remaining > 0,
        ...(ack.retryAfterMs === undefined ? {} : { retryAfterMs: ack.retryAfterMs }),
        ...(ack.httpStatus === undefined ? {} : { httpStatus: ack.httpStatus }),
      };
    }

    if (ack.authExpired) {
      return {
        ok: false,
        accepted: 0,
        rejected: 0,
        ...(ack.httpStatus === undefined ? {} : { httpStatus: ack.httpStatus }),
        error: new SdkError("telemetry.auth_failed", "Telemetry authentication failed.", {
          moduleName: "telemetry",
          metadata: { httpStatus: ack.httpStatus },
        }),
      };
    }

    return this.applyAck(items, ack);
  }

  private applyAck(
    items: readonly TelemetryQueueItem[],
    ack: TelemetryTransportAck,
  ): SendTelemetryBatchOutcome {
    if (ack.dropWholeBatch) {
      this.removeItems(items);
      for (const item of items) {
        this.drop({
          name: item.event.name,
          reason: "invalid_payload",
          category: item.event.category,
          eventId: item.event.id,
        });
      }
      return {
        ok: true,
        accepted: 0,
        rejected: items.length,
        ...(ack.httpStatus === undefined ? {} : { httpStatus: ack.httpStatus }),
      };
    }

    const resolution = resolveTelemetryAck(items, ack);
    this.removeItems(Array.from(resolution.processedItems));

    for (const item of resolution.rejectedItems) {
      this.drop({
        name: item.event.name,
        reason: "invalid_payload",
        category: item.event.category,
        eventId: item.event.id,
      });
    }

    if (resolution.unconfirmedItems.length > 0) {
      const retryable = this.markRetry(resolution.unconfirmedItems);
      return {
        ok: false,
        accepted: resolution.acceptedItems.size,
        rejected: resolution.rejectedItems.size + retryable.dropped,
        retryable: retryable.remaining > 0,
        ...(ack.retryAfterMs === undefined ? {} : { retryAfterMs: ack.retryAfterMs }),
        ...(ack.httpStatus === undefined ? {} : { httpStatus: ack.httpStatus }),
      };
    }

    return {
      ok: true,
      accepted: resolution.acceptedItems.size,
      rejected: resolution.rejectedItems.size,
      ...(ack.httpStatus === undefined ? {} : { httpStatus: ack.httpStatus }),
    };
  }

  private enqueue(event: TelemetryEvent): boolean {
    const maxEvents = this.queueConfig.maxEvents ?? DEFAULT_MAX_EVENTS;
    if (this.queue.length >= maxEvents) {
      const policy: QueueDropPolicy = this.queueConfig.dropPolicy ?? "drop_oldest";
      if (policy === "drop_newest") {
        this.drop({
          name: event.name,
          reason: "queue_full",
          category: event.category,
          eventId: event.id,
        });
        return false;
      }

      const dropped = this.queue.shift();
      if (dropped !== undefined) {
        this.drop({
          name: dropped.event.name,
          reason: "queue_full",
          category: dropped.event.category,
          eventId: dropped.event.id,
        });
      }
    }

    this.queue.push({
      event,
      attempts: 0,
      restoredFromStorage: false,
      deviceIdFinalized: this.deviceIdHydrated,
      debugRecorded: false,
    });
    this.finalizePendingDeviceIds();
    this.recordReadyDebugEvents();
    void this.persistQueue();

    if (this.queue.length >= this.maxBatchSize()) {
      void this.flush();
    }

    return true;
  }

  private markRetry(
    items: readonly TelemetryQueueItem[],
  ): { readonly remaining: number; readonly dropped: number } {
    const retryLimit = this.queueConfig.retryLimit ?? DEFAULT_RETRY_LIMIT;
    let remaining = 0;
    let dropped = 0;

    for (const item of items) {
      item.attempts += 1;
      if (item.attempts > retryLimit) {
        this.removeItems([item]);
        dropped += 1;
        this.drop({
          name: item.event.name,
          reason: "transport_unavailable",
          category: item.event.category,
          eventId: item.event.id,
        });
      } else {
        remaining += 1;
      }
    }

    return { remaining, dropped };
  }

  private removeItems(items: readonly TelemetryQueueItem[]): void {
    const removeSet = new Set(items);
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const item = this.queue[index];
      if (item !== undefined && removeSet.has(item)) {
        this.queue.splice(index, 1);
      }
    }
  }

  private createEventContext(eventTimeMs: number, sequenceId: number) {
    const session = this.options.account.getSession();
    return {
      gameId: this.options.context.config.app.gameId,
      appVersion: this.options.context.config.app.appVersion,
      environment: this.options.context.config.app.environment,
      platform: this.options.platform.target,
      ...(session?.accountId === undefined ? {} : { accountId: session.accountId }),
      sessionId: this.sessionId,
      deviceId: this.deviceId,
      sdkVersion: this.options.context.runtime.sdkVersion,
      ...(this.launchScene === undefined ? {} : { launchScene: this.launchScene }),
      ...(this.channel === undefined ? {} : { channel: this.channel }),
      eventTimeMs,
      sequenceId,
    };
  }

  private nextSequenceId(): number {
    this.sequenceId += 1;
    return this.sequenceId;
  }

  private installSdkEventCollector(): void {
    this.subscriptions.push(
      ...installSdkEventTelemetryCollector({
        events: this.options.context.events,
        track: (name, payload, options) => {
          this.track(name, payload, options);
        },
        updateLaunchContext: (launchOptions) => {
          this.updateLaunchContext(launchOptions);
        },
      }),
    );
  }

  private updateLaunchContext(launchOptions: PlatformLaunchOptions | undefined): void {
    if (launchOptions === undefined) {
      return;
    }

    this.launchScene = launchOptions.scene;
    const channel = toTelemetryString(launchOptions.channel);
    if (channel !== undefined) {
      this.channel = channel;
    }
  }

  private async refreshAuthState(): Promise<Result<void, SdkError>> {
    if (this.tokenProvider === undefined) {
      return ok(undefined);
    }

    let result: Result<TelemetryAuthState, SdkError>;
    try {
      result =
        this.tokenProvider.refreshAuthState === undefined
          ? await this.tokenProvider.getAuthState()
          : await this.tokenProvider.refreshAuthState();
    } catch (error) {
      return fail(
        SdkError.fromUnknown(
          "telemetry.token_unavailable",
          "Telemetry token provider refresh failed.",
          error,
          { moduleName: "telemetry" },
        ),
      );
    }

    if (result.ok) {
      emitSdkEventAndWarn(
        this.options.context,
        "telemetry.auth.updated",
        {
          atMs: this.options.context.clock.now(),
          authenticated: result.value.authenticated,
          ...(result.value.accountId === undefined ? {} : { accountId: result.value.accountId }),
        },
        "Telemetry auth updated event handler failed.",
      );
      return ok(undefined);
    }

    return fail(result.error);
  }

  private drop(drop: TelemetryDroppedEvent): void {
    this.callDebugSinks("Telemetry debug sink drop handler failed.", (sink) => {
      sink.recordDrop?.(drop);
    });

    emitSdkEventAndWarn(
      this.options.context,
      "telemetry.event.dropped",
      {
        atMs: this.options.context.clock.now(),
        name: drop.name,
        reason: drop.reason,
        ...(drop.category === undefined ? {} : { eventCategory: drop.category }),
      },
      "Telemetry dropped event handler failed.",
    );
  }

  private emitFlushCompleted(accepted: number, rejected: number): void {
    emitSdkEventAndWarn(
      this.options.context,
      "telemetry.flush.completed",
      {
        atMs: this.options.context.clock.now(),
        accepted,
        rejected,
      },
      "Telemetry flush completed event handler failed.",
    );
  }

  private emitFlushFailed(error: SdkError, retryable: boolean): void {
    emitSdkEventAndWarn(
      this.options.context,
      "telemetry.flush.failed",
      {
        atMs: this.options.context.clock.now(),
        code: error.code,
        message: error.message,
        retryable,
      },
      "Telemetry flush failed event handler failed.",
    );
  }

  private debugFlush(record: TelemetryFlushDebugRecord): void {
    this.callDebugSinks("Telemetry debug sink flush handler failed.", (sink) => {
      sink.recordFlush?.(record);
    });
  }

  private maxBatchSize(): number {
    return Math.max(1, Math.min(this.queueConfig.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE, 100));
  }

  private startFlushTimer(): void {
    if (this.transport === undefined) {
      return;
    }

    const intervalMs = this.queueConfig.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    if (intervalMs <= 0) {
      return;
    }

    this.flushTimer = setInterval(() => {
      void this.flush();
    }, intervalMs);
  }

  private scheduleRetry(retryAfterMs: number | undefined): void {
    if (this.retryTimer !== undefined || this.queue.length === 0) {
      return;
    }

    const baseDelayMs = this.queueConfig.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
    const maxDelayMs = this.queueConfig.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS;
    const computedDelayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** this.retryBackoffLevel);
    this.retryBackoffLevel += 1;
    const delayMs = retryAfterMs ?? computedDelayMs;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.flush();
    }, delayMs);
  }

  private clearTimers(): void {
    if (this.flushTimer !== undefined) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  private async hydrateDeviceId(): Promise<void> {
    if (this.storage === undefined || this.options.deviceId !== undefined) {
      this.deviceIdHydrated = true;
      return;
    }

    try {
      const storedDeviceId = await this.storage.getItem(this.deviceIdStorageKey);
      if (storedDeviceId !== null && storedDeviceId.trim().length > 0) {
        this.deviceId = storedDeviceId;
        return;
      }

      await this.storage.setItem(this.deviceIdStorageKey, this.deviceId);
    } catch (error) {
      this.options.context.logger.warn("Telemetry device id storage failed.", { error });
    } finally {
      this.deviceIdHydrated = true;
    }
  }

  private async hydratePendingQueue(): Promise<void> {
    if (this.storage === undefined) {
      this.pendingQueueHydrated = true;
      return;
    }

    let shouldPersist = false;
    try {
      const storedQueue = await this.storage.getItem(this.pendingStorageKey);
      if (storedQueue === null) {
        shouldPersist = this.queue.length > 0;
        return;
      }

      const parsed = JSON.parse(storedQueue) as unknown;
      if (!Array.isArray(parsed)) {
        shouldPersist = this.queue.length > 0;
        return;
      }

      const restored: TelemetryQueueItem[] = [];
      for (const entry of parsed.slice(0, this.queueConfig.maxEvents ?? DEFAULT_MAX_EVENTS)) {
        const restoredEvent = this.validateRestoredEvent(entry);
        if (restoredEvent !== null) {
          restored.push({
            event: restoredEvent,
            attempts: 0,
            restoredFromStorage: true,
            deviceIdFinalized: true,
            debugRecorded: true,
          });
        }
      }

      this.mergeHydratedQueue(restored);
      shouldPersist = true;
    } catch (error) {
      this.options.context.logger.warn("Telemetry pending queue storage restore failed.", { error });
    } finally {
      this.pendingQueueHydrated = true;
      if (shouldPersist) {
        await this.persistQueue();
      }
    }
  }

  private validateRestoredEvent(entry: unknown): TelemetryEvent | null {
    if (!isTelemetryEventSnapshot(entry)) {
      return null;
    }

    if (
      !isNonEmptyTelemetryString(entry.id) ||
      !isNonEmptyTelemetryString(entry.name) ||
      !Number.isInteger(entry.version) ||
      entry.version <= 0 ||
      !Number.isFinite(entry.createdAtMs)
    ) {
      this.drop({
        name: isNonEmptyTelemetryString(entry.name) ? entry.name : "unknown",
        reason: "invalid_payload",
        ...(isNonEmptyTelemetryString(entry.id) ? { eventId: entry.id } : {}),
      });
      return null;
    }

    const contextResult = normalizeRestoredTelemetryContext(entry.context);
    if (!contextResult.ok) {
      this.drop({
        name: entry.name,
        reason: "invalid_payload",
        eventId: entry.id,
        message: contextResult.error,
      });
      return null;
    }

    const event: TelemetryEvent = {
      ...entry,
      context: contextResult.value,
    };

    if (!this.acceptsRestoredEvent(event)) {
      return null;
    }

    const resolved = this.registry.resolve(event.name, event.version);
    if (resolved === "unknown") {
      this.drop({ name: event.name, reason: "unknown_event", eventId: event.id });
      return null;
    }

    if (resolved === "inactive") {
      this.drop({ name: event.name, reason: "inactive_event", eventId: event.id });
      return null;
    }

    if (event.category !== resolved.category) {
      this.drop({
        name: event.name,
        reason: "invalid_payload",
        category: resolved.category,
        eventId: event.id,
        message: "Telemetry restored event category does not match tracking plan.",
      });
      return null;
    }

    const validation = validateTelemetryPayload(
      resolved as unknown as RegisteredTrackingPlanEvent<TelemetryPayload>,
      event.name,
      event.payload,
      {
        maxPayloadBytes: this.queueConfig.maxEventBytes ?? DEFAULT_MAX_EVENT_BYTES,
        ...(this.payloadValidator === undefined ? {} : { globalValidator: this.payloadValidator }),
      },
    );
    if (!validation.ok) {
      this.drop({
        name: event.name,
        reason: isOversizePayload(validation.error) ? "oversize_payload" : "invalid_payload",
        category: resolved.category,
        eventId: event.id,
        message: validation.error.message,
      });
      return null;
    }

    return {
      ...event,
      version: resolved.version,
      category: resolved.category,
      payload: validation.value,
    };
  }

  private acceptsRestoredEvent(event: TelemetryEvent): boolean {
    const app = this.options.context.config.app;
    return event.context.gameId === app.gameId && event.context.environment === app.environment;
  }

  private mergeHydratedQueue(restored: readonly TelemetryQueueItem[]): void {
    if (restored.length === 0) {
      return;
    }

    const existing = this.queue.slice();
    const seen = new Set<string>();
    const merged: TelemetryQueueItem[] = [];

    for (const item of restored) {
      if (seen.has(item.event.id)) {
        continue;
      }
      seen.add(item.event.id);
      merged.push(item);
    }

    for (const item of existing) {
      if (seen.has(item.event.id)) {
        continue;
      }
      seen.add(item.event.id);
      merged.push(item);
    }

    const maxEvents = this.queueConfig.maxEvents ?? DEFAULT_MAX_EVENTS;
    const bounded =
      merged.length <= maxEvents
        ? merged
        : this.queueConfig.dropPolicy === "drop_newest"
          ? merged.slice(0, maxEvents)
          : merged.slice(merged.length - maxEvents);

    this.queue.length = 0;
    this.queue.push(...bounded);
  }

  private finalizePendingDeviceIds(): void {
    if (!this.deviceIdHydrated) {
      return;
    }

    for (const item of this.queue) {
      if (item.deviceIdFinalized) {
        continue;
      }

      if (!item.restoredFromStorage && item.event.context.deviceId !== this.deviceId) {
        rewriteEventDeviceId(item.event, this.deviceId);
      }

      item.deviceIdFinalized = true;
    }
  }

  private recordReadyDebugEvents(): void {
    for (const item of this.queue) {
      if (!item.deviceIdFinalized || item.debugRecorded) {
        continue;
      }

      this.recordDebugEvent(item.event);
      item.debugRecorded = true;
    }
  }

  private recordDebugEvent(event: TelemetryEvent): void {
    this.callDebugSinks("Telemetry debug sink failed.", (sink) => {
      sink.record(event);
    });
  }

  private callDebugSinks(
    warningMessage: string,
    call: (sink: TelemetryDebugSink) => void,
  ): void {
    for (const sink of this.debugSinks) {
      try {
        call(sink);
      } catch (error) {
        this.options.context.logger.warn(warningMessage, { error });
      }
    }
  }

  private persistQueue(): Promise<void> {
    if (this.storage === undefined || !this.pendingQueueHydrated || !this.deviceIdHydrated) {
      return this.pendingStorageWrite;
    }

    this.finalizePendingDeviceIds();

    const storage = this.storage;
    const key = this.pendingStorageKey;
    const events = this.queue.map((item) => item.event);
    const shouldRemove = events.length === 0;
    const snapshot = JSON.stringify(events);

    this.pendingStorageWrite = this.pendingStorageWrite
      .catch(() => undefined)
      .then(async () => {
        if (shouldRemove) {
          await storage.removeItem(key);
          return;
        }

        await storage.setItem(key, snapshot);
      })
      .catch((error) => {
        this.options.context.logger.warn("Telemetry queue storage failed.", { error });
      });

    return this.pendingStorageWrite;
  }
}

function isOversizePayload(error: SdkError): boolean {
  const maxPayloadBytes = error.metadata?.["maxPayloadBytes"];
  return error.code === "telemetry.event_invalid" && typeof maxPayloadBytes === "number";
}

function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  const now = Date.now().toString(36);
  return `${prefix}_${now}_${random}`;
}

function createDisabledAccount(): AccountService {
  return {
    getSession: () => null,
    silentLogin: async () =>
      fail(
        new SdkError("account.backend_unavailable", "Account service is disabled.", {
          moduleName: "account",
        }),
      ),
    clearSession: () => ok(undefined),
    onSessionChanged: () => noopUnsubscribe,
    destroy: () => undefined,
  };
}
