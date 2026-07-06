import { SdkError } from "./errors";
import { fail, ok, type Result } from "./result";
import type { SdkContext } from "./context";

export type MaybePromise<TValue> = TValue | Promise<TValue>;

export interface SdkModule {
  readonly name: string;
  init(ctx: SdkContext): MaybePromise<void>;
  start?(): MaybePromise<void>;
  destroy?(): MaybePromise<void>;
}

export type SdkModuleState = "registered" | "initialized" | "started" | "destroyed";

export interface SdkModuleSnapshot {
  readonly name: string;
  readonly state: SdkModuleState;
}

interface ManagedModule {
  readonly module: SdkModule;
  state: SdkModuleState;
}

export class SdkModuleManager {
  private readonly modules: ManagedModule[] = [];
  private readonly moduleNames = new Set<string>();

  register(module: SdkModule): Result<void, SdkError> {
    if (module.name.trim().length === 0) {
      return fail(new SdkError("config.invalid", "Module name is required."));
    }

    if (this.moduleNames.has(module.name)) {
      return fail(
        new SdkError("module.duplicate", `Module already registered: ${module.name}`, {
          moduleName: module.name,
        }),
      );
    }

    this.modules.push({ module, state: "registered" });
    this.moduleNames.add(module.name);
    return ok(undefined);
  }

  async initAll(ctx: SdkContext): Promise<Result<void, SdkError>> {
    for (const item of this.modules) {
      if (item.state !== "registered") {
        continue;
      }

      try {
        await item.module.init(ctx);
        item.state = "initialized";
      } catch (error) {
        return fail(
          SdkError.fromUnknown("module.init_failed", `Module init failed: ${item.module.name}`, error, {
            moduleName: item.module.name,
          }),
        );
      }
    }

    return ok(undefined);
  }

  async startAll(): Promise<Result<void, SdkError>> {
    for (const item of this.modules) {
      if (item.state === "started" || item.module.start === undefined) {
        if (item.state === "initialized" && item.module.start === undefined) {
          item.state = "started";
        }
        continue;
      }

      if (item.state !== "initialized") {
        return fail(
          new SdkError("lifecycle.invalid_state", `Module cannot start from state ${item.state}.`, {
            moduleName: item.module.name,
            metadata: { state: item.state },
          }),
        );
      }

      try {
        await item.module.start();
        item.state = "started";
      } catch (error) {
        return fail(
          SdkError.fromUnknown("module.start_failed", `Module start failed: ${item.module.name}`, error, {
            moduleName: item.module.name,
          }),
        );
      }
    }

    return ok(undefined);
  }

  async destroyAll(): Promise<Result<void, SdkError>> {
    for (const item of [...this.modules].reverse()) {
      if (item.state === "destroyed" || item.state === "registered") {
        item.state = "destroyed";
        continue;
      }

      if (item.module.destroy === undefined) {
        item.state = "destroyed";
        continue;
      }

      try {
        await item.module.destroy();
        item.state = "destroyed";
      } catch (error) {
        return fail(
          SdkError.fromUnknown(
            "module.destroy_failed",
            `Module destroy failed: ${item.module.name}`,
            error,
            { moduleName: item.module.name },
          ),
        );
      }
    }

    return ok(undefined);
  }

  snapshot(): readonly SdkModuleSnapshot[] {
    return this.modules.map((item) => ({
      name: item.module.name,
      state: item.state,
    }));
  }
}
