import type { AccountService } from "../account";
import { ok, type Result } from "../core/result";
import type {
  DefaultTelemetryTokenProviderConfig,
  TelemetryAuthState,
  TelemetryTokenProvider,
} from "./types";

export interface CreateDefaultTelemetryTokenProviderOptions {
  readonly config?: DefaultTelemetryTokenProviderConfig;
  readonly account?: AccountService;
}

export function createDefaultTelemetryTokenProvider(
  options: CreateDefaultTelemetryTokenProviderOptions = {},
): TelemetryTokenProvider {
  return new DefaultTelemetryTokenProvider(options);
}

class DefaultTelemetryTokenProvider implements TelemetryTokenProvider {
  constructor(private readonly options: CreateDefaultTelemetryTokenProviderOptions) {}

  async getAuthState(): Promise<Result<TelemetryAuthState, never>> {
    return ok(this.readAuthState());
  }

  async refreshAuthState(): Promise<Result<TelemetryAuthState, never>> {
    return ok(this.readAuthState("refresh_not_supported"));
  }

  private readAuthState(reason?: string): TelemetryAuthState {
    const config = this.options.config;
    const session = this.options.account?.getSession() ?? null;
    const authenticated =
      hasNonEmpty(config?.telemetryAppId) &&
      hasNonEmpty(config?.telemetryIngestKey) &&
      hasNonEmpty(config?.telemetryEnvironment);

    return {
      authenticated,
      ...(session?.accountId === undefined ? {} : { accountId: session.accountId }),
      ...(session?.expiresAtMs === undefined ? {} : { expiresAtMs: session.expiresAtMs }),
      ...(reason === undefined ? {} : { reason }),
    };
  }
}

function hasNonEmpty(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}
