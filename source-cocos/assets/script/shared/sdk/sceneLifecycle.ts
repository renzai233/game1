import { EDM } from '../../../utils/data/env/ConfigManager';
import type { CapabilityResult } from '../../../mini-game-sdk/src';
import { ACQUISITION_REPORT_SCENE_ID } from './config';
import { getLaunchContext } from './launchContext';
import { getGameSdkPlatform } from './runtime';

let acquisitionSceneReported = false;

function failureReason(result: CapabilityResult<unknown>): string {
    if (result.ok === true) return '';
    return result.message || result.reason;
}

export function notifySceneReady(sceneName: string): void {
    void reportAcquisitionSceneReady(sceneName);
}

export async function reportAcquisitionSceneReady(sceneName: string): Promise<void> {
    if (sceneName !== 'Home' && sceneName !== 'Game') return;
    if (acquisitionSceneReported) return;
    if (!getLaunchContext()?.isCustomerAcq) return;

    acquisitionSceneReported = true;
    const result = await getGameSdkPlatform().retention.reportScene({
        sceneId: ACQUISITION_REPORT_SCENE_ID,
    });

    if (!result.ok && EDM.isDev()) {
        console.warn('[shared/sdk] reportScene failed:', failureReason(result));
    }
}
