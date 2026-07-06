import { SdkError } from "../../core/errors";
import { fail, ok, type Result } from "../../core/result";
import type { PlatformAudio, PlatformInnerAudioContext } from "../../platform";
import type {
  AudioBackend,
  AudioBackendHandle,
  AudioConfig,
  AudioPlayOptions,
} from "../../audio";
import {
  createAssetLoadFailedError,
  createCocosAudioAssetLoader,
  type CocosAudioAssetLoader,
} from "./asset-loader";

export interface CreateInnerAudioBackendOptions {
  readonly platformAudio: PlatformAudio;
  readonly assetLoader?: CocosAudioAssetLoader | undefined;
  readonly defaultBundle?: string | undefined;
  readonly useWebAudioForShortSfx?: boolean | undefined;
  readonly label?: string | undefined;
}

let nextHandleId = 1;

export function createInnerAudioBackend(
  options: CreateInnerAudioBackendOptions,
): AudioBackend {
  return new InnerAudioBackend(options);
}

export class InnerAudioBackend implements AudioBackend {
  private readonly platformAudio: PlatformAudio;
  private readonly assetLoader: CocosAudioAssetLoader;
  private readonly useWebAudioForShortSfx: boolean;
  private readonly label: string;
  private readonly handles = new Set<InnerAudioHandle>();

  constructor(options: CreateInnerAudioBackendOptions) {
    this.platformAudio = options.platformAudio;
    this.assetLoader = options.assetLoader ?? createCocosAudioAssetLoader({
      defaultBundle: options.defaultBundle,
    });
    this.useWebAudioForShortSfx = options.useWebAudioForShortSfx ?? false;
    this.label = options.label ?? "Platform";
  }

  async preload(config: AudioConfig): Promise<Result<void, SdkError>> {
    const asset = await this.assetLoader.load(config);
    if (!asset.ok) {
      return fail(asset.error);
    }

    if (asset.value.src === null) {
      return fail(createAssetLoadFailedError(config, "AudioClip does not expose a native URL."));
    }

    return ok(undefined);
  }

  async play(
    config: AudioConfig,
    options: AudioPlayOptions,
  ): Promise<Result<AudioBackendHandle | null, SdkError>> {
    const asset = await this.assetLoader.load(config);
    if (!asset.ok) {
      return fail(asset.error);
    }

    if (asset.value.src === null) {
      return fail(createAssetLoadFailedError(config, "AudioClip does not expose a native URL."));
    }

    const loop = options.loop ?? Boolean(config.loop);
    const context = this.platformAudio.createInnerAudioContext({
      useWebAudioImplement: this.useWebAudioForShortSfx && !loop,
    });
    if (context === null) {
      return fail(
        new SdkError("audio.unavailable", "InnerAudioContext is unavailable.", {
          moduleName: "audio",
          metadata: { id: config.id, label: this.label },
        }),
      );
    }

    let handle: InnerAudioHandle | null = null;
    try {
      context.autoplay = false;
      context.src = asset.value.src;
      context.loop = loop;
      context.volume = options.volume;

      const onEnded = (): void => {
        const currentHandle = handle;
        if (currentHandle === null) {
          return;
        }
        options.onEnded?.(currentHandle);
        currentHandle.destroy();
      };
      const onError = (): void => {
        handle?.destroy();
      };
      handle = new InnerAudioHandle(config, context, onEnded, onError, (destroyed) => {
        this.handles.delete(destroyed);
      });

      context.onEnded?.(onEnded);
      context.onError?.(onError);
      context.play();
      this.handles.add(handle);
      return ok(handle);
    } catch (error) {
      if (handle !== null) {
        handle.destroy();
      } else {
        try {
          context.destroy();
        } catch {
          // Best-effort cleanup.
        }
      }
      return fail(
        SdkError.fromUnknown("audio.play_failed", "InnerAudioContext failed to play.", error, {
          moduleName: "audio",
          metadata: { id: config.id, label: this.label },
        }),
      );
    }
  }

  release(config: AudioConfig): void {
    if (this.hasActiveHandle(config.id)) {
      return;
    }

    this.assetLoader.release(config);
  }

  releaseAll(): void {
    for (const handle of Array.from(this.handles)) {
      handle.destroy();
    }
    this.handles.clear();
    this.assetLoader.releaseAll();
  }

  private hasActiveHandle(configId: string): boolean {
    for (const handle of this.handles) {
      if (handle.config.id === configId) {
        return true;
      }
    }
    return false;
  }
}

class InnerAudioHandle implements AudioBackendHandle {
  readonly id = createHandleId();
  private destroyed = false;

  constructor(
    readonly config: AudioConfig,
    private readonly context: PlatformInnerAudioContext,
    private readonly onEnded: () => void,
    private readonly onError: (error?: unknown) => void,
    private readonly onDestroy: (handle: InnerAudioHandle) => void,
  ) {}

  setVolume(volume: number): void {
    this.context.volume = volume;
  }

  pause(): void {
    this.context.pause();
  }

  resume(): void {
    this.context.play();
  }

  stop(): void {
    this.context.stop();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;

    this.context.offEnded?.(this.onEnded);
    this.context.offError?.(this.onError);
    try {
      this.context.stop();
    } catch {
      // Best-effort stop.
    }
    try {
      this.context.destroy();
    } catch {
      // Best-effort destroy.
    }
    this.onDestroy(this);
  }
}

function createHandleId(): number {
  const id = nextHandleId;
  nextHandleId += 1;
  return id;
}
