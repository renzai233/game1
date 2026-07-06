import { CompositeDisposable, NoticeCenter } from 'db://assets/shared/ui-runtime/core';
import type { NoticeCenterOptions, NoticeFlushObserver, NoticeProvider } from 'db://assets/shared/ui-runtime/core';
import type { RuntimeLogger } from 'db://assets/shared/ui-runtime/core';
import { SIGNAL_TYPES } from 'db://assets/utils/signal/ISignal';
import type { HomeSharedRuntimeContext, HomeSharedRuntimeModule } from '../composition/homeSharedModules';
import type { HomeBusEventMap } from '../composition/eventMaps';
import { HomeClaimNoticePresenter } from './HomeClaimNoticePresenter';
import { HOME_CLAIM_NOTICE_KEYS, HomeClaimNoticeKey } from './types';
import { DailyTaskNoticeProvider } from './providers/DailyTaskNoticeProvider';
import { OfflineRewardNoticeProvider } from './providers/OfflineRewardNoticeProvider';
import { SignInTaskNoticeProvider } from './providers/SignInTaskNoticeProvider';

type HomeClaimStateChangedEvent = Extract<
    keyof HomeBusEventMap,
    | SIGNAL_TYPES.DAILY_TASK_STATE_CHANGED
    | SIGNAL_TYPES.SIGN_IN_TASK_STATE_CHANGED
    | SIGNAL_TYPES.OFFLINE_REWARD_STATE_CHANGED
>;

export interface HomeClaimStatusSharedModuleDeps {
    createProviders?: () => NoticeProvider<HomeClaimNoticeKey, void>[];
    createPresenter?: (root: HomeSharedRuntimeContext['root']) => HomeClaimNoticePresenter;
    refreshIntervalSeconds?: number;
    defaultFlushBudgetMs?: number;
    yieldToHost?: () => void | Promise<void>;
    logger?: RuntimeLogger;
    onNoticeError?: NoticeCenterOptions<HomeClaimNoticeKey>['onError'];
    onNoticeFlush?: NoticeFlushObserver<HomeClaimNoticeKey>;
}

type ResolvedHomeClaimStatusSharedModuleDeps =
    Omit<Required<HomeClaimStatusSharedModuleDeps>, 'onNoticeFlush'>
    & Pick<HomeClaimStatusSharedModuleDeps, 'onNoticeFlush'>;

const DEFAULT_DEPS: Required<HomeClaimStatusSharedModuleDeps> = {
    createProviders: () => ([
        new DailyTaskNoticeProvider(),
        new SignInTaskNoticeProvider(),
        new OfflineRewardNoticeProvider()
    ]),
    createPresenter: (root) => new HomeClaimNoticePresenter(root),
    refreshIntervalSeconds: 30,
    defaultFlushBudgetMs: 4,
    yieldToHost: () => new Promise((resolve) => setTimeout(resolve, 0)),
    logger: {
        error: (message: string, ...args: unknown[]) => {
            console.error(message, ...args);
        }
    },
    onNoticeError: () => undefined,
    onNoticeFlush: undefined
};

export class HomeClaimStatusSharedModule implements HomeSharedRuntimeModule {

    readonly id = 'home-shared-claim-status-module';

    private isSetup = false;
    private disposables: CompositeDisposable;
    private center: NoticeCenter<HomeClaimNoticeKey, void> | null = null;
    private presenter: HomeClaimNoticePresenter | null = null;
    private readonly deps: ResolvedHomeClaimStatusSharedModuleDeps;

    constructor(deps: HomeClaimStatusSharedModuleDeps = {}) {
        const logger = deps.logger || DEFAULT_DEPS.logger;
        this.deps = {
            createProviders: deps.createProviders || DEFAULT_DEPS.createProviders,
            createPresenter: deps.createPresenter || DEFAULT_DEPS.createPresenter,
            refreshIntervalSeconds: deps.refreshIntervalSeconds ?? DEFAULT_DEPS.refreshIntervalSeconds,
            defaultFlushBudgetMs: deps.defaultFlushBudgetMs ?? DEFAULT_DEPS.defaultFlushBudgetMs,
            yieldToHost: deps.yieldToHost || DEFAULT_DEPS.yieldToHost,
            logger,
            onNoticeError: deps.onNoticeError || ((providerKey, phase, error) => {
                logger.error?.(`[HomeClaimStatusSharedModule] ${phase} failed: ${providerKey}`, error);
            }),
            onNoticeFlush: deps.onNoticeFlush || DEFAULT_DEPS.onNoticeFlush
        };
        this.disposables = new CompositeDisposable({
            logger: this.deps.logger,
            scope: 'HomeClaimStatusSharedModule'
        });
    }

    private readonly signalDirtyMap: ReadonlyArray<{ event: HomeClaimStateChangedEvent; keys: readonly HomeClaimNoticeKey[] }> = [
        { event: SIGNAL_TYPES.DAILY_TASK_STATE_CHANGED, keys: ['dailyTask'] },
        { event: SIGNAL_TYPES.SIGN_IN_TASK_STATE_CHANGED, keys: ['signInTask'] },
        { event: SIGNAL_TYPES.OFFLINE_REWARD_STATE_CHANGED, keys: ['offlineReward'] }
    ];

    async setup(ctx: HomeSharedRuntimeContext): Promise<void> {
        if (this.isSetup) {
            return;
        }

        const center = new NoticeCenter<HomeClaimNoticeKey, void>(
            this.deps.createProviders(),
            undefined,
            {
                defaultFlushBudgetMs: this.deps.defaultFlushBudgetMs,
                yieldToHost: this.deps.yieldToHost,
                onError: this.deps.onNoticeError,
                onFlush: this.deps.onNoticeFlush,
                logger: this.deps.logger
            }
        );

        await center.init();

        this.center = center;
        this.presenter = this.deps.createPresenter(ctx.root);

        this.disposables.add(center.subscribe((snapshot, changedKeys) => {
            this.presenter?.render(snapshot, changedKeys);
        }));

        if (this.deps.refreshIntervalSeconds > 0) {
            this.disposables.add(ctx.every(this.deps.refreshIntervalSeconds, () => {
                this.center?.requestRefresh(HOME_CLAIM_NOTICE_KEYS);
            }));
        }

        this.bindSignalUpdates(ctx);

        this.center.requestRefresh(HOME_CLAIM_NOTICE_KEYS);
        this.isSetup = true;
    }

    teardown(): void {
        if (!this.isSetup) {
            return;
        }

        this.disposables.disposeAll();
        this.center?.destroy();
        this.center = null;
        this.presenter = null;
        this.disposables = new CompositeDisposable({
            logger: this.deps.logger,
            scope: 'HomeClaimStatusSharedModule'
        });
        this.isSetup = false;
    }

    private bindSignalUpdates(ctx: HomeSharedRuntimeContext): void {
        this.signalDirtyMap.forEach(({ event, keys }) => {
            this.disposables.add(ctx.onBus(event, () => {
                keys.forEach((key) => this.center?.markDirty(key));
                this.center?.requestRefresh(keys);
            }));
        });
    }
}

export function createHomeClaimStatusSharedModule(
    deps: HomeClaimStatusSharedModuleDeps = {}
): HomeSharedRuntimeModule {
    return new HomeClaimStatusSharedModule(deps);
}
