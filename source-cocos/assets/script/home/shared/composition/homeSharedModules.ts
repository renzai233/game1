import { Node } from 'cc';
import { RuntimeContext, RuntimeModule } from 'db://assets/shared/ui-runtime/core';
import { createHomeClaimStatusSharedModule } from '../claim-status';
import type { HomeClaimStatusSharedModuleDeps } from '../claim-status';
import { createHomeHUDCurrencySharedModule } from '../hud';
import type { HomeHUDCurrencySharedModuleDeps } from '../hud';
import { createHomeRewardPopupSharedModule } from '../reward';
import type { HomeRewardPopupSharedModuleDeps } from '../reward';
import { HomeBusEventMap, HomeUIEventMap } from './eventMaps';

export type HomeSharedRuntimeContext = RuntimeContext<Node, HomeBusEventMap, HomeUIEventMap>;
export type HomeSharedRuntimeModule = RuntimeModule<HomeSharedRuntimeContext>;

export interface HomeSharedRuntimeModuleDeps {
    claimStatus?: HomeClaimStatusSharedModuleDeps;
    hud?: HomeHUDCurrencySharedModuleDeps;
    reward?: HomeRewardPopupSharedModuleDeps;
}

/**
 * Create isolated module instances for each runtime mount.
 * PR8 removes singleton modules to avoid hidden cross-runtime shared state.
 */
export function createHomeSharedRuntimeModules(
    deps: HomeSharedRuntimeModuleDeps = {}
): HomeSharedRuntimeModule[] {
    return [
        createHomeClaimStatusSharedModule(deps.claimStatus),
        createHomeHUDCurrencySharedModule(deps.hud),
        createHomeRewardPopupSharedModule(deps.reward)
    ];
}
