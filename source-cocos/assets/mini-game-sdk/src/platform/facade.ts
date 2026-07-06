import type {
  CapabilityResult,
  PlatformAdapter,
  PlatformCapability,
  PlatformFacade,
  PlatformLaunchOptions,
  PlatformUnsubscribe,
} from "./types";
import { isCapabilityEnabled } from "./capabilities";

export class DefaultPlatformFacade implements PlatformFacade {
  private readonly unsubscribers = new Set<PlatformUnsubscribe>();
  private coldLaunchOptions: CapabilityResult<PlatformLaunchOptions | null> | null = null;
  private destroyed = false;

  constructor(private readonly adapter: PlatformAdapter) {}

  get target(): PlatformFacade["target"] {
    return this.adapter.target;
  }

  get capabilities(): PlatformFacade["capabilities"] {
    return this.adapter.capabilities;
  }

  readonly lifecycle: PlatformFacade["lifecycle"] = {
    getLaunchOptions: () => {
      if (this.coldLaunchOptions !== null) {
        return this.coldLaunchOptions;
      }

      const result = this.adapter.lifecycle.getLaunchOptions();
      if (result.ok) {
        this.coldLaunchOptions = result;
      }

      return result;
    },
    onShow: (listener: (options: PlatformLaunchOptions) => void) => {
      if (this.destroyed) {
        return () => undefined;
      }

      const unsubscribe = this.adapter.lifecycle.onShow(listener);
      return this.trackUnsubscribe(unsubscribe);
    },
    onHide: (listener: () => void) => {
      if (this.destroyed) {
        return () => undefined;
      }

      const unsubscribe = this.adapter.lifecycle.onHide(listener);
      return this.trackUnsubscribe(unsubscribe);
    },
  };

  get audio(): PlatformFacade["audio"] {
    return this.adapter.audio;
  }

  get haptics(): PlatformFacade["haptics"] {
    return this.adapter.haptics;
  }

  get auth(): PlatformFacade["auth"] {
    return this.adapter.auth;
  }

  get ads(): PlatformFacade["ads"] {
    return this.adapter.ads;
  }

  get share(): PlatformFacade["share"] {
    return this.adapter.share;
  }

  get engagement(): PlatformFacade["engagement"] {
    return this.adapter.engagement;
  }

  get shortcut(): PlatformFacade["shortcut"] {
    return this.adapter.shortcut;
  }

  get retention(): PlatformFacade["retention"] {
    return this.adapter.retention;
  }

  isCapabilitySupported(capability: PlatformCapability): boolean {
    return isCapabilityEnabled(this.adapter.capabilities, capability);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    for (const unsubscribe of this.unsubscribers) {
      try {
        unsubscribe();
      } catch {
        // Best-effort listener cleanup must not make destroy fail.
      }
    }
    this.unsubscribers.clear();
    this.adapter.destroy?.();
  }

  private trackUnsubscribe(unsubscribe: PlatformUnsubscribe): PlatformUnsubscribe {
    let active = true;
    this.unsubscribers.add(unsubscribe);

    return () => {
      if (!active) {
        return;
      }

      active = false;
      this.unsubscribers.delete(unsubscribe);
      unsubscribe();
    };
  }
}
