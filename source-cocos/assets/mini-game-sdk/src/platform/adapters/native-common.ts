import type { Clock, PlatformTarget, RewardedVideoPlacementConfig, PlatformShareConfig } from "../../core";
import { capabilityFailure, capabilitySuccess } from "../capabilities";
import { normalizeLaunchOptions, parseSidebarLaunch } from "../launch-options";
import {
  awaitMaybe,
  callNativeWithCallbacks,
  defineNativePlacementProperty,
  defineNativeShareTemplateProperty,
  getBoolean,
  getFunction,
  getNumber,
  getRecord,
  getString,
  isRecord,
  isNativeTimeoutFailure,
  mapNativeFailure,
  nativeTimeoutFailure,
  noopUnsubscribe,
  serializeQuery,
} from "../native";
import type { CallbackFailure } from "../native";
import type {
  CapabilityResult,
  PlatformAds,
  PlatformAudio,
  PlatformAuth,
  PlatformHaptics,
  PlatformInnerAudioContext,
  PlatformLaunchOptions,
  PlatformLifecycle,
  PlatformLoginCode,
  PlatformLoginCodeOptions,
  PlatformRetention,
  PlatformShare,
  PlatformShareOptions,
  PlatformShareResult,
  PlatformShortcut,
  PlatformShortcutStatus,
  PlatformUnsubscribe,
  PlatformVibrationKind,
  RewardedVideoOptions,
  RewardedVideoResult,
  SidebarCapabilitySnapshot,
} from "../types";

const DEFAULT_NATIVE_CALL_TIMEOUT_MS = 10000;
const DEFAULT_REWARDED_VIDEO_TIMEOUT_MS = 60000;

export interface NativeLifecycleRuntime {
  readonly getLaunchOptionsSync?: () => unknown;
  readonly onShow?: (listener: (options?: unknown) => void) => void;
  readonly offShow?: (listener: (options?: unknown) => void) => void;
  readonly onHide?: (listener: () => void) => void;
  readonly offHide?: (listener: () => void) => void;
}

export interface NativeLoginRuntime {
  readonly login?: (options?: Record<string, unknown>) => unknown;
}

export interface NativeRewardedRuntime {
  readonly createRewardedVideoAd?: (options: Record<string, unknown>) => NativeRewardedAd;
}

export interface NativeAudioRuntime {
  readonly createInnerAudioContext?: (options?: Record<string, unknown>) => PlatformInnerAudioContext;
}

export interface NativeHapticsRuntime {
  readonly vibrateShort?: (options?: Record<string, unknown>) => unknown;
  readonly vibrateLong?: (options?: Record<string, unknown>) => unknown;
}

export interface NativeRewardedAd {
  readonly load?: () => unknown;
  readonly show?: () => unknown;
  readonly destroy?: () => void;
  readonly onClose?: (listener: (result?: unknown) => void) => void;
  readonly offClose?: (listener: (result?: unknown) => void) => void;
  readonly onError?: (listener: (error?: unknown) => void) => void;
  readonly offError?: (listener: (error?: unknown) => void) => void;
}

interface RetainedRewardedAdState {
  activeErrorHandler?: ((error?: unknown) => void) | undefined;
  readonly errorHandler: (error?: unknown) => void;
}

const retainedRewardedAdStates = new WeakMap<NativeRewardedAd, RetainedRewardedAdState>();

export interface NativeShareRuntime {
  readonly shareAppMessage?: (options?: Record<string, unknown>) => unknown;
}

export interface NativeShortcutRuntime {
  readonly addShortcut?: (options?: Record<string, unknown>) => unknown;
  readonly checkShortcut?: (options?: Record<string, unknown>) => unknown;
}

export interface NativeRetentionRuntime {
  readonly checkScene?: (options?: Record<string, unknown>) => unknown;
  readonly navigateToScene?: (options?: Record<string, unknown>) => unknown;
  readonly showRevisitGuide?: (options?: Record<string, unknown>) => unknown;
  readonly reportScene?: (options?: Record<string, unknown>) => unknown;
}

export interface LoginOptions {
  readonly target: PlatformTarget;
  readonly runtime: unknown;
  readonly clock: Clock;
  readonly timeoutMs?: number | undefined;
  readonly passForce: boolean;
}

export interface RewardedOptions {
  readonly target: PlatformTarget;
  readonly runtime: unknown;
  readonly placements?: RewardedVideoPlacementConfig | undefined;
  readonly state: { busy: boolean };
  readonly adCache?: Map<string, NativeRewardedAd> | undefined;
  readonly timeoutMs?: number | undefined;
  readonly multiton?: boolean | undefined;
  readonly disableFallbackSharePage?: boolean | undefined;
  readonly showFirst?: boolean | undefined;
  readonly retainAdInstance?: boolean | undefined;
  readonly lifecycle?: RewardedVideoLifecycleHooks | undefined;
}

export interface RewardedVideoLifecycleHooks {
  onStarted(input: RewardedVideoOptions): void;
  onEnded(input: RewardedVideoOptions, result: CapabilityResult<RewardedVideoResult>): void;
}

export interface NativeAudioOptions {
  readonly runtime: unknown;
  readonly preferWebAudioForShortSfx?: boolean | undefined;
}

export interface ShareOptions {
  readonly runtime: unknown;
  readonly defaults?: PlatformShareConfig | undefined;
  readonly supportsDirectFriend: boolean;
  readonly timeoutMs?: number | undefined;
}

export interface ShortcutOptions {
  readonly runtime: unknown;
  readonly unsupported?: boolean;
  readonly timeoutMs?: number | undefined;
}

export interface RetentionOptions {
  readonly runtime: unknown;
  readonly reportSceneId?: number | undefined;
  readonly unsupported?: boolean;
  readonly timeoutMs?: number | undefined;
}

export function createNativeLifecycle(
  target: PlatformTarget,
  runtime: unknown,
): PlatformLifecycle {
  const lifecycleRuntime = isRecord(runtime) ? (runtime as NativeLifecycleRuntime) : undefined;

  return {
    getLaunchOptions: () => {
      if (typeof lifecycleRuntime?.getLaunchOptionsSync !== "function") {
        return capabilityFailure("unavailable", "Launch options are unavailable.");
      }

      try {
        const raw = lifecycleRuntime.getLaunchOptionsSync();
        return capabilitySuccess(normalizeLaunchOptions(raw, { target }));
      } catch (error) {
        return capabilityFailure("native_failed", "Failed to read launch options.", { raw: error });
      }
    },
    onShow: (listener) => {
      if (typeof lifecycleRuntime?.onShow !== "function") {
        return noopUnsubscribe;
      }

      const nativeListener = (options?: unknown): void => {
        listener(normalizeLaunchOptions(options, { target }));
      };

      lifecycleRuntime.onShow(nativeListener);
      return createNativeUnsubscribe(() => lifecycleRuntime.offShow?.(nativeListener));
    },
    onHide: (listener) => {
      if (typeof lifecycleRuntime?.onHide !== "function") {
        return noopUnsubscribe;
      }

      lifecycleRuntime.onHide(listener);
      return createNativeUnsubscribe(() => lifecycleRuntime.offHide?.(listener));
    },
  };
}

export function createNativeAuth(options: LoginOptions): PlatformAuth {
  return {
    getLoginCode: async (input) => {
      const runtime = isRecord(options.runtime) ? (options.runtime as NativeLoginRuntime) : undefined;
      if (typeof runtime?.login !== "function") {
        return capabilityFailure("unavailable", "Platform login code is unavailable.");
      }

      const timeoutMs = input?.timeoutMs ?? options.timeoutMs ?? DEFAULT_NATIVE_CALL_TIMEOUT_MS;
      const payload: Record<string, unknown> = {};
      if (options.passForce) {
        payload["force"] = input?.force ?? false;
      }

      const outcome = await callNativeWithCallbacks(runtime.login, payload, { timeoutMs });
      if (!outcome.ok) {
        return capabilityFailureFromCallback(outcome as CallbackFailure);
      }

      const code = getString(outcome.value, "code");
      if (code === undefined || code.length === 0) {
        return capabilityFailure("invalid_response", "Platform login response did not include a code.", {
          raw: outcome.value,
        });
      }

      const issuedAtMs = options.clock.now();
      const expiresIn = getNumber(outcome.value, "expiresIn");
      const expiresAtMs = expiresIn === undefined ? undefined : issuedAtMs + expiresIn * 1000;
      const isLogin = getBoolean(outcome.value, "isLogin");

      const value: PlatformLoginCode = {
        platform: options.target,
        code,
        issuedAtMs,
        raw: outcome.value,
        ...(isLogin === undefined ? {} : { isLogin }),
        ...(expiresAtMs === undefined ? {} : { expiresAtMs }),
      };

      return capabilitySuccess(value);
    },
  };
}

export function createNativeAds(options: RewardedOptions): PlatformAds {
  return {
    showRewardedVideo: async (input) => showNativeRewardedVideo(options, input),
  };
}

export function destroyNativeRewardedAds(cache: Map<string, NativeRewardedAd>): void {
  for (const ad of cache.values()) {
    destroyRetainedRewardedAd(ad);
  }
  cache.clear();
}

export function createNativeAudio(options: NativeAudioOptions): PlatformAudio {
  return {
    preferWebAudioForShortSfx: options.preferWebAudioForShortSfx ?? false,
    supportsInnerAudioContext: () =>
      getFunction<(input?: Record<string, unknown>) => PlatformInnerAudioContext>(
        options.runtime,
        "createInnerAudioContext",
      ) !== undefined,
    createInnerAudioContext: (input) => {
      const createInnerAudioContext = getFunction<
        (input?: Record<string, unknown>) => PlatformInnerAudioContext
      >(options.runtime, "createInnerAudioContext");
      if (createInnerAudioContext === undefined) {
        return null;
      }

      const payload =
        input?.useWebAudioImplement === undefined
          ? undefined
          : { useWebAudioImplement: input.useWebAudioImplement };
      try {
        return createInnerAudioContext(payload);
      } catch {
        return null;
      }
    },
  };
}

export function createNativeHaptics(runtime: unknown): PlatformHaptics {
  return {
    vibrate: async (kind) => vibrateNative(runtime, kind),
  };
}

export function createNativeShare(options: ShareOptions): PlatformShare {
  return {
    shareAppMessage: async (input) => shareAppMessage(options, input),
    shareToFriend: async (input) => {
      if (!options.supportsDirectFriend) {
        return capabilityFailure("unsupported", "Direct friend share is unsupported.");
      }

      return shareAppMessage(options, input);
    },
    showShareMenu: async () => capabilityFailure("unsupported", "Share menu is unsupported."),
    hideShareMenu: async () => capabilityFailure("unsupported", "Share menu is unsupported."),
    updateShareMenu: async () => capabilityFailure("unsupported", "Share menu is unsupported."),
    setShareAppMessageHandler: () => noopUnsubscribe,
  };
}

export function createNativeShortcut(options: ShortcutOptions): PlatformShortcut {
  return {
    addShortcut: async () => addShortcut(options),
    checkShortcut: async () => checkShortcut(options),
  };
}

export function createNativeRetention(options: RetentionOptions): PlatformRetention {
  return {
    getSidebarCapability: () => sidebarCapability(options),
    parseSidebarLaunch: (launchOptions) => parseSidebarLaunch(launchOptions),
    checkSidebar: async () => {
      if (options.unsupported === true) {
        return capabilityFailure("unsupported", "Sidebar retention is unsupported.");
      }

      const checkScene = getFunction<(options?: Record<string, unknown>) => unknown>(options.runtime, "checkScene");
      if (checkScene === undefined) {
        return capabilityFailure("unavailable", "Sidebar scene check is unavailable.");
      }

      const outcome = await callNativeWithCallbacks(checkScene, { scene: "sidebar" }, nativeCallOptions(options));
      if (!outcome.ok) {
        return capabilityFailureFromCallback(outcome as CallbackFailure);
      }

      const available = readSceneAvailability(outcome.value);
      return capabilitySuccess({ available, raw: outcome.value });
    },
    openSidebar: async (input) => {
      if (options.unsupported === true) {
        return capabilityFailure("unsupported", "Sidebar retention is unsupported.");
      }

      const navigateToScene = getFunction<(options?: Record<string, unknown>) => unknown>(
        options.runtime,
        "navigateToScene",
      );
      if (navigateToScene === undefined) {
        return capabilityFailure("unavailable", "Opening sidebar is unavailable.");
      }

      const payload: Record<string, unknown> = { scene: "sidebar" };
      if (input?.extraData !== undefined) {
        payload["extraData"] = input.extraData;
      }

      const outcome = await callNativeWithCallbacks(navigateToScene, payload, nativeCallOptions(options));
      return outcome.ok ? capabilitySuccess(undefined) : capabilityFailureFromCallback(outcome as CallbackFailure);
    },
    showRevisitGuide: async (input) => {
      if (options.unsupported === true) {
        return capabilityFailure("unsupported", "Revisit guide is unsupported.");
      }

      const showRevisitGuide = getFunction<(options?: Record<string, unknown>) => unknown>(
        options.runtime,
        "showRevisitGuide",
      );
      if (showRevisitGuide === undefined) {
        return capabilityFailure("unavailable", "Revisit guide is unavailable.");
      }

      const payload: Record<string, unknown> = {};
      if (input?.extraData !== undefined) {
        payload["extraData"] = input.extraData;
      }

      const outcome = await callNativeWithCallbacks(showRevisitGuide, payload, nativeCallOptions(options));
      return outcome.ok ? capabilitySuccess(undefined) : capabilityFailureFromCallback(outcome as CallbackFailure);
    },
    reportScene: async (input) => {
      if (options.unsupported === true) {
        return capabilityFailure("unsupported", "Scene reporting is unsupported.");
      }

      const reportScene = getFunction<(options?: Record<string, unknown>) => unknown>(options.runtime, "reportScene");
      if (reportScene === undefined) {
        return capabilityFailure("unavailable", "Scene reporting is unavailable.");
      }

      const sceneId = input?.sceneId ?? options.reportSceneId;
      if (sceneId === undefined) {
        return capabilityFailure("not_configured", "Scene reporting requires a scene id.");
      }

      const outcome = await callNativeWithCallbacks(reportScene, { sceneId }, nativeCallOptions(options));
      return outcome.ok ? capabilitySuccess(undefined) : capabilityFailureFromCallback(outcome as CallbackFailure);
    },
  };
}

async function vibrateNative(
  runtime: unknown,
  kind: PlatformVibrationKind,
): Promise<CapabilityResult<void>> {
  const nativeRuntime = isRecord(runtime) ? (runtime as NativeHapticsRuntime) : undefined;
  const vibrate =
    kind === "short" ? nativeRuntime?.vibrateShort : nativeRuntime?.vibrateLong;
  if (typeof vibrate !== "function") {
    return capabilityFailure("unavailable", "Platform vibration is unavailable.");
  }

  const outcome = await callNativeWithCallbacks(vibrate.bind(nativeRuntime), {}, nativeCallOptions({}));
  return outcome.ok ? capabilitySuccess(undefined) : capabilityFailureFromCallback(outcome as CallbackFailure);
}

export function createNativeUnsubscribe(dispose: () => void): PlatformUnsubscribe {
  let active = true;
  return () => {
    if (!active) {
      return;
    }

    active = false;
    dispose();
  };
}

async function showNativeRewardedVideo(
  options: RewardedOptions,
  input: RewardedVideoOptions,
): Promise<CapabilityResult<RewardedVideoResult>> {
  const runtime = isRecord(options.runtime) ? (options.runtime as NativeRewardedRuntime) : undefined;
  if (typeof runtime?.createRewardedVideoAd !== "function") {
    return capabilityFailure("unavailable", "Rewarded video is unavailable.");
  }

  if (input.placementId.trim().length === 0) {
    return capabilityFailure("not_configured", "Rewarded video placement is required.");
  }

  const nativePlacement = options.placements?.placements?.[input.placementId] ?? input.placementId;
  if (nativePlacement.trim().length === 0) {
    return capabilityFailure("not_configured", "Rewarded video placement is not configured.");
  }

  if (options.state.busy) {
    return capabilityFailure("busy", "Rewarded video is already showing.");
  }

  options.state.busy = true;
  let ad: NativeRewardedAd | undefined;
  let closed = false;
  let cleanedUp = false;
  let closeHandler: ((result?: unknown) => void) | undefined;
  let errorHandler: ((error?: unknown) => void) | undefined;
  let retainedAdState: RetainedRewardedAdState | undefined;
  let lifecycleStarted = false;
  const adCacheKey = options.retainAdInstance === true
    ? createRewardedAdCacheKey(nativePlacement, options, input)
    : undefined;

  try {
    ad = getOrCreateRewardedAd(runtime, nativePlacement, options, input, adCacheKey);
    if (options.retainAdInstance === true) {
      retainedAdState = ensureRetainedRewardedAdErrorHandler(ad);
    }
    lifecycleStarted = true;
    options.lifecycle?.onStarted(input);
  } catch (error) {
    options.state.busy = false;
    return capabilityFailure("native_failed", "Failed to create rewarded video.", { raw: error });
  }

  const cleanup = (): void => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    try {
      if (closeHandler !== undefined) {
        ad?.offClose?.(closeHandler);
      }
    } catch {
      // Best-effort native listener cleanup.
    }
    try {
      if (errorHandler !== undefined) {
        if (retainedAdState !== undefined) {
          if (retainedAdState.activeErrorHandler === errorHandler) {
            retainedAdState.activeErrorHandler = undefined;
          }
        } else {
          ad?.offError?.(errorHandler);
        }
      }
    } catch {
      // Best-effort native listener cleanup.
    }
    if (options.retainAdInstance !== true) {
      try {
        ad?.destroy?.();
      } catch {
        // Best-effort native ad cleanup.
      }
    }
    options.state.busy = false;
  };

  const terminal = new Promise<CapabilityResult<RewardedVideoResult>>((resolve) => {
    closeHandler = (result?: unknown): void => {
      if (closed) {
        return;
      }

      closed = true;
      const completed = getBoolean(result, "isEnded") === true;
      const count = getNumber(result, "count");
      resolve(
        capabilitySuccess({
          completed,
          status: completed ? "completed" : "closed",
          placementId: input.placementId,
          ...(count === undefined ? {} : { count }),
          raw: result,
        }),
      );
    };

    errorHandler = (error?: unknown): void => {
      if (closed) {
        return;
      }

      closed = true;
      const mapped = mapNativeFailure(error);
      resolve(capabilityFailure("native_failed", mapped.message, { code: mapped.code, raw: mapped.raw }));
    };
  });

  try {
    if (closeHandler !== undefined) {
      ad.onClose?.(closeHandler);
    }
    if (errorHandler !== undefined) {
      if (retainedAdState !== undefined) {
        retainedAdState.activeErrorHandler = errorHandler;
      } else {
        ad.onError?.(errorHandler);
      }
    }
  } catch (error) {
    cleanup();
    return finishRewardedLifecycle(
      options,
      input,
      capabilityFailure("native_failed", "Failed to register rewarded video listeners.", { raw: error }),
      lifecycleStarted,
    );
  }

  const showReady = options.showFirst === true
    ? await showRewardedWithLoadFallback(ad, options, "initial")
    : await loadThenShowRewarded(ad, options);
  if (!showReady.ok) {
    cleanup();
    invalidateRetainedRewardedAdOnDestroyedFailure(options, adCacheKey, showReady);
    return finishRewardedLifecycle(options, input, showReady, lifecycleStarted);
  }

  const result = await withRewardedTimeout(terminal, rewardedTimeoutMs(options), () => {
    closed = true;
    cleanup();
  });
  cleanup();
  invalidateRetainedRewardedAdOnDestroyedFailure(options, adCacheKey, result);
  return finishRewardedLifecycle(options, input, result, lifecycleStarted);
}

function finishRewardedLifecycle(
  options: RewardedOptions,
  input: RewardedVideoOptions,
  result: CapabilityResult<RewardedVideoResult>,
  lifecycleStarted: boolean,
): CapabilityResult<RewardedVideoResult> {
  if (lifecycleStarted) {
    options.lifecycle?.onEnded(input, result);
  }
  return result;
}

function getOrCreateRewardedAd(
  runtime: NativeRewardedRuntime,
  nativePlacement: string,
  options: RewardedOptions,
  input: RewardedVideoOptions,
  cacheKey: string | undefined,
): NativeRewardedAd {
  const createRewardedVideoAd = runtime.createRewardedVideoAd;
  if (typeof createRewardedVideoAd !== "function") {
    throw new Error("Rewarded video is unavailable.");
  }

  if (options.retainAdInstance === true && cacheKey !== undefined) {
    const cached = options.adCache?.get(cacheKey);
    if (cached !== undefined) {
      try {
        ensureRetainedRewardedAdErrorHandler(cached);
      } catch (error) {
        evictRetainedRewardedAd(options, cacheKey);
        throw error;
      }
      return cached;
    }

    const created = createRewardedVideoAd(createRewardedVideoPayload(nativePlacement, options, input));
    try {
      ensureRetainedRewardedAdErrorHandler(created);
    } catch (error) {
      destroyRetainedRewardedAd(created);
      throw error;
    }
    options.adCache?.set(cacheKey, created);
    return created;
  }

  return createRewardedVideoAd(createRewardedVideoPayload(nativePlacement, options, input));
}

function ensureRetainedRewardedAdErrorHandler(ad: NativeRewardedAd): RetainedRewardedAdState {
  const existing = retainedRewardedAdStates.get(ad);
  if (existing !== undefined) {
    return existing;
  }

  const state: RetainedRewardedAdState = {
    errorHandler: (error?: unknown): void => {
      const current = retainedRewardedAdStates.get(ad);
      current?.activeErrorHandler?.(error);
    },
  };

  retainedRewardedAdStates.set(ad, state);
  try {
    ad.onError?.(state.errorHandler);
  } catch (error) {
    retainedRewardedAdStates.delete(ad);
    throw error;
  }

  return state;
}

function detachRetainedRewardedAdErrorHandler(ad: NativeRewardedAd): void {
  const state = retainedRewardedAdStates.get(ad);
  if (state === undefined) {
    return;
  }

  state.activeErrorHandler = undefined;
  try {
    ad.offError?.(state.errorHandler);
  } catch {
    // Best-effort native listener cleanup.
  }
  retainedRewardedAdStates.delete(ad);
}

function destroyRetainedRewardedAd(ad: NativeRewardedAd): void {
  detachRetainedRewardedAdErrorHandler(ad);
  try {
    ad.destroy?.();
  } catch {
    // Best-effort native ad cleanup.
  }
}

function createRewardedAdCacheKey(
  nativePlacement: string,
  options: RewardedOptions,
  input: RewardedVideoOptions,
): string {
  const multiton = input.multiton ?? options.multiton;
  const disableFallbackSharePage = input.disableFallbackSharePage ?? options.disableFallbackSharePage;
  return JSON.stringify({
    nativePlacement,
    ...(multiton === undefined ? {} : { multiton }),
    ...(disableFallbackSharePage === undefined ? {} : { disableFallbackSharePage }),
  });
}

function invalidateRetainedRewardedAdOnDestroyedFailure(
  options: RewardedOptions,
  cacheKey: string | undefined,
  result: CapabilityResult<unknown>,
): void {
  if (cacheKey === undefined || result.ok || !isDestroyedRewardedAdFailure(result)) {
    return;
  }

  evictRetainedRewardedAd(options, cacheKey);
}

function evictRetainedRewardedAd(options: RewardedOptions, cacheKey: string): void {
  const ad = options.adCache?.get(cacheKey);
  if (ad === undefined) {
    return;
  }

  options.adCache?.delete(cacheKey);
  destroyRetainedRewardedAd(ad);
}

function isDestroyedRewardedAdFailure(
  result: Exclude<CapabilityResult<unknown>, { readonly ok: true }>,
): boolean {
  const message = `${result.message ?? ""}`.toLowerCase();
  return message.includes("destroy");
}

async function loadThenShowRewarded(
  ad: NativeRewardedAd,
  options: RewardedOptions,
): Promise<CapabilityResult<void>> {
  const loaded = await loadRewardedAd(ad, options);
  if (!loaded.ok) {
    return loaded;
  }
  return showRewardedAd(ad, options);
}

async function showRewardedWithLoadFallback(
  ad: NativeRewardedAd,
  options: RewardedOptions,
  phase: "initial" | "after_load",
): Promise<CapabilityResult<void>> {
  const shown = await showRewardedAd(ad, options, phase);
  if (shown.ok) {
    return shown;
  }

  const loaded = await loadRewardedAd(ad, options);
  if (!loaded.ok) {
    return loaded;
  }
  return showRewardedAd(ad, options, "after_load");
}

async function loadRewardedAd(
  ad: NativeRewardedAd,
  options: RewardedOptions,
): Promise<CapabilityResult<void>> {
  try {
    await awaitMaybe(ad.load?.(), rewardedTimeoutMs(options));
    return capabilitySuccess(undefined);
  } catch (error) {
    return rewardedNativeFailure("load", error);
  }
}

async function showRewardedAd(
  ad: NativeRewardedAd,
  options: RewardedOptions,
  phase?: "initial" | "after_load",
): Promise<CapabilityResult<void>> {
  try {
    await awaitMaybe(ad.show?.(), rewardedTimeoutMs(options));
    return capabilitySuccess(undefined);
  } catch (error) {
    return rewardedNativeFailure("show", error, phase);
  }
}

function rewardedNativeFailure(
  action: "load" | "show",
  error: unknown,
  phase?: "initial" | "after_load",
): CapabilityResult<void> {
  if (isNativeTimeoutFailure(error)) {
    return capabilityFailure(error.reason, error.message, { raw: error });
  }

  const mapped = mapNativeFailure(error);
  const defaultMessage = action === "load" ? "Failed to load rewarded video." : "Failed to show rewarded video.";
  return capabilityFailure(mapped.reason, mapped.message || defaultMessage, {
    code: mapped.code,
    raw: phase === undefined ? mapped.raw : { phase, error: mapped.raw },
  });
}

function createRewardedVideoPayload(
  nativePlacement: string,
  options: RewardedOptions,
  input: RewardedVideoOptions,
): Record<string, unknown> {
  const multiton = input.multiton ?? options.multiton;
  const disableFallbackSharePage = input.disableFallbackSharePage ?? options.disableFallbackSharePage;

  return {
    ...defineNativePlacementProperty(nativePlacement),
    ...(multiton === undefined ? {} : { multiton }),
    ...(disableFallbackSharePage === undefined ? {} : { disableFallbackSharePage }),
  };
}

async function shareAppMessage(
  options: ShareOptions,
  input: PlatformShareOptions | undefined,
): Promise<CapabilityResult<PlatformShareResult>> {
  const share = getFunction<(options?: Record<string, unknown>) => unknown>(options.runtime, "shareAppMessage");
  if (share === undefined) {
    return capabilityFailure("unavailable", "Platform share is unavailable.");
  }

  const channel = input?.channel ?? options.defaults?.defaultChannel;
  const shareTemplate = input?.shareTemplate ?? options.defaults?.defaultShareTemplate;
  const payload: Record<string, unknown> = {
    ...(input?.title === undefined ? {} : { title: input.title }),
    ...(input?.desc === undefined ? {} : { desc: input.desc }),
    ...(input?.imageUrl === undefined ? {} : { imageUrl: input.imageUrl }),
    ...(channel === undefined ? {} : { channel }),
    ...(input?.toUser === undefined ? {} : { toUser: input.toUser }),
    ...(input?.extra === undefined ? {} : { extra: input.extra }),
    ...defineNativeShareTemplateProperty(shareTemplate),
  };
  const query = serializeQuery(input?.query);
  if (query !== undefined) {
    payload["query"] = query;
  }

  const outcome = await callNativeWithCallbacks(share, payload, nativeCallOptions(options));
  return outcome.ok
    ? capabilitySuccess({ completed: true, ...(channel === undefined ? {} : { channel }), raw: outcome.value })
    : capabilityFailureFromCallback(outcome as CallbackFailure);
}

async function addShortcut(options: ShortcutOptions): Promise<CapabilityResult<void>> {
  if (options.unsupported === true) {
    return capabilityFailure("unsupported", "Shortcut add is unsupported.");
  }

  const addShortcutFn = getFunction<(options?: Record<string, unknown>) => unknown>(options.runtime, "addShortcut");
  if (addShortcutFn === undefined) {
    return capabilityFailure("unavailable", "Shortcut add is unavailable.");
  }

  const outcome = await callNativeWithCallbacks(addShortcutFn, {}, nativeCallOptions(options));
  return outcome.ok ? capabilitySuccess(undefined) : capabilityFailureFromCallback(outcome as CallbackFailure);
}

async function checkShortcut(options: ShortcutOptions): Promise<CapabilityResult<PlatformShortcutStatus>> {
  if (options.unsupported === true) {
    return capabilityFailure("unsupported", "Shortcut check is unsupported.");
  }

  const checkShortcutFn = getFunction<(options?: Record<string, unknown>) => unknown>(
    options.runtime,
    "checkShortcut",
  );
  if (checkShortcutFn === undefined) {
    return capabilityFailure("unavailable", "Shortcut check is unavailable.");
  }

  const outcome = await callNativeWithCallbacks(checkShortcutFn, {}, nativeCallOptions(options));
  if (!outcome.ok) {
    return capabilityFailureFromCallback(outcome as CallbackFailure);
  }

  const added = readShortcutAdded(outcome.value);
  if (added === undefined) {
    return capabilityFailure("invalid_response", "Shortcut check did not return an added flag.", {
      raw: outcome.value,
    });
  }

  return capabilitySuccess({ added, raw: outcome.value });
}

function sidebarCapability(options: RetentionOptions): CapabilityResult<SidebarCapabilitySnapshot> {
  if (options.unsupported === true) {
    return capabilityFailure("unsupported", "Sidebar retention is unsupported.");
  }

  const canCheckScene = getFunction(options.runtime, "checkScene") !== undefined;
  const canOpenSidebar = getFunction(options.runtime, "navigateToScene") !== undefined;
  const canShowRevisitGuide = getFunction(options.runtime, "showRevisitGuide") !== undefined;

  return capabilitySuccess({
    supportedHost: canCheckScene || canOpenSidebar || canShowRevisitGuide,
    sceneAvailable: canCheckScene ? "unknown" : false,
    canCheckScene,
    canOpenSidebar,
    canShowRevisitGuide,
  });
}

function readSceneAvailability(value: unknown): boolean | "unknown" {
  if (!isRecord(value)) {
    return "unknown";
  }

  const data = getRecord(value, "data");
  const available =
    getBoolean(value, "isExist") ??
    getBoolean(value, "exist") ??
    getBoolean(value, "available") ??
    getBoolean(data, "isExist") ??
    getBoolean(data, "exist") ??
    getBoolean(data, "available");

  return available ?? "unknown";
}

function readShortcutAdded(value: unknown): boolean | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const data = getRecord(value, "data");
  return (
    getBoolean(value, "added") ??
    getBoolean(value, "isAdded") ??
    getBoolean(value, "exist") ??
    getBoolean(value, "isExist") ??
    getBoolean(data, "added") ??
    getBoolean(data, "isAdded") ??
    getBoolean(data, "exist") ??
    getBoolean(data, "isExist")
  );
}

function capabilityFailureFromCallback<TValue>(outcome: CallbackFailure): CapabilityResult<TValue> {
  return capabilityFailure(outcome.reason, outcome.message, { code: outcome.code, raw: outcome.raw });
}

function nativeCallOptions(options: { readonly timeoutMs?: number | undefined }): { readonly timeoutMs: number } {
  return { timeoutMs: options.timeoutMs ?? DEFAULT_NATIVE_CALL_TIMEOUT_MS };
}

function rewardedTimeoutMs(options: RewardedOptions): number {
  return options.timeoutMs ?? DEFAULT_REWARDED_VIDEO_TIMEOUT_MS;
}

async function withRewardedTimeout(
  promise: Promise<CapabilityResult<RewardedVideoResult>>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<CapabilityResult<RewardedVideoResult>> {
  if (timeoutMs <= 0) {
    return promise;
  }

  return new Promise<CapabilityResult<RewardedVideoResult>>((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      onTimeout();
      const failure: CallbackFailure = nativeTimeoutFailure();
      resolve(capabilityFailure(failure.reason, failure.message));
    }, timeoutMs);

    void promise.then((value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    });
  });
}
