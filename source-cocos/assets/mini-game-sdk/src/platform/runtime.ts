import type { PlatformConfig, PlatformTarget } from "../core";
import { getFunction, isRecord } from "./native";

export interface PlatformRuntimeSelection {
  readonly target: PlatformTarget;
  readonly runtime?: unknown;
}

export function selectPlatformRuntime(config: PlatformConfig | undefined): PlatformRuntimeSelection {
  const requestedTarget = config?.target ?? "auto";

  if (requestedTarget !== "auto") {
    return {
      target: requestedTarget,
      runtime: runtimeForTarget(requestedTarget, config),
    };
  }

  if (config?.douyin?.runtime !== undefined) {
    return { target: "douyin", runtime: config.douyin.runtime };
  }

  const douyinRuntime = getGlobalRuntime("tt");
  if (isDouyinRuntime(douyinRuntime)) {
    return { target: "douyin", runtime: douyinRuntime };
  }

  if (config?.wechat?.runtime !== undefined) {
    return { target: "wechat", runtime: config.wechat.runtime };
  }

  const wechatRuntime = getGlobalRuntime("wx");
  if (isWechatRuntime(wechatRuntime)) {
    return { target: "wechat", runtime: wechatRuntime };
  }

  if (config?.web?.runtime !== undefined) {
    return { target: "web", runtime: config.web.runtime };
  }

  if (isBrowserLikeRuntime(globalThis)) {
    return { target: "web", runtime: globalThis };
  }

  return { target: "noop", runtime: config?.noop?.runtime };
}

function runtimeForTarget(target: PlatformTarget, config: PlatformConfig | undefined): unknown {
  switch (target) {
    case "douyin":
      return config?.douyin?.runtime ?? getGlobalRuntime("tt");
    case "wechat":
      return config?.wechat?.runtime ?? getGlobalRuntime("wx");
    case "web":
      return config?.web?.runtime ?? globalThis;
    case "noop":
      return config?.noop?.runtime;
  }
}

function getGlobalRuntime(key: string): unknown {
  const globals = globalThis as Record<string, unknown>;
  if (!isRecord(globals)) {
    return undefined;
  }

  return globals[key];
}

function isDouyinRuntime(runtime: unknown): boolean {
  return getFunction(runtime, "login") !== undefined || getFunction(runtime, "getLaunchOptionsSync") !== undefined;
}

function isWechatRuntime(runtime: unknown): boolean {
  return getFunction(runtime, "login") !== undefined || getFunction(runtime, "getLaunchOptionsSync") !== undefined;
}

function isBrowserLikeRuntime(runtime: unknown): boolean {
  return isRecord(runtime) && isRecord(runtime["document"]);
}
