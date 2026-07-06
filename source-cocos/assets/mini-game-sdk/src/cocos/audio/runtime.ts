import { SdkError } from "../../core/errors";
import { fail, ok, type Result } from "../../core/result";

export interface CocosAssetBundle {
  load(
    path: string,
    callback: (error: Error | null | undefined, asset: unknown) => void,
  ): void;
  load(
    path: string,
    assetType: unknown,
    callback: (error: Error | null | undefined, asset: unknown) => void,
  ): void;
}

export interface CocosAssetManager {
  getBundle(name: string): CocosAssetBundle | null;
  loadBundle(
    name: string,
    callback: (
      error: Error | null | undefined,
      bundle: CocosAssetBundle | null | undefined,
    ) => void,
  ): void;
  releaseAsset?(asset: unknown): void;
}

export interface CocosNodeLike {
  parent: CocosNodeLike | null;
  readonly isValid?: boolean;
  addComponent<TComponent>(component: CocosConstructor<TComponent>): TComponent;
  destroy(): void;
  once?(eventName: string, listener: () => void): void;
  off?(eventName: string, listener: () => void): void;
}

export interface CocosAudioSourceLike {
  clip: unknown;
  loop: boolean;
  volume: number;
  readonly node?: CocosNodeLike;
  play(): void;
  pause(): void;
  stop(): void;
}

export interface CocosGameLike {
  readonly EVENT_HIDE?: string;
  readonly EVENT_SHOW?: string;
  on?(eventName: string, listener: () => void): void;
  off?(eventName: string, listener: () => void): void;
}

export type CocosConstructor<TValue = unknown> = new (...args: never[]) => TValue;

export interface CocosAudioRuntime {
  readonly assetManager: CocosAssetManager;
  readonly AudioClip: CocosConstructor;
  readonly AudioSource: CocosConstructor<CocosAudioSourceLike> & {
    readonly EventType?: {
      readonly ENDED?: string;
    };
  };
  readonly director: {
    addPersistRootNode?(node: CocosNodeLike): void;
  };
  readonly Node: new (name?: string) => CocosNodeLike;
  readonly game?: CocosGameLike;
}

let defaultRuntimePromise: Promise<Result<CocosAudioRuntime, SdkError>> | null = null;

export function loadDefaultCocosAudioRuntime(): Promise<Result<CocosAudioRuntime, SdkError>> {
  if (defaultRuntimePromise === null) {
    defaultRuntimePromise = importCocosRuntime();
  }

  return defaultRuntimePromise;
}

export function isCocosAudioClip(
  runtime: CocosAudioRuntime,
  value: unknown,
): boolean {
  try {
    return value instanceof runtime.AudioClip;
  } catch {
    return value !== null && typeof value === "object";
  }
}

async function importCocosRuntime(): Promise<Result<CocosAudioRuntime, SdkError>> {
  try {
    // Cocos Creator provides the "cc" module at build time; the source harness
    // intentionally has no package dependency on Cocos types.
    // @ts-ignore
    const module = await import("cc");
    return readCocosRuntime(module);
  } catch (error) {
    return fail(
      SdkError.fromUnknown(
        "audio.unavailable",
        "Cocos audio runtime is unavailable.",
        error,
        { moduleName: "audio" },
      ),
    );
  }
}

function readCocosRuntime(value: unknown): Result<CocosAudioRuntime, SdkError> {
  if (!isRecord(value)) {
    return fail(createUnavailableRuntimeError("Cocos module did not load as an object."));
  }

  const assetManager = value["assetManager"];
  const AudioClip = value["AudioClip"];
  const AudioSource = value["AudioSource"];
  const director = value["director"];
  const Node = value["Node"];
  if (
    !isRecord(assetManager) ||
    typeof assetManager["getBundle"] !== "function" ||
    typeof assetManager["loadBundle"] !== "function" ||
    typeof AudioClip !== "function" ||
    typeof AudioSource !== "function" ||
    !isRecord(director) ||
    typeof Node !== "function"
  ) {
    return fail(createUnavailableRuntimeError("Cocos audio runtime is incomplete."));
  }

  return ok({
    assetManager: assetManager as unknown as CocosAssetManager,
    AudioClip: AudioClip as CocosConstructor,
    AudioSource: AudioSource as CocosAudioRuntime["AudioSource"],
    director: director as CocosAudioRuntime["director"],
    Node: Node as CocosAudioRuntime["Node"],
    ...(isRecord(value["game"]) ? { game: value["game"] as CocosGameLike } : {}),
  });
}

function createUnavailableRuntimeError(message: string): SdkError {
  return new SdkError("audio.unavailable", message, {
    moduleName: "audio",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
