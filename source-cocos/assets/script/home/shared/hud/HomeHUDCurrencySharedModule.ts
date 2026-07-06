import { CompositeDisposable } from 'db://assets/shared/ui-runtime/core';
import type { RuntimeLogger } from 'db://assets/shared/ui-runtime/core';
import { CurrencyType } from 'db://assets/utils/common/CurrencyManager';
import { SIGNAL_TYPES } from 'db://assets/utils/signal/ISignal';
import type { HomeSharedRuntimeContext, HomeSharedRuntimeModule } from '../composition/homeSharedModules';
import { HomeHUDCurrencyPresenter } from './HomeHUDCurrencyPresenter';
import type { CurrencyChangedPayload } from './types';

export interface HomeHUDCurrencySharedModuleDeps {
    createPresenter?: (root: HomeSharedRuntimeContext['root']) => HomeHUDCurrencyPresenter;
    logger?: RuntimeLogger;
}

const DEFAULT_DEPS: Required<HomeHUDCurrencySharedModuleDeps> = {
    createPresenter: (root) => new HomeHUDCurrencyPresenter(root),
    logger: {
        error: (message: string, ...args: unknown[]) => {
            console.error(message, ...args);
        }
    }
};

export class HomeHUDCurrencySharedModule implements HomeSharedRuntimeModule {

    readonly id = 'home-shared-hud-currency-module';

    private isSetup = false;
    private disposables: CompositeDisposable;
    private presenter: HomeHUDCurrencyPresenter | null = null;
    private readonly deps: Required<HomeHUDCurrencySharedModuleDeps>;

    constructor(deps: HomeHUDCurrencySharedModuleDeps = {}) {
        this.deps = {
            createPresenter: deps.createPresenter || DEFAULT_DEPS.createPresenter,
            logger: deps.logger || DEFAULT_DEPS.logger
        };
        this.disposables = new CompositeDisposable({
            logger: this.deps.logger,
            scope: 'HomeHUDCurrencySharedModule'
        });
    }

    setup(ctx: HomeSharedRuntimeContext): void {
        if (this.isSetup) {
            return;
        }

        this.presenter = this.deps.createPresenter(ctx.root);
        this.presenter.renderAll();

        this.disposables.add(ctx.onBus(SIGNAL_TYPES.CURRENCY_CHANGED, (payload: CurrencyChangedPayload | undefined) => {
            this.handleCurrencyChanged(payload);
        }));

        this.isSetup = true;
    }

    teardown(): void {
        if (!this.isSetup) {
            return;
        }

        this.disposables.disposeAll();
        this.presenter = null;
        this.disposables = new CompositeDisposable({
            logger: this.deps.logger,
            scope: 'HomeHUDCurrencySharedModule'
        });
        this.isSetup = false;
    }

    private handleCurrencyChanged(payload?: CurrencyChangedPayload): void {
        if (!this.presenter) {
            return;
        }

        const type = payload?.type;
        if (type === CurrencyType.Gold || type === CurrencyType.Gem || type === CurrencyType.Stamina) {
            this.presenter.renderOne(type);
            return;
        }

        this.presenter.renderAll();
    }
}

export function createHomeHUDCurrencySharedModule(
    deps: HomeHUDCurrencySharedModuleDeps = {}
): HomeSharedRuntimeModule {
    return new HomeHUDCurrencySharedModule(deps);
}
