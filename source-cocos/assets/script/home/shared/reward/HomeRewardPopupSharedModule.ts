import { CompositeDisposable } from 'db://assets/shared/ui-runtime/core';
import type { RuntimeLogger } from 'db://assets/shared/ui-runtime/core';
import { UIGroup } from 'db://assets/utils/ui/UIBase';
import { UIManager } from 'db://assets/utils/ui/UIManager';
import { SIGNAL_TYPES } from 'db://assets/utils/signal/ISignal';
import { popupManager } from 'db://assets/script/ui/popup/PopupManager';
import type { HomeSharedRuntimeContext, HomeSharedRuntimeModule } from '../composition/homeSharedModules';
import type { RewardPopupPayload } from './types';

export type { RewardPopupItem, RewardPopupPayload } from './types';

export interface HomeRewardPopupSharedModuleDeps {
    openRewardPopup?: (payload: RewardPopupPayload) => void;
    logger?: RuntimeLogger;
}

function createDefaultOpenRewardPopup(logger: RuntimeLogger): (payload: RewardPopupPayload) => void {
    return (payload: RewardPopupPayload) => {
        popupManager.addPopup('reward', () => {
            UIManager.instance.openUI(
                'ui/popup/reward_received/RewardReceivedPanel',
                payload,
                false,
                UIGroup.Popup,
                'prefabs'
            ).catch((error) => {
                logger.error?.('[HomeRewardPopupSharedModule] openUI failed:', error);
                popupManager.closeCurrentPopup();
            });
        });
    };
}

const DEFAULT_DEPS: Required<HomeRewardPopupSharedModuleDeps> = {
    openRewardPopup: () => undefined,
    logger: {
        error: (message: string, ...args: unknown[]) => {
            console.error(message, ...args);
        }
    }
};

export class HomeRewardPopupSharedModule implements HomeSharedRuntimeModule {

    readonly id = 'home-shared-reward-popup-module';

    private isSetup = false;
    private disposables: CompositeDisposable;
    private readonly deps: Required<HomeRewardPopupSharedModuleDeps>;

    constructor(deps: HomeRewardPopupSharedModuleDeps = {}) {
        const logger = deps.logger || DEFAULT_DEPS.logger;
        this.deps = {
            logger,
            openRewardPopup: deps.openRewardPopup || createDefaultOpenRewardPopup(logger)
        };
        this.disposables = new CompositeDisposable({
            logger: this.deps.logger,
            scope: 'HomeRewardPopupSharedModule'
        });
    }

    setup(ctx: HomeSharedRuntimeContext): void {
        if (this.isSetup) {
            return;
        }

        this.disposables.add(ctx.onBus(SIGNAL_TYPES.REWARD_RECEIVED, (payload: RewardPopupPayload) => {
            this.onRewardReceived(payload);
        }));

        this.isSetup = true;
    }

    teardown(): void {
        if (!this.isSetup) {
            return;
        }

        this.disposables.disposeAll();
        this.disposables = new CompositeDisposable({
            logger: this.deps.logger,
            scope: 'HomeRewardPopupSharedModule'
        });
        this.isSetup = false;
    }

    private onRewardReceived(payload: RewardPopupPayload): void {
        if (!payload || !payload.items || payload.items.length === 0) {
            return;
        }

        this.deps.openRewardPopup(payload);
    }
}

export function createHomeRewardPopupSharedModule(
    deps: HomeRewardPopupSharedModuleDeps = {}
): HomeSharedRuntimeModule {
    return new HomeRewardPopupSharedModule(deps);
}
