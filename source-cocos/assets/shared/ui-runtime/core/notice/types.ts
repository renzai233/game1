import { Dispose, RuntimeLogger } from '../runtime/types';

export interface NoticeEntry<TKey extends string = string> {
    key: TKey;
    visible: boolean;
    updatedAt: number;
    nextRefreshAt?: number;
    payload?: unknown;
    versionToken?: string | number;
}

export interface NoticeSnapshot<TKey extends string = string> {
    entries: Record<TKey, NoticeEntry<TKey>>;
    anyVisible: boolean;
    updatedAt: number;
}

export interface NoticeProviderResult {
    visible: boolean;
    updatedAt?: number;
    nextRefreshAt?: number;
    payload?: unknown;
    versionToken?: string | number;
}

export type NoticeDirtyHint<TKey extends string> = TKey | readonly TKey[] | null | undefined;

export type NoticeProviderNotify<TKey extends string> = (dirtyHint?: NoticeDirtyHint<TKey>) => void;

export interface NoticeProvider<TKey extends string, TContext = void> {
    readonly key: TKey;
    init?(context: TContext): void | Promise<void>;
    evaluate(context: TContext, now: number): NoticeProviderResult | Promise<NoticeProviderResult>;
    subscribe?(context: TContext, notify: NoticeProviderNotify<TKey>): Dispose;
    destroy?(): void;
}

export type NoticeSubscriber<TKey extends string> = (
    snapshot: NoticeSnapshot<TKey>,
    changedKeys: readonly TKey[]
) => void;

export type NoticeErrorHandler<TKey extends string> =
    (providerKey: TKey, phase: 'init' | 'subscribe' | 'evaluate' | 'destroy', error: unknown) => void;

export interface NoticeFlushMetric<TKey extends string = string> {
    durationMs: number;
    budgetMs: number;
    queuedCount: number;
    processedCount: number;
    remainingCount: number;
    changedKeys: readonly TKey[];
}

export type NoticeFlushObserver<TKey extends string> = (metric: NoticeFlushMetric<TKey>) => void;

export interface NoticeCenterOptions<TKey extends string> {
    now?: () => number;
    onError?: NoticeErrorHandler<TKey>;
    onFlush?: NoticeFlushObserver<TKey>;
    logger?: RuntimeLogger;
    dependencies?: Partial<Record<TKey, readonly TKey[]>>;
    defaultFlushBudgetMs?: number;
    yieldToHost?: () => void | Promise<void>;
}

export function createEmptyNoticeEntry<TKey extends string>(key: TKey, now: number): NoticeEntry<TKey> {
    return {
        key,
        visible: false,
        updatedAt: now
    };
}

export function createEmptyNoticeSnapshot<TKey extends string>(
    keys: readonly TKey[],
    now: number
): NoticeSnapshot<TKey> {
    const entries = {} as Record<TKey, NoticeEntry<TKey>>;
    keys.forEach((key) => {
        entries[key] = createEmptyNoticeEntry(key, now);
    });

    return {
        entries,
        anyVisible: false,
        updatedAt: now
    };
}
