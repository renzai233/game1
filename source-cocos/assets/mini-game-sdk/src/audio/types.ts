import type { SdkError } from "../core/errors";
import type { ModuleBoundary } from "../core/module-boundary";
import type { Result } from "../core/result";

export const AUDIO_MODULE_ID = "sdk.audio";
export const AUDIO_SETTINGS_PROFILE_MODULE_ID = "sdk.audio.settings";
export const AUDIO_SETTINGS_PROFILE_OWNER = "sdk:audio";
export const AUDIO_SETTINGS_PROFILE_MODULE_VERSION = 1;
export const CURRENT_AUDIO_SETTINGS_SCHEMA_VERSION = 1;

export const DEFAULT_AUDIO_BUSES = [
  "master",
  "music",
  "sfx",
  "ui",
  "ambience",
] as const;

export const AUDIO_MODULE_BOUNDARY: ModuleBoundary = {
  name: "audio",
  targetStage: "Stage 2+",
  implemented: true,
  owns: [
    "Audio runtime public API, settings profile module, BGM/SFX control policy, and backend abstraction",
    "SDK lifecycle, platform hide/show, rewarded video, and web autoplay interruption handling",
    "Cocos/mini-game audio backend contract without game-specific catalog entries",
  ],
  nonGoals: [
    "No game-specific audio ids, scenes, bundles, or trigger points",
    "No haptics or vibration settings",
    "No direct dependency on a host project event hub",
  ],
};

export type AudioPreloadStrategy = "boot" | "scene" | "lazy";

export interface AudioConfig {
  readonly id: string;
  readonly enabled?: boolean;
  readonly bus?: string;
  readonly bundle?: string;
  readonly path: string;
  readonly loop?: boolean;
  readonly volume?: number;
  readonly preload?: AudioPreloadStrategy;
  readonly scenes?: readonly string[];
  readonly maxInstances?: number;
  readonly cooldownMs?: number;
  readonly priority?: number;
  readonly fadeInMs?: number;
  readonly fadeOutMs?: number;
}

export interface AudioSettingsSnapshot {
  readonly volumes: Readonly<Record<string, number>>;
  readonly muted: Readonly<Record<string, boolean>>;
}

export interface AudioSettingsProfileData {
  readonly schemaVersion: typeof CURRENT_AUDIO_SETTINGS_SCHEMA_VERSION;
  readonly volumes: Readonly<Record<string, number>>;
  readonly muted: Readonly<Record<string, boolean>>;
  readonly updatedAtMs: number;
}

export interface AudioModuleConfig {
  readonly enabled?: boolean;
  readonly catalog?: readonly AudioConfig[];
  readonly defaultBundle?: string;
  readonly buses?: readonly string[];
  readonly defaultSettings?: AudioSettingsSnapshot;
  readonly pauseOnLifecycleHide?: boolean;
  readonly pauseOnRewardedVideo?: boolean;
  readonly webAutoplayUnlock?: boolean;
  readonly preferInnerAudio?: boolean;
}

export type PlayBgmOutput =
  | { readonly status: "started"; readonly id: string }
  | { readonly status: "unchanged"; readonly id: string }
  | {
      readonly status: "queued";
      readonly id: string;
      readonly reason: "interrupted" | "autoplay_locked";
    };

export type PlaySfxOutput =
  | { readonly status: "played"; readonly id: string; readonly handleId?: number }
  | {
      readonly status: "skipped";
      readonly id: string;
      readonly reason:
        | "interrupted"
        | "autoplay_locked"
        | "cooldown"
        | "max_instances"
        | "muted";
    };

export interface PlayBgmOptions {
  readonly fadeMs?: number;
}

export interface PlaySfxOptions {
  readonly group?: string;
  readonly volume?: number;
}

export interface AudioService {
  preloadBoot(): Promise<Result<void, SdkError>>;
  preloadScene(scene: string): Promise<Result<void, SdkError>>;
  releaseScene(scene: string): void;

  playBgm(id: string, options?: PlayBgmOptions): Promise<Result<PlayBgmOutput, SdkError>>;
  stopBgm(options?: PlayBgmOptions): Promise<Result<{ readonly stopped: boolean }, SdkError>>;
  setCurrentBgmVolumeOverride(
    volume: number | null,
    fadeMs?: number,
  ): Promise<Result<void, SdkError>>;
  getCurrentBgmId(): string | null;

  playSfx(id: string, options?: PlaySfxOptions): Promise<Result<PlaySfxOutput, SdkError>>;
  stopGroup(group: string): void;

  setBusVolume(bus: string, volume: number): Promise<Result<AudioSettingsSnapshot, SdkError>>;
  setBusMuted(bus: string, muted: boolean): Promise<Result<AudioSettingsSnapshot, SdkError>>;
  getSettings(): AudioSettingsSnapshot;

  pauseForInterruption(): void;
  resumeAfterInterruption(): void;
  destroy(): void | Promise<void>;
}

export interface AudioPlayOptions {
  readonly loop?: boolean;
  readonly volume: number;
  readonly onEnded?: (handle: AudioBackendHandle) => void;
}

export interface AudioBackendHandle {
  readonly id: number;
  setVolume(volume: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  destroy(): void;
}

export interface AudioBackend {
  preload(config: AudioConfig): Promise<Result<void, SdkError>>;
  play(
    config: AudioConfig,
    options: AudioPlayOptions,
  ): Promise<Result<AudioBackendHandle | null, SdkError>>;
  release(config: AudioConfig): void;
  releaseAll(): void;
}

export interface AudioRuntimeService extends AudioService {
  start(): Promise<Result<void, SdkError>>;
}
