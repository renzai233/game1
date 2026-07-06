import { CompositeDisposable } from '../disposable/CompositeDisposable';
import { Dispose, RuntimeLogger } from '../runtime/types';
import {
    NoticeCenterOptions,
    NoticeDirtyHint,
    NoticeEntry,
    NoticeProvider,
    NoticeProviderResult,
    NoticeSnapshot,
    NoticeSubscriber,
    createEmptyNoticeEntry,
    createEmptyNoticeSnapshot
} from './types';

export class NoticeCenter<TKey extends string, TContext = void> {
    private readonly providersByKey = new Map<TKey, NoticeProvider<TKey, TContext>>();
    private readonly allKeys: TKey[] = [];
    private readonly dependencies = new Map<TKey, readonly TKey[]>();
    private readonly subscribers = new Set<NoticeSubscriber<TKey>>();
    private readonly providerSubscriptions: CompositeDisposable;
    private readonly context: TContext;
    private readonly now: () => number;
    private readonly onError?: NoticeCenterOptions<TKey>['onError'];
    private readonly onFlush?: NoticeCenterOptions<TKey>['onFlush'];
    private readonly logger: RuntimeLogger;
    private readonly defaultFlushBudgetMs: number;
    private readonly yieldToHost: () => void | Promise<void>;

    private entries: Record<TKey, NoticeEntry<TKey>>;
    private snapshot: NoticeSnapshot<TKey>;
    private dirtyKeys = new Set<TKey>();
    private isDestroyed = false;
    private isFlushing = false;
    private flushRequested = false;
    // 统一的刷新循环句柄：保证同一时刻只运行一条 flush 通道。
    private flushLoopPromise: Promise<void> | null = null;

    constructor(
        providers: NoticeProvider<TKey, TContext>[],
        context: TContext,
        options: NoticeCenterOptions<TKey> = {}
    ) {
        const providerKeys = providers.map((provider) => provider.key);
        providers.forEach((provider) => this.providersByKey.set(provider.key, provider));
        this.allKeys = providerKeys;

        this.context = context;
        this.now = options.now || (() => Date.now());
        this.onError = options.onError;
        this.onFlush = options.onFlush;
        this.logger = options.logger || {};
        this.defaultFlushBudgetMs = Number.isFinite(options.defaultFlushBudgetMs)
            ? Math.max(0, Number(options.defaultFlushBudgetMs))
            : Number.POSITIVE_INFINITY;
        this.yieldToHost = options.yieldToHost || (() => undefined);
        this.providerSubscriptions = new CompositeDisposable({
            logger: this.logger,
            scope: 'NoticeCenter/provider-subscriptions'
        });

        if (options.dependencies) {
            this.allKeys.forEach((key) => {
                const related = options.dependencies?.[key];
                if (related && related.length > 0) {
                    this.dependencies.set(key, [...related]);
                }
            });
        }

        this.snapshot = createEmptyNoticeSnapshot(providerKeys, this.now());
        this.entries = { ...this.snapshot.entries };
    }

    async init(): Promise<void> {
        for (const [key, provider] of this.providersByKey.entries()) {
            try {
                await provider.init?.(this.context);
            } catch (error) {
                this.onError?.(key, 'init', error);
            }

            try {
                const dispose = provider.subscribe?.(this.context, (dirtyHint) => {
                    this.applyDirtyHint(key, dirtyHint);
                    this.requestRefresh();
                });
                if (dispose) {
                    this.providerSubscriptions.add(dispose);
                }
            } catch (error) {
                this.onError?.(key, 'subscribe', error);
            }
        }

        // 初始化阶段只通过 requestRefresh -> flushLoop 这一条通道触发刷新，
        // 避免 requestRefresh + 直接 flush 带来的并发/重复执行风险。
        this.requestRefresh();
        if (this.flushLoopPromise) {
            await this.flushLoopPromise;
        }
    }

    subscribe(subscriber: NoticeSubscriber<TKey>): Dispose {
        this.subscribers.add(subscriber);
        subscriber(this.snapshot, this.allKeys);

        return () => {
            this.subscribers.delete(subscriber);
        };
    }

    getSnapshot(): NoticeSnapshot<TKey> {
        return this.snapshot;
    }

    markDirty(key: TKey): void {
        if (this.isDestroyed) {
            return;
        }
        this.addDirtyWithDependencies(key);
    }

    requestRefresh(keys?: readonly TKey[]): void {
        if (this.isDestroyed) {
            return;
        }

        if (keys && keys.length > 0) {
            keys.forEach((key) => this.addDirtyWithDependencies(key));
        } else if (this.dirtyKeys.size === 0) {
            this.allKeys.forEach((key) => this.addDirtyWithDependencies(key));
        }

        this.flushRequested = true;
        this.ensureFlushLoopScheduled();
    }

    async flush(budgetMs: number = this.defaultFlushBudgetMs): Promise<NoticeSnapshot<TKey>> {
        if (this.isDestroyed) {
            return this.snapshot;
        }

        const startedAt = this.now();
        let changed = false;
        let processed = 0;
        const changedKeys: TKey[] = [];
        const queued = Array.from(this.dirtyKeys.values());

        for (const key of queued) {
            if (processed > 0 && this.now() - startedAt >= budgetMs) {
                break;
            }
            this.dirtyKeys.delete(key);
            const updated = await this.evaluateOne(key);
            changed = changed || updated;
            processed += 1;
            if (updated) {
                changedKeys.push(key);
            }
        }

        if (changed) {
            this.snapshot = this.buildSnapshot(this.now());
            this.notify(changedKeys);
        }

        this.reportFlush({
            durationMs: this.now() - startedAt,
            budgetMs,
            queuedCount: queued.length,
            processedCount: processed,
            remainingCount: this.dirtyKeys.size,
            changedKeys
        });

        return this.snapshot;
    }

    destroy(): void {
        if (this.isDestroyed) {
            return;
        }

        this.isDestroyed = true;
        this.subscribers.clear();
        this.providerSubscriptions.disposeAll();

        this.providersByKey.forEach((provider, key) => {
            try {
                provider.destroy?.();
            } catch (error) {
                this.onError?.(key, 'destroy', error);
            }
        });
    }

    private async flushLoop(): Promise<void> {
        this.isFlushing = true;

        try {
            do {
                this.flushRequested = false;
                await this.flush();
                if (!this.isDestroyed && this.dirtyKeys.size > 0) {
                    await this.yieldToHost();
                }
            } while (!this.isDestroyed && (this.flushRequested || this.dirtyKeys.size > 0));
        } finally {
            this.isFlushing = false;
        }
    }

    private ensureFlushLoopScheduled(): void {
        if (this.flushLoopPromise) {
            return;
        }

        this.flushLoopPromise = this.flushLoop()
            .catch((error) => {
                this.logger.error?.('[ui-runtime][NoticeCenter] flushLoop failed:', error);
            })
            .finally(() => {
                this.flushLoopPromise = null;
            });
    }

    private async evaluateOne(key: TKey): Promise<boolean> {
        const provider = this.providersByKey.get(key);
        if (!provider) {
            return false;
        }

        const now = this.now();
        const fallback = createEmptyNoticeEntry(key, now);

        try {
            const evaluated = await provider.evaluate(this.context, now);
            const next = this.normalizeEntry(key, evaluated, now);
            return this.updateEntry(next);
        } catch (error) {
            this.onError?.(key, 'evaluate', error);
            return this.updateEntry(fallback);
        }
    }

    private normalizeEntry(key: TKey, entry: NoticeProviderResult | null | undefined, now: number): NoticeEntry<TKey> {
        if (!entry) {
            return createEmptyNoticeEntry(key, now);
        }

        return {
            key,
            visible: !!entry.visible,
            updatedAt: entry.updatedAt || now,
            nextRefreshAt: entry.nextRefreshAt,
            payload: entry.payload,
            versionToken: entry.versionToken
        };
    }

    private updateEntry(next: NoticeEntry<TKey>): boolean {
        const previous = this.entries[next.key];
        if (previous && this.isSameEntry(previous, next)) {
            return false;
        }

        this.entries[next.key] = next;
        return true;
    }

    private isSameEntry(prev: NoticeEntry<TKey>, next: NoticeEntry<TKey>): boolean {
        return prev.visible === next.visible
            && prev.nextRefreshAt === next.nextRefreshAt
            && prev.versionToken === next.versionToken;
    }

    private buildSnapshot(now: number): NoticeSnapshot<TKey> {
        const entries = { ...this.entries };
        return {
            entries,
            anyVisible: Object.values(entries).some((entry) => entry.visible),
            updatedAt: now
        };
    }

    private notify(changedKeys: readonly TKey[]): void {
        this.subscribers.forEach((subscriber) => {
            try {
                subscriber(this.snapshot, changedKeys);
            } catch (error) {
                this.logger.error?.('[ui-runtime][NoticeCenter] subscriber failed:', error);
            }
        });
    }

    private applyDirtyHint(defaultKey: TKey, dirtyHint: NoticeDirtyHint<TKey>): void {
        if (Array.isArray(dirtyHint)) {
            dirtyHint.forEach((key) => this.addDirtyWithDependencies(key));
            return;
        }

        if (dirtyHint) {
            this.addDirtyWithDependencies(dirtyHint);
            return;
        }

        this.addDirtyWithDependencies(defaultKey);
    }

    private addDirtyWithDependencies(key: TKey): void {
        const stack: TKey[] = [key];
        const visited = new Set<TKey>();

        while (stack.length > 0) {
            const current = stack.pop();
            if (!current || visited.has(current)) {
                continue;
            }

            visited.add(current);
            this.dirtyKeys.add(current);

            const relatedKeys = this.dependencies.get(current);
            if (!relatedKeys || relatedKeys.length === 0) {
                continue;
            }

            relatedKeys.forEach((relatedKey) => {
                if (!visited.has(relatedKey)) {
                    stack.push(relatedKey);
                }
            });
        }
    }

    private reportFlush(metric: Parameters<NonNullable<NoticeCenterOptions<TKey>['onFlush']>>[0]): void {
        if (!this.onFlush) {
            return;
        }

        try {
            this.onFlush(metric);
        } catch (error) {
            this.logger.error?.('[ui-runtime][NoticeCenter] onFlush callback failed:', error);
        }
    }
}
