import type { PlatformLaunchOptions, PlatformTarget, SidebarLaunchSnapshot } from "./types";
import { getRecord, getString, isRecord } from "./native";

export interface LaunchNormalizationOptions {
  readonly target: PlatformTarget;
}

export function normalizeLaunchOptions(
  raw: unknown,
  options: LaunchNormalizationOptions,
): PlatformLaunchOptions {
  const query = normalizeQuery(getRecord(raw, "query"));
  const extra = normalizeRecord(getRecord(raw, "extra") ?? getRecord(raw, "extraData"));
  const referrerInfo = normalizeRecord(getRecord(raw, "referrerInfo"));
  const referrerExtra = normalizeRecord(getRecord(referrerInfo, "extraData"));
  const scene = normalizeScene(getString(raw, "scene") ?? getString(query, "scene"));
  const launchFrom =
    getString(raw, "launch_from") ??
    getString(raw, "launchFrom") ??
    getString(query, "launch_from") ??
    getString(extra, "launch_from") ??
    getString(referrerExtra, "launch_from");
  const location =
    getString(raw, "location") ??
    getString(query, "location") ??
    getString(extra, "location") ??
    getString(referrerExtra, "location");
  const channel = normalizeChannel(
    query["feed_game_channel"] ??
      query["channel"] ??
      extra["feed_game_channel"] ??
      extra["channel"] ??
      referrerExtra["channel"],
  );

  const entryType = detectEntryType({
    scene,
    launchFrom,
    location,
    query,
    target: options.target,
  });

  const normalized: PlatformLaunchOptions = {
    query,
    raw,
    ...(scene === undefined ? {} : { scene }),
    ...(launchFrom === undefined ? {} : { launchFrom }),
    ...(location === undefined ? {} : { location }),
    ...(Object.keys(referrerInfo).length === 0 ? {} : { referrerInfo }),
    ...(Object.keys(extra).length === 0 ? {} : { extra }),
    entryType,
    ...(channel === undefined ? {} : { channel }),
  };

  return normalized;
}

export function parseSidebarLaunch(launchOptions: PlatformLaunchOptions): SidebarLaunchSnapshot {
  const fromSidebarCard = launchOptions.launchFrom === "homepage" && launchOptions.location === "sidebar_card";

  return {
    fromSidebarCard,
    ...(launchOptions.scene === undefined ? {} : { scene: launchOptions.scene }),
    ...(launchOptions.launchFrom === undefined ? {} : { launchFrom: launchOptions.launchFrom }),
    ...(launchOptions.location === undefined ? {} : { location: launchOptions.location }),
    ...(launchOptions.raw === undefined ? {} : { raw: launchOptions.raw }),
  };
}

export function normalizeScene(scene: string | undefined): string | undefined {
  if (scene === undefined || scene.length === 0) {
    return undefined;
  }

  const trimmed = scene.trim();
  if (/^\d+$/.test(trimmed) && trimmed.length < 6) {
    return trimmed.padStart(6, "0");
  }

  return trimmed;
}

function detectEntryType(input: {
  readonly scene?: string | undefined;
  readonly launchFrom?: string | undefined;
  readonly location?: string | undefined;
  readonly query: Readonly<Record<string, unknown>>;
  readonly target: PlatformTarget;
}): NonNullable<PlatformLaunchOptions["entryType"]> {
  if (input.launchFrom === "homepage" && input.location === "sidebar_card") {
    return "sidebar";
  }

  if (input.target === "douyin") {
    if ((input.scene !== undefined && input.scene.endsWith("3041")) || input.query["feed_game_scene"] === "0") {
      return "feed";
    }
  }

  if (input.launchFrom === "share" || input.location === "share") {
    return "share";
  }

  if (input.scene !== undefined || input.launchFrom !== undefined || input.location !== undefined) {
    return "unknown";
  }

  return "direct";
}

function normalizeQuery(query: Record<string, unknown> | undefined): Readonly<Record<string, unknown>> {
  if (query === undefined) {
    return {};
  }

  return normalizeRecord(query);
}

function normalizeRecord(record: Record<string, unknown> | undefined): Readonly<Record<string, unknown>> {
  if (record === undefined) {
    return {};
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isRecord(value)) {
      output[key] = { ...value };
    } else {
      output[key] = value;
    }
  }

  return output;
}

function normalizeChannel(value: unknown): string | number | null | undefined {
  if (typeof value === "string" || typeof value === "number" || value === null) {
    return value;
  }

  return undefined;
}
