import { SIGNAL_TYPES } from 'db://assets/utils/signal/ISignal';
import { CompositeDisposable } from '../runtime/CompositeDisposable';
import { HomeRuntimeContext, IHomeRuntimeModule } from '../runtime/contracts';
import { ClaimStatusCenter } from './ClaimStatusCenter';
import { HomeClaimBadgePresenter } from './HomeClaimBadgePresenter';
import { DailyTaskStatusProvider } from './providers/DailyTaskStatusProvider';
import { OfflineRewardStatusProvider } from './providers/OfflineRewardStatusProvider';
import { SignInTaskStatusProvider } from './providers/SignInTaskStatusProvider';

class HomeClaimStatusModule implements IHomeRuntimeModule {
    private static _instance: HomeClaimStatusModule;

    public readonly id = 'home-claim-status-module';

    private isSetup = false;
    private disposables = new CompositeDisposable();
    private claimStatusCenter: ClaimStatusCenter | null = null;

    static getInstance(): HomeClaimStatusModule {
        if (!this._instance) {
            this._instance = new HomeClaimStatusModule();
        }
        return this._instance;
    }

    async setup(ctx: HomeRuntimeContext): Promise<void> {
        if (this.isSetup) {
            return;
        }

        const presenter = new HomeClaimBadgePresenter(ctx.root);
        const center = new ClaimStatusCenter([
            new DailyTaskStatusProvider(),
            new SignInTaskStatusProvider(),
            new OfflineRewardStatusProvider()
        ]);

        await center.init();

        this.claimStatusCenter = center;
        this.disposables.add(center.subscribe((snapshot) => {
            presenter.render(snapshot);
        }));

        this.disposables.add(ctx.every(30, () => {
            this.claimStatusCenter?.requestRefresh();
        }));

        this.disposables.add(ctx.onBus(SIGNAL_TYPES.DAILY_TASK_STATE_CHANGED, () => {
            this.claimStatusCenter?.requestRefresh();
        }));

        this.disposables.add(ctx.onBus(SIGNAL_TYPES.SIGN_IN_TASK_STATE_CHANGED, () => {
            this.claimStatusCenter?.requestRefresh();
        }));

        this.disposables.add(ctx.onBus(SIGNAL_TYPES.OFFLINE_REWARD_STATE_CHANGED, () => {
            this.claimStatusCenter?.requestRefresh();
        }));

        this.claimStatusCenter.requestRefresh();
        this.isSetup = true;
    }

    teardown(): void {
        if (!this.isSetup) {
            return;
        }

        this.disposables.disposeAll();
        this.claimStatusCenter?.destroy();
        this.claimStatusCenter = null;
        this.disposables = new CompositeDisposable();
        this.isSetup = false;
    }
}

export const homeClaimStatusModule = HomeClaimStatusModule.getInstance();
