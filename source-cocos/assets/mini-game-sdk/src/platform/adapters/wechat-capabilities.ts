import type { WechatOpenPageConfig, WechatShareConfig } from "../../core";
import { capabilityFailure, capabilitySuccess } from "../capabilities";
import {
  callNativeWithCallbacks,
  getFunction,
  getNativeCode,
  getNativeMessage,
  getString,
  isRecord,
  mapNativeFailure,
  noopUnsubscribe,
  serializeQuery,
} from "../native";
import type { CallbackFailure } from "../native";
import type {
  CapabilityResult,
  PlatformEngagement,
  PlatformGameClubButtonOptions,
  PlatformGameClubEncryptedData,
  PlatformNativeButtonHandle,
  PlatformOpenPageOptions,
  PlatformOpenPageResult,
  PlatformShare,
  PlatformShareHandler,
  PlatformShareOptions,
  PlatformShareResult,
  PlatformUnsubscribe,
} from "../types";

const DEFAULT_WECHAT_CALL_TIMEOUT_MS = 10000;

interface WechatShareRuntime {
  readonly shareAppMessage?: (options?: Record<string, unknown>) => unknown;
  readonly showShareMenu?: (options?: Record<string, unknown>) => unknown;
  readonly hideShareMenu?: (options?: Record<string, unknown>) => unknown;
  readonly updateShareMenu?: (options?: Record<string, unknown>) => unknown;
  readonly onShareAppMessage?: (listener: (result: Record<string, unknown>) => unknown) => void;
  readonly offShareAppMessage?: (listener?: (result: Record<string, unknown>) => unknown) => void;
}

export interface WechatPageManager {
  readonly load?: (options: Record<string, unknown>) => PromiseLike<unknown>;
  readonly show?: (options?: Record<string, unknown>) => PromiseLike<unknown>;
  readonly destroy?: () => void;
}

interface WechatEngagementRuntime {
  readonly createPageManager?: () => WechatPageManager;
  readonly createGameClubButton?: (options: Record<string, unknown>) => WechatGameClubButton;
  readonly getGameClubData?: (options?: Record<string, unknown>) => unknown;
}

export interface WechatGameClubButton {
  readonly show?: () => void;
  readonly hide?: () => void;
  readonly destroy?: () => void;
  readonly onTap?: (listener: (result?: unknown) => void) => void;
  readonly offTap?: (listener?: (result?: unknown) => void) => void;
}

export interface WechatShareOptions {
  readonly runtime: unknown;
  readonly defaults?: WechatShareConfig | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface WechatEngagementOptions {
  readonly runtime: unknown;
  readonly openPage?: WechatOpenPageConfig | undefined;
  readonly timeoutMs?: number | undefined;
  readonly pageManagers: Set<WechatPageManager>;
  readonly buttonHandles: Set<WechatGameClubButton>;
}

export function createWechatShare(options: WechatShareOptions): PlatformShare {
  return {
    shareAppMessage: async (input) => shareAppMessage(options, input),
    shareToFriend: async () =>
      capabilityFailure<PlatformShareResult>("unsupported", "Direct friend share is unsupported on Wechat adapter."),
    showShareMenu: async (input) => callShareMenu(options, "showShareMenu", createShareMenuPayload(input, options)),
    hideShareMenu: async (input) => callShareMenu(options, "hideShareMenu", createShareMenuPayload(input, options)),
    updateShareMenu: async (input) => callShareMenu(options, "updateShareMenu", createUpdateShareMenuPayload(input, options)),
    setShareAppMessageHandler: (handler) => setShareAppMessageHandler(options, handler),
  };
}

export function createWechatEngagement(options: WechatEngagementOptions): PlatformEngagement {
  return {
    openPage: async (input) => openPage(options, input),
    createGameClubButton: (input) => createGameClubButton(options, input),
    getGameClubData: async (input) => getGameClubData(options, input),
  };
}

export function destroyWechatHandles(options: WechatEngagementOptions): void {
  for (const manager of options.pageManagers) {
    try {
      manager.destroy?.();
    } catch {
      // Best-effort native cleanup.
    }
  }
  options.pageManagers.clear();

  for (const button of options.buttonHandles) {
    try {
      button.destroy?.();
    } catch {
      // Best-effort native cleanup.
    }
  }
  options.buttonHandles.clear();
}

async function shareAppMessage(
  options: WechatShareOptions,
  input: PlatformShareOptions | undefined,
): Promise<CapabilityResult<PlatformShareResult>> {
  const share = getFunction<(options?: Record<string, unknown>) => unknown>(options.runtime, "shareAppMessage");
  if (share === undefined) {
    return capabilityFailure("unavailable", "Wechat share is unavailable.");
  }

  const payload = createSharePayload(input, options);
  try {
    const raw = share(payload);
    return capabilitySuccess({
      completed: true,
      ...(input?.channel === undefined ? {} : { channel: input.channel }),
      raw,
    });
  } catch (error) {
    const mapped = mapNativeFailure(error);
    return capabilityFailure(mapped.reason, mapped.message, { code: mapped.code, raw: mapped.raw });
  }
}

async function callShareMenu(
  options: WechatShareOptions,
  method: "showShareMenu" | "hideShareMenu" | "updateShareMenu",
  payload: Record<string, unknown>,
): Promise<CapabilityResult<void>> {
  const call = getFunction<(options?: Record<string, unknown>) => unknown>(options.runtime, method);
  if (call === undefined) {
    return capabilityFailure("unavailable", "Wechat share menu is unavailable.");
  }

  const outcome = await callNativeWithCallbacks(call, payload, nativeCallOptions(options));
  return outcome.ok ? capabilitySuccess(undefined) : capabilityFailureFromCallback(outcome as CallbackFailure);
}

function setShareAppMessageHandler(options: WechatShareOptions, handler: PlatformShareHandler): () => void {
  const onShareAppMessage = getFunction<(listener: (result: Record<string, unknown>) => unknown) => void>(
    options.runtime,
    "onShareAppMessage",
  );
  if (onShareAppMessage === undefined) {
    return noopUnsubscribe;
  }

  const nativeListener = (result: Record<string, unknown>): unknown => {
    const value = handler(result);
    if (isThenable(value)) {
      return value.then((resolved) => createSharePayload(resolved, options));
    }

    return createSharePayload(value, options);
  };

  onShareAppMessage(nativeListener);
  return createUnsubscribe(() => {
    const offShareAppMessage = getFunction<(listener?: (result: Record<string, unknown>) => unknown) => void>(
      options.runtime,
      "offShareAppMessage",
    );
    offShareAppMessage?.(nativeListener);
  });
}

async function openPage(
  options: WechatEngagementOptions,
  input: PlatformOpenPageOptions,
): Promise<CapabilityResult<PlatformOpenPageResult>> {
  const createPageManager = getFunction<() => WechatPageManager>(options.runtime, "createPageManager");
  if (createPageManager === undefined) {
    return capabilityFailure("unavailable", "Wechat open page is unavailable.");
  }

  const openlink = resolveOpenlink(input, options.openPage);
  if (openlink === undefined) {
    return capabilityFailure("not_configured", "Wechat open page requires an openlink.");
  }

  let pageManager: WechatPageManager;
  try {
    pageManager = createPageManager();
    options.pageManagers.add(pageManager);
  } catch (error) {
    return capabilityFailure("native_failed", "Failed to create Wechat page manager.", {
      code: getNativeCode(error),
      raw: error,
    });
  }

  const payload = createOpenPagePayload(openlink, input);
  try {
    const raw = input.preload === true ? await withTimeout(pageManager.load?.(payload), options.timeoutMs) : await withTimeout(pageManager.show?.(payload), options.timeoutMs);
    return capabilitySuccess({
      ...(input.pageId === undefined ? {} : { pageId: input.pageId }),
      raw,
    });
  } catch (error) {
    return nativePromiseFailure(error, "Wechat open page failed.");
  }
}

function createGameClubButton(
  options: WechatEngagementOptions,
  input: PlatformGameClubButtonOptions,
): CapabilityResult<PlatformNativeButtonHandle> {
  const createGameClubButtonFn = getFunction<(options: Record<string, unknown>) => WechatGameClubButton>(
    options.runtime,
    "createGameClubButton",
  );
  if (createGameClubButtonFn === undefined) {
    return capabilityFailure("unavailable", "Wechat game club button is unavailable.");
  }

  try {
    const button = createGameClubButtonFn(createGameClubButtonPayload(input));
    options.buttonHandles.add(button);
    return capabilitySuccess(createButtonHandle(button, options.buttonHandles));
  } catch (error) {
    const mapped = mapNativeFailure(error);
    return capabilityFailure(mapped.reason, mapped.message, { code: mapped.code, raw: mapped.raw });
  }
}

async function getGameClubData(
  options: WechatEngagementOptions,
  input: { readonly dataTypeList: readonly { readonly type: number; readonly subKey?: string }[] },
): Promise<CapabilityResult<PlatformGameClubEncryptedData>> {
  const getGameClubDataFn = getFunction<(options?: Record<string, unknown>) => unknown>(options.runtime, "getGameClubData");
  if (getGameClubDataFn === undefined) {
    return capabilityFailure("unavailable", "Wechat game club data is unavailable.");
  }

  const outcome = await callNativeWithCallbacks(
    getGameClubDataFn,
    { dataTypeList: input.dataTypeList.map((entry) => ({ ...entry })) },
    nativeCallOptions(options),
  );
  if (!outcome.ok) {
    return capabilityFailureFromCallback(outcome as CallbackFailure);
  }

  const encryptedData = getString(outcome.value, "encryptedData");
  const iv = getString(outcome.value, "iv");
  const signature = getString(outcome.value, "signature");
  if (encryptedData === undefined || iv === undefined || signature === undefined) {
    return capabilityFailure("invalid_response", "Wechat game club data response is invalid.", {
      raw: outcome.value,
    });
  }

  const cloudId = getString(outcome.value, "cloudID") ?? getString(outcome.value, "cloudId");
  return capabilitySuccess({
    encryptedData,
    iv,
    signature,
    ...(cloudId === undefined ? {} : { cloudId }),
    raw: outcome.value,
  });
}

function createSharePayload(
  input: PlatformShareOptions | undefined,
  options: WechatShareOptions,
): Record<string, unknown> {
  const query = serializeQuery(input?.query);
  const title = input?.title ?? options.defaults?.defaultTitle;
  const imageUrl = input?.imageUrl ?? options.defaults?.defaultImageUrl;
  const imageUrlId = input?.imageUrlId ?? options.defaults?.defaultImageUrlId;
  const path = input?.path ?? options.defaults?.defaultPath;

  return {
    ...(title === undefined ? {} : { title }),
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...(imageUrlId === undefined ? {} : { imageUrlId }),
    ...(path === undefined ? {} : { path }),
    ...(query === undefined ? {} : { query }),
    ...(input?.toCurrentGroup === undefined ? {} : { toCurrentGroup: input.toCurrentGroup }),
  };
}

function createShareMenuPayload(
  input: { readonly withShareTicket?: boolean; readonly menus?: readonly string[] } | undefined,
  options: WechatShareOptions,
): Record<string, unknown> {
  const withShareTicket = input?.withShareTicket ?? options.defaults?.withShareTicket;
  const menus = input?.menus ?? options.defaults?.menus;
  return {
    ...(withShareTicket === undefined ? {} : { withShareTicket }),
    ...(menus === undefined ? {} : { menus: [...menus] }),
  };
}

function createUpdateShareMenuPayload(
  input:
    | {
        readonly withShareTicket?: boolean;
        readonly menus?: readonly string[];
        readonly activityId?: string;
        readonly isUpdatableMessage?: boolean;
        readonly templateInfo?: Readonly<Record<string, unknown>>;
        readonly isPrivateMessage?: boolean;
        readonly toDoActivityId?: string;
        readonly participant?: readonly string[];
        readonly chooseType?: number;
        readonly useForChatTool?: boolean;
      }
    | undefined,
  options: WechatShareOptions,
): Record<string, unknown> {
  return {
    ...createShareMenuPayload(input, options),
    ...(input?.activityId === undefined ? {} : { activityId: input.activityId }),
    ...(input?.isUpdatableMessage === undefined ? {} : { isUpdatableMessage: input.isUpdatableMessage }),
    ...(input?.templateInfo === undefined ? {} : { templateInfo: input.templateInfo }),
    ...(input?.isPrivateMessage === undefined ? {} : { isPrivateMessage: input.isPrivateMessage }),
    ...(input?.toDoActivityId === undefined ? {} : { toDoActivityId: input.toDoActivityId }),
    ...(input?.participant === undefined ? {} : { participant: [...input.participant] }),
    ...(input?.chooseType === undefined ? {} : { chooseType: input.chooseType }),
    ...(input?.useForChatTool === undefined ? {} : { useForChatTool: input.useForChatTool }),
  };
}

function createOpenPagePayload(openlink: string, input: PlatformOpenPageOptions): Record<string, unknown> {
  return {
    openlink,
    ...(input.extraData === undefined ? {} : { extraData: input.extraData }),
    ...(input.query === undefined ? {} : { query: input.query }),
  };
}

function createGameClubButtonPayload(input: PlatformGameClubButtonOptions): Record<string, unknown> {
  return {
    type: input.type,
    style: { ...input.style },
    ...(input.icon === undefined ? {} : { icon: input.icon }),
    ...(input.text === undefined ? {} : { text: input.text }),
    ...(input.image === undefined ? {} : { image: input.image }),
    ...(input.openlink === undefined ? {} : { openlink: input.openlink }),
    ...(input.hasRedDot === undefined ? {} : { hasRedDot: input.hasRedDot }),
  };
}

function createButtonHandle(
  button: WechatGameClubButton,
  buttonHandles: Set<WechatGameClubButton>,
): PlatformNativeButtonHandle {
  return {
    show: () => callButtonVoid(button, "show"),
    hide: () => callButtonVoid(button, "hide"),
    destroy: () => {
      buttonHandles.delete(button);
      try {
        button.destroy?.();
      } catch {
        // Best-effort native cleanup.
      }
    },
    onTap: (listener) => {
      if (typeof button.onTap !== "function") {
      return noopUnsubscribe;
      }

      button.onTap(listener);
      return createUnsubscribe(() => button.offTap?.(listener));
    },
  };
}

function callButtonVoid(
  button: WechatGameClubButton,
  method: "show" | "hide",
): CapabilityResult<void> {
  try {
    button[method]?.();
    return capabilitySuccess(undefined);
  } catch (error) {
    const mapped = mapNativeFailure(error);
    return capabilityFailure(mapped.reason, mapped.message, { code: mapped.code, raw: mapped.raw });
  }
}

function resolveOpenlink(
  input: PlatformOpenPageOptions,
  config: WechatOpenPageConfig | undefined,
): string | undefined {
  if (input.openlink !== undefined) {
    return input.openlink.trim().length === 0 ? undefined : input.openlink;
  }

  if (input.pageId === undefined) {
    return undefined;
  }

  const openlink = config?.openlinks?.[input.pageId];
  return openlink === undefined || openlink.trim().length === 0 ? undefined : openlink;
}

async function withTimeout(value: PromiseLike<unknown> | undefined, timeoutMs: number | undefined): Promise<unknown> {
  if (value === undefined) {
    return undefined;
  }

  const timeout = timeoutMs ?? DEFAULT_WECHAT_CALL_TIMEOUT_MS;
  if (timeout <= 0) {
    return value;
  }

  return new Promise<unknown>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject({
        ok: false,
        reason: "timeout",
        message: "Wechat native call timed out.",
      });
    }, timeout);

    void value.then(
      (resolved) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(resolved);
      },
      (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function nativePromiseFailure<TValue>(error: unknown, fallbackMessage: string): CapabilityResult<TValue> {
  if (isRecord(error) && error["ok"] === false && error["reason"] === "timeout") {
    return capabilityFailure("timeout", getNativeMessage(error), { raw: error });
  }

  const mapped = mapNativeFailure(error);
  const message = mapped.message === "Native platform call failed." ? fallbackMessage : mapped.message;
  return capabilityFailure(mapped.reason, message, { code: mapped.code, raw: mapped.raw });
}

function capabilityFailureFromCallback<TValue>(outcome: CallbackFailure): CapabilityResult<TValue> {
  return capabilityFailure(outcome.reason, outcome.message, { code: outcome.code, raw: outcome.raw });
}

function nativeCallOptions(options: { readonly timeoutMs?: number | undefined }): { readonly timeoutMs: number } {
  return { timeoutMs: options.timeoutMs ?? DEFAULT_WECHAT_CALL_TIMEOUT_MS };
}

function isThenable<TValue>(value: TValue | PromiseLike<TValue>): value is PromiseLike<TValue> {
  return isRecord(value) && typeof value["then"] === "function";
}

function createUnsubscribe(dispose: () => void): PlatformUnsubscribe {
  let active = true;
  return () => {
    if (!active) {
      return;
    }

    active = false;
    dispose();
  };
}
