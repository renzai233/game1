import { SIGNAL_TYPES } from "db://assets/utils/signal/ISignal";
import { popupManager } from "../../ui/popup/PopupManager";
import { UIManager } from "db://assets/utils/ui/UIManager";
import { UIGroup } from "db://assets/utils/ui/UIBase";
import { Dispose, HomeRuntimeContext, IHomeRuntimeModule } from "../runtime/contracts";


export interface IRewardItem {
    type: any;
    amount: number;
    heroId?: number;
}

export interface IRewardReceivedPayload {
    items: IRewardItem[];
    reason?: string;
    source?: string;
}

class HomeRewardPopupModule implements IHomeRuntimeModule {
    private static _instance: HomeRewardPopupModule;
    public readonly id = 'home-reward-popup-module';
    private _isInitialized = false;
    private _disposeRewardListener: Dispose | null = null;

    public static getInstance(): HomeRewardPopupModule {
        if (!this._instance) this._instance = new HomeRewardPopupModule();
        return this._instance;
    }

    public setup(ctx: HomeRuntimeContext): void {
        if (this._isInitialized) return;
        this._disposeRewardListener = ctx.onBus(SIGNAL_TYPES.REWARD_RECEIVED, this.onRewardReceived);
        this._isInitialized = true;
    }

    public teardown(): void {
        if (!this._isInitialized) return;
        this._disposeRewardListener?.();
        this._disposeRewardListener = null;
        this._isInitialized = false;
    }

    private onRewardReceived = (payload: IRewardReceivedPayload): void => {
        if (!payload || !payload.items || payload.items.length === 0) return;

        popupManager.addPopup('reward', () => {
            UIManager.instance.openUI(
                'ui/popup/reward_received/RewardReceivedPanel',
                payload,
                false,
                UIGroup.Popup,
                'prefabs'
            ).catch((error) => {
                console.error('[HomeRewardPopupModule] openUI failed:', error);
                popupManager.closeCurrentPopup();
            });
        });
    };
}

export const homeRewardPopupModule = HomeRewardPopupModule.getInstance();
