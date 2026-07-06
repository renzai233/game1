import { SdkError } from "../../core/errors";
import { fail, ok, type Result } from "../../core/result";
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
import type {
  CocosAudioRuntime,
  CocosAudioSourceLike,
  CocosNodeLike,
} from "./runtime";

export interface CreateCocosAudioBackendOptions {
  readonly assetLoader?: CocosAudioAssetLoader | undefined;
  readonly defaultBundle?: string | undefined;
  readonly rootNodeName?: string | undefined;
}

let nextHandleId = 1;

export function createCocosAudioBackend(
  options: CreateCocosAudioBackendOptions = {},
): AudioBackend {
  return new CocosAudioBackend(options);
}

export class CocosAudioBackend implements AudioBackend {
  private readonly assetLoader: CocosAudioAssetLoader;
  private readonly rootNodeName: string;
  private readonly handles = new Set<CocosAudioHandle>();
  private root: CocosNodeLike | null = null;

  constructor(options: CreateCocosAudioBackendOptions = {}) {
    this.assetLoader = options.assetLoader ?? createCocosAudioAssetLoader({
      defaultBundle: options.defaultBundle,
    });
    this.rootNodeName = options.rootNodeName ?? "MiniGameSdkAudio";
  }

  async preload(config: AudioConfig): Promise<Result<void, SdkError>> {
    const loaded = await this.assetLoader.load(config);
    if (!loaded.ok) {
      return fail(loaded.error);
    }

    return ok(undefined);
  }

  async play(
    config: AudioConfig,
    options: AudioPlayOptions,
  ): Promise<Result<AudioBackendHandle | null, SdkError>> {
    const loaded = await this.assetLoader.load(config);
    if (!loaded.ok) {
      return fail(loaded.error);
    }

    const runtime = await this.assetLoader.loadRuntime();
    if (!runtime.ok) {
      return fail(runtime.error);
    }

    let node: CocosNodeLike | null = null;
    try {
      node = new runtime.value.Node(`SdkAudio_${config.id}`);
      node.parent = this.getRoot(runtime.value);
      const source = node.addComponent(runtime.value.AudioSource);
      source.clip = loaded.value.clip;
      source.loop = options.loop ?? Boolean(config.loop);
      source.volume = options.volume;

      const cleanupCallbacks: Array<() => void> = [];
      const handle = new CocosAudioHandle(config, source, node, cleanupCallbacks, (destroyed) => {
        this.handles.delete(destroyed);
      });

      if (!source.loop) {
        const endedEvent = runtime.value.AudioSource.EventType?.ENDED;
        const eventNode = source.node ?? node;
        if (endedEvent !== undefined && typeof eventNode.once === "function") {
          const onEnded = (): void => {
            options.onEnded?.(handle);
            handle.destroy();
          };
          eventNode.once(endedEvent, onEnded);
          cleanupCallbacks.push(() => eventNode.off?.(endedEvent, onEnded));
        }
      }

      source.play();
      this.handles.add(handle);
      return ok(handle);
    } catch (error) {
      if (node !== null && nodeIsValid(node)) {
        try {
          node.destroy();
        } catch {
          // Best-effort cleanup.
        }
      }
      return fail(
        SdkError.fromUnknown("audio.play_failed", "Cocos AudioSource failed to play.", error, {
          moduleName: "audio",
          metadata: { id: config.id },
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

    const root = this.root;
    this.root = null;
    if (root !== null && nodeIsValid(root)) {
      try {
        root.destroy();
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  private getRoot(runtime: CocosAudioRuntime): CocosNodeLike {
    if (this.root !== null && nodeIsValid(this.root)) {
      return this.root;
    }

    const root = new runtime.Node(this.rootNodeName);
    runtime.director.addPersistRootNode?.(root);
    this.root = root;
    return root;
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

class CocosAudioHandle implements AudioBackendHandle {
  readonly id = createHandleId();
  private destroyed = false;

  constructor(
    readonly config: AudioConfig,
    private readonly source: CocosAudioSourceLike,
    private readonly node: CocosNodeLike,
    private readonly cleanupCallbacks: Array<() => void>,
    private readonly onDestroy: (handle: CocosAudioHandle) => void,
  ) {}

  setVolume(volume: number): void {
    this.source.volume = volume;
  }

  pause(): void {
    this.source.pause();
  }

  resume(): void {
    this.source.play();
  }

  stop(): void {
    this.source.stop();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;

    for (const cleanup of this.cleanupCallbacks.splice(0)) {
      try {
        cleanup();
      } catch {
        // Best-effort listener cleanup.
      }
    }

    try {
      this.source.stop();
    } catch {
      // Best-effort stop.
    }

    this.onDestroy(this);
    if (nodeIsValid(this.node)) {
      this.node.destroy();
    }
  }
}

function createHandleId(): number {
  const id = nextHandleId;
  nextHandleId += 1;
  return id;
}

function nodeIsValid(node: CocosNodeLike): boolean {
  return node.isValid !== false;
}

export { createAssetLoadFailedError };
