import type { AudioBackend, AudioModuleConfig } from "../../audio";
import type { PlatformFacade } from "../../platform";
import { createCocosAudioAssetLoader } from "./asset-loader";
import { createCocosAudioBackend } from "./cocos-audio-backend";
import { createInnerAudioBackend } from "./inner-audio-backend";

export interface CreateDefaultAudioBackendOptions {
  readonly config: AudioModuleConfig;
  readonly platform: PlatformFacade;
}

export function createDefaultAudioBackend(
  options: CreateDefaultAudioBackendOptions,
): AudioBackend {
  const assetLoader = createCocosAudioAssetLoader({
    defaultBundle: options.config.defaultBundle,
  });

  if (
    options.config.preferInnerAudio === true &&
    options.platform.audio.supportsInnerAudioContext()
  ) {
    return createInnerAudioBackend({
      platformAudio: options.platform.audio,
      assetLoader,
      useWebAudioForShortSfx: options.platform.audio.preferWebAudioForShortSfx,
      label: options.platform.target,
    });
  }

  return createCocosAudioBackend({ assetLoader });
}
