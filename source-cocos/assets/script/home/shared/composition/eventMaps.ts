import { SIGNAL_TYPES } from 'db://assets/utils/signal/ISignal';
import type { CurrencyChangedPayload } from '../hud/types';
import type { RewardPopupPayload } from '../reward/types';

/**
 * Home shared runtime bus event contract.
 * Keep this map as the single source of truth for Home runtime module wiring.
 */
export type HomeBusEventMap = {
    [SIGNAL_TYPES.CURRENCY_CHANGED]: CurrencyChangedPayload | undefined;
    [SIGNAL_TYPES.REWARD_RECEIVED]: RewardPopupPayload;
    [SIGNAL_TYPES.DAILY_TASK_STATE_CHANGED]: void;
    [SIGNAL_TYPES.SIGN_IN_TASK_STATE_CHANGED]: void;
    [SIGNAL_TYPES.OFFLINE_REWARD_STATE_CHANGED]: void;
};

/**
 * Home shared runtime UI event contract.
 * Currently no UI-bus events are consumed by shared modules.
 */
export type HomeUIEventMap = Record<never, never>;
