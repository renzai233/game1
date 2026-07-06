export {
    ACQUISITION_REPORT_SCENE_ID,
    DEFAULT_REWARDED_PLACEMENT,
    HAPPY_SDK_GAME_ID,
    createHappySdkConfig,
    resolvePlatformRuntime,
    resolvePlatformTarget,
    resolveSdkEnvironment,
} from './config';
export {
    GameSdkRuntime,
    gameSdkRuntime,
    ensureGameSdk,
    getGameSdk,
    getGameSdkPlatform,
    getPlatformTarget,
    requireGameSdk,
    startGameSdk,
    type GameSdkRuntimeSnapshot,
    type GameSdkRuntimeStatus,
} from './runtime';
export {
    captureLaunchContext,
    createLaunchContext,
    getLaunchContext,
    getLaunchOptions,
    setLaunchContext,
    type LaunchContext,
    type LaunchEntryType,
} from './launchContext';
export {
    notifySceneReady,
    reportAcquisitionSceneReady,
} from './sceneLifecycle';
export {
    addShortcut,
    canAddShortcut,
    canShareAppMessage,
    canShowDouyinSidebarEntry,
    canShowRewardedVideo,
    checkShortcut,
    checkSidebar,
    getPlatformLaunchOptions,
    onPlatformShow,
    openSidebar,
    parseSidebarLaunch,
    shareAppMessage,
    showRewardedVideo,
} from './platformActions';
