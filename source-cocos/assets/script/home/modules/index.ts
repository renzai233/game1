import { homeClaimStatusModule } from '../claim-status/HomeClaimStatusModule';
import { IHomeRuntimeModule } from '../runtime/contracts';
import { homeHUDCurrencyModule } from './HomeHUDCurrencyModule';
import { homeRewardPopupModule } from './HomeRewardPopupModule';

// Home 页面运行时模块注册表：后续新增监听/订阅模块统一在这里接入。
export const HOME_RUNTIME_MODULES: IHomeRuntimeModule[] = [
    homeClaimStatusModule,
    homeHUDCurrencyModule,
    homeRewardPopupModule
];
