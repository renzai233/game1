import { SdkError } from "../../core/errors";
import { fail, ok, type Result } from "../../core/result";
import type { AudioConfig } from "../../audio";
import {
  loadDefaultCocosAudioRuntime,
  type CocosAssetBundle,
  type CocosAudioRuntime,
} from "./runtime";

export interface CocosAudioAsset {
  readonly id: string;
  readonly bundleName: string;
  readonly path: string;
  readonly clip: unknown;
  readonly src: string | null;
  release(): void;
}

export interface CocosAudioAssetLoader {
  loadRuntime(): Promise<Result<CocosAudioRuntime, SdkError>>;
  load(config: AudioConfig): Promise<Result<CocosAudioAsset, SdkError>>;
  get(config: AudioConfig): CocosAudioAsset | undefined;
  release(config: AudioConfig): void;
  releaseAll(): void;
}

export interface CreateCocosAudioAssetLoaderOptions {
  readonly defaultBundle?: string | undefined;
  readonly runtimeLoader?: (() => Promise<Result<CocosAudioRuntime, SdkError>>) | undefined;
}

export function createCocosAudioAssetLoader(
  options: CreateCocosAudioAssetLoaderOptions = {},
): CocosAudioAssetLoader {
  return new DefaultCocosAudioAssetLoader(options);
}

class DefaultCocosAudioAssetLoader implements CocosAudioAssetLoader {
  private readonly defaultBundle: string | undefined;
  private readonly runtimeLoader: () => Promise<Result<CocosAudioRuntime, SdkError>>;
  private readonly assets = new Map<string, CocosAudioAsset>();
  private readonly bundlePromises = new Map<string, Promise<Result<CocosAssetBundle, SdkError>>>();

  constructor(options: CreateCocosAudioAssetLoaderOptions) {
    this.defaultBundle = options.defaultBundle;
    this.runtimeLoader = options.runtimeLoader ?? loadDefaultCocosAudioRuntime;
  }

  loadRuntime(): Promise<Result<CocosAudioRuntime, SdkError>> {
    return this.runtimeLoader();
  }

  async load(config: AudioConfig): Promise<Result<CocosAudioAsset, SdkError>> {
    const cached = this.assets.get(config.id);
    if (cached !== undefined) {
      return ok(cached);
    }

    const runtimeResult = await this.loadRuntime();
    if (!runtimeResult.ok) {
      return fail(runtimeResult.error);
    }

    const bundleName = this.resolveBundleName(config);
    if (!bundleName.ok) {
      return fail(bundleName.error);
    }

    const bundleResult = await this.loadBundle(runtimeResult.value, bundleName.value);
    if (!bundleResult.ok) {
      return fail(bundleResult.error);
    }

    const clipResult = await this.loadClip(bundleResult.value, config);
    if (!clipResult.ok) {
      return fail(clipResult.error);
    }

    const asset: CocosAudioAsset = {
      id: config.id,
      bundleName: bundleName.value,
      path: config.path,
      clip: clipResult.value,
      src: getAudioClipNativeUrl(clipResult.value),
      release: () => runtimeResult.value.assetManager.releaseAsset?.(clipResult.value),
    };
    this.assets.set(config.id, asset);
    return ok(asset);
  }

  get(config: AudioConfig): CocosAudioAsset | undefined {
    return this.assets.get(config.id);
  }

  release(config: AudioConfig): void {
    const asset = this.assets.get(config.id);
    if (asset === undefined) {
      return;
    }

    this.assets.delete(config.id);
    try {
      asset.release();
    } catch {
      // Asset release is best-effort because Cocos may already have released it.
    }
  }

  releaseAll(): void {
    for (const asset of Array.from(this.assets.values())) {
      try {
        asset.release();
      } catch {
        // Best-effort cleanup.
      }
    }
    this.assets.clear();
  }

  private resolveBundleName(config: AudioConfig): Result<string, SdkError> {
    const bundleName = config.bundle ?? this.defaultBundle;
    if (bundleName === undefined || bundleName.trim().length === 0) {
      return fail(
        createAssetLoadFailedError(
          config,
          "Audio config requires bundle or modules.audio.defaultBundle.",
        ),
      );
    }

    return ok(bundleName);
  }

  private loadBundle(
    runtime: CocosAudioRuntime,
    bundleName: string,
  ): Promise<Result<CocosAssetBundle, SdkError>> {
    const existing = runtime.assetManager.getBundle(bundleName);
    if (existing !== null) {
      return Promise.resolve(ok(existing));
    }

    let promise = this.bundlePromises.get(bundleName);
    if (promise === undefined) {
      promise = new Promise((resolve) => {
        runtime.assetManager.loadBundle(bundleName, (error, bundle) => {
          if (hasCocosLoadError(error) || bundle === null || bundle === undefined) {
            this.bundlePromises.delete(bundleName);
            resolve(
              fail(
                new SdkError("audio.asset_load_failed", "Audio bundle failed to load.", {
                  moduleName: "audio",
                  metadata: { bundle: bundleName, error },
                }),
              ),
            );
            return;
          }

          resolve(ok(bundle));
        });
      });
      this.bundlePromises.set(bundleName, promise);
    }

    return promise;
  }

  private loadClip(
    bundle: CocosAssetBundle,
    config: AudioConfig,
  ): Promise<Result<unknown, SdkError>> {
    return new Promise((resolve) => {
      bundle.load(config.path, (error, clip) => {
        if (hasCocosLoadError(error) || isMissingLoadedAsset(clip)) {
          resolve(
            fail(
              createAssetLoadFailedError(
                config,
                "Audio clip failed to load.",
                error ?? "Audio clip load returned no asset.",
              ),
            ),
          );
          return;
        }

        resolve(ok(clip));
      });
    });
  }
}

export function getAudioClipNativeUrl(clip: unknown): string | null {
  if (!isRecord(clip)) {
    return null;
  }

  const nativeAsset = clip["_nativeAsset"];
  if (isRecord(nativeAsset) && typeof nativeAsset["url"] === "string") {
    const url = nativeAsset["url"].trim();
    return url.length > 0 ? url : null;
  }

  const nativeUrl = clip["nativeUrl"];
  if (typeof nativeUrl === "string" && nativeUrl.trim().length > 0) {
    return nativeUrl;
  }

  return null;
}

export function createAssetLoadFailedError(
  config: AudioConfig,
  message: string,
  cause?: unknown,
): SdkError {
  return SdkError.fromUnknown("audio.asset_load_failed", message, cause, {
    moduleName: "audio",
    metadata: {
      id: config.id,
      path: config.path,
      ...(config.bundle === undefined ? {} : { bundle: config.bundle }),
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMissingLoadedAsset(value: unknown): boolean {
  return value === null || value === undefined;
}

function hasCocosLoadError(error: Error | null | undefined): error is Error {
  return error !== null && error !== undefined;
}
