import type { PlatformTarget } from "../core/config";
import type { Unsubscribe } from "../core/event-bus";
import type { ModuleBoundary } from "../core/module-boundary";
import type { Result } from "../core/result";
import type { SdkError } from "../core/errors";

export const ACCOUNT_MODULE_BOUNDARY: ModuleBoundary = {
  name: "account",
  targetStage: "Stage 1",
  implemented: true,
  owns: [
    "Company account session contract",
    "Backend silent login boundary",
    "Account session public events",
  ],
  nonGoals: [
    "No platform identity exposure as a game identity",
    "No profile, save, or cloud snapshot ownership",
    "No telemetry queue or transport ownership",
  ],
};

export interface AccountSession {
  readonly accountId: string;
  readonly platform: PlatformTarget;
  readonly accessToken: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs?: number;
}

export interface AccountLoginOptions {
  readonly forcePlatformLoginCode?: boolean;
  readonly referralCode?: string;
  readonly traceId?: string;
}

export type AccountSessionClearReason =
  | "manual"
  | "expired"
  | "backend_rejected"
  | "sdk_destroyed"
  | "disabled";

export type AccountSessionChangedListener = (
  session: AccountSession | null,
  previousSession: AccountSession | null,
  reason: AccountSessionClearReason | "started",
) => void;

export interface BackendSilentLoginInput {
  readonly platform: PlatformTarget;
  readonly code: string;
  readonly referralCode?: string;
  readonly traceId?: string;
}

export interface BackendSilentLoginOutput {
  readonly accountId: string;
  readonly platform: PlatformTarget;
  readonly accessToken: string;
  readonly expiresAtMs?: number;
  readonly serverTimeMs?: number;
  readonly raw?: unknown;
}

export interface BackendSilentLoginPort {
  login(input: BackendSilentLoginInput): Promise<Result<BackendSilentLoginOutput, SdkError>>;
}

export interface AccountService {
  getSession(): AccountSession | null;
  silentLogin(options?: AccountLoginOptions): Promise<Result<AccountSession, SdkError>>;
  clearSession(reason?: AccountSessionClearReason): Result<void, SdkError>;
  onSessionChanged(listener: AccountSessionChangedListener): Unsubscribe;
  destroy(): void;
}

export interface DisabledAccountServiceOptions {
  readonly enabled?: boolean;
}
