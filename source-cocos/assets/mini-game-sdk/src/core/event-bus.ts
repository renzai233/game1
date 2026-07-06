import { SdkError } from "./errors";
import { fail, ok, type Result } from "./result";

export type Unsubscribe = () => void;

export type EventMap = Record<string, unknown>;

export type EventHandler<TPayload> = (payload: TPayload) => void;

export interface EventBus<TEvents extends EventMap = EventMap> {
  on<TKey extends keyof TEvents & string>(
    eventName: TKey,
    handler: EventHandler<TEvents[TKey]>,
  ): Unsubscribe;
  once<TKey extends keyof TEvents & string>(
    eventName: TKey,
    handler: EventHandler<TEvents[TKey]>,
  ): Unsubscribe;
  emit<TKey extends keyof TEvents & string>(
    eventName: TKey,
    payload: TEvents[TKey],
  ): Result<void, SdkError>;
  clear(eventName?: keyof TEvents & string): void;
}

type UnknownHandler = (payload: unknown) => void;

export class DefaultEventBus<TEvents extends EventMap = EventMap> implements EventBus<TEvents> {
  private readonly handlers = new Map<string, Set<UnknownHandler>>();

  on<TKey extends keyof TEvents & string>(
    eventName: TKey,
    handler: EventHandler<TEvents[TKey]>,
  ): Unsubscribe {
    let bucket = this.handlers.get(eventName);
    if (bucket === undefined) {
      bucket = new Set<UnknownHandler>();
      this.handlers.set(eventName, bucket);
    }

    const unknownHandler = handler as UnknownHandler;
    bucket.add(unknownHandler);

    return () => {
      const currentBucket = this.handlers.get(eventName);
      if (currentBucket === undefined) {
        return;
      }

      currentBucket.delete(unknownHandler);
      if (currentBucket.size === 0) {
        this.handlers.delete(eventName);
      }
    };
  }

  once<TKey extends keyof TEvents & string>(
    eventName: TKey,
    handler: EventHandler<TEvents[TKey]>,
  ): Unsubscribe {
    let unsubscribe: Unsubscribe = () => undefined;
    unsubscribe = this.on(eventName, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  emit<TKey extends keyof TEvents & string>(
    eventName: TKey,
    payload: TEvents[TKey],
  ): Result<void, SdkError> {
    const bucket = this.handlers.get(eventName);
    if (bucket === undefined || bucket.size === 0) {
      return ok(undefined);
    }

    for (const handler of snapshotSet(bucket)) {
      try {
        handler(payload);
      } catch (error) {
        return fail(
          SdkError.fromUnknown("event.handler_failed", `Event handler failed: ${eventName}`, error, {
            metadata: { eventName },
          }),
        );
      }
    }

    return ok(undefined);
  }

  clear(eventName?: keyof TEvents & string): void {
    if (eventName === undefined) {
      this.handlers.clear();
      return;
    }

    this.handlers.delete(eventName);
  }
}

function snapshotSet<TValue>(source: ReadonlySet<TValue>): TValue[] {
  // Avoid Set spread here; Cocos Wechat builds can lower it to Array.concat(Set).
  const snapshot: TValue[] = [];
  source.forEach((value) => {
    snapshot.push(value);
  });
  return snapshot;
}

export function createEventBus<TEvents extends EventMap = EventMap>(): EventBus<TEvents> {
  return new DefaultEventBus<TEvents>();
}
