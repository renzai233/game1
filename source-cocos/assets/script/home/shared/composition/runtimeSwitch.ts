export enum HomeRuntimeMode {
    Legacy = 'legacy',
    Shared = 'shared'
}

const STORAGE_KEY = 'home_runtime_mode';

/**
 * PR1 baseline: keep legacy runtime behavior by default.
 * Later PRs can wire Shared mode without replacing legacy code first.
 */
export const HOME_RUNTIME_MODE: HomeRuntimeMode = HomeRuntimeMode.Shared;

export function getHomeRuntimeMode(): HomeRuntimeMode {
    try {
        const mode = localStorage.getItem(STORAGE_KEY);
        if (mode === HomeRuntimeMode.Shared || mode === HomeRuntimeMode.Legacy) {
            return mode;
        }
    } catch (error) {
        console.warn('[runtimeSwitch] read mode failed, fallback to default', error);
    }

    return HOME_RUNTIME_MODE;
}

export function isHomeSharedRuntimeEnabled(): boolean {
    return getHomeRuntimeMode() === HomeRuntimeMode.Shared;
}

export function setHomeRuntimeMode(mode: HomeRuntimeMode): void {
    try {
        localStorage.setItem(STORAGE_KEY, mode);
    } catch (error) {
        console.warn('[runtimeSwitch] save mode failed:', error);
    }
}
