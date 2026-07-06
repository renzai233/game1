import type { SdkContext } from "../core/context";
import { createDisabledContext, noopUnsubscribe } from "../core/disabled-runtime";
import { SdkError, type SdkErrorCode } from "../core/errors";
import { emitSdkEventAndWarn } from "../core/event-publisher";
import type { Unsubscribe } from "../core/event-bus";
import { isRecord, readNonEmptyString, readStringOrFiniteNumber } from "../core/record-reader";
import { fail, ok, type Result } from "../core/result";
import type {
  CapabilityFailureReason,
  CapabilityResult,
  PlatformFacade,
  PlatformLoginCode,
} from "../platform";
import { createNoopPlatformFacade } from "../platform";
import type {
  AccountLoginOptions,
  AccountService,
  AccountSession,
  AccountSessionChangedListener,
  AccountSessionClearReason,
  BackendSilentLoginOutput,
  BackendSilentLoginPort,
} from "./types";

export interface AccountServiceOptions {
  readonly context: SdkContext;
  readonly platform: PlatformFacade;
  readonly backendLoginPort?: BackendSilentLoginPort;
  readonly enabled?: boolean;
}

export function createAccountService(options: AccountServiceOptions): AccountService {
  return new DefaultAccountService(options);
}

export function createDisabledAccountService(options: { readonly enabled?: boolean } = {}): AccountService {
  return new DefaultAccountService({
    context: createDisabledContext(),
    platform: createNoopPlatformFacade("noop"),
    enabled: options.enabled ?? false,
  });
}

class DefaultAccountService implements AccountService {
  private readonly listeners = new Set<AccountSessionChangedListener>();
  private readonly enabled: boolean;
  private session: AccountSession | null = null;
  private destroyed = false;
  private lifecycleEpoch = 0;

  constructor(private readonly options: AccountServiceOptions) {
    this.enabled = options.enabled ?? true;
  }

  getSession(): AccountSession | null {
    return this.session;
  }

  async silentLogin(options: AccountLoginOptions = {}): Promise<Result<AccountSession, SdkError>> {
    if (!this.enabled) {
      const error = new SdkError("account.backend_unavailable", "Account service is disabled.", {
        moduleName: "account",
      });
      this.emitLoginFailed(error);
      return fail(error);
    }

    if (this.destroyed) {
      const error = new SdkError("lifecycle.invalid_state", "Destroyed account service cannot login.", {
        moduleName: "account",
      });
      this.emitLoginFailed(error);
      return fail(error);
    }

    const backendLoginPort = this.options.backendLoginPort;
    if (backendLoginPort === undefined) {
      const error = new SdkError(
        "account.backend_unavailable",
        "Account login requires backend configuration or a BackendSilentLoginPort.",
        { moduleName: "account" },
      );
      this.emitLoginFailed(error);
      return fail(error);
    }

    const lifecycleEpoch = this.lifecycleEpoch;
    let platformCodeResult: CapabilityResult<PlatformLoginCode>;
    try {
      platformCodeResult = await this.options.platform.auth.getLoginCode(
        options.forcePlatformLoginCode === undefined ? {} : { force: options.forcePlatformLoginCode },
      );
    } catch (error) {
      if (!this.isLoginLifecycleCurrent(lifecycleEpoch)) {
        return fail(createDestroyedLoginError());
      }

      const sdkError = SdkError.fromUnknown(
        "account.platform_login_failed",
        "Platform login code request failed.",
        error,
        { moduleName: "account" },
      );
      this.emitLoginFailed(sdkError);
      return fail(sdkError);
    }

    if (!this.isLoginLifecycleCurrent(lifecycleEpoch)) {
      return fail(createDestroyedLoginError());
    }

    if (!platformCodeResult.ok) {
      const error = mapPlatformLoginFailure(platformCodeResult.reason, platformCodeResult.message, {
        code: platformCodeResult.code,
        raw: platformCodeResult.raw,
      });
      this.emitLoginFailed(error);
      return fail(error);
    }

    const platformCode = platformCodeResult.value;
    const backendInput = {
      platform: platformCode.platform,
      code: platformCode.code,
      ...(options.referralCode === undefined ? {} : { referralCode: options.referralCode }),
      ...(options.traceId === undefined ? {} : { traceId: options.traceId }),
    };
    let backendResult: Result<BackendSilentLoginOutput, SdkError>;
    try {
      backendResult = await backendLoginPort.login(backendInput);
    } catch (error) {
      if (!this.isLoginLifecycleCurrent(lifecycleEpoch)) {
        return fail(createDestroyedLoginError());
      }

      const sdkError = SdkError.fromUnknown(
        "account.backend_unavailable",
        "Backend login port failed.",
        error,
        { moduleName: "account" },
      );
      this.emitLoginFailed(sdkError);
      return fail(sdkError);
    }

    if (!this.isLoginLifecycleCurrent(lifecycleEpoch)) {
      return fail(createDestroyedLoginError());
    }

    const normalizedBackendResult = normalizeBackendLoginResult(backendResult);
    if (!normalizedBackendResult.ok) {
      this.emitLoginFailed(normalizedBackendResult.error);
      return normalizedBackendResult;
    }

    const issuedAtMs = this.options.context.clock.now();
    const backendSession = normalizedBackendResult.value;
    const session: AccountSession = {
      accountId: backendSession.accountId,
      platform: backendSession.platform,
      accessToken: backendSession.accessToken,
      issuedAtMs,
      ...(backendSession.expiresAtMs === undefined ? {} : { expiresAtMs: backendSession.expiresAtMs }),
    };

    if (!this.isLoginLifecycleCurrent(lifecycleEpoch)) {
      return fail(createDestroyedLoginError());
    }

    const previousSession = this.session;
    this.session = session;
    this.notifySessionChanged(session, previousSession, "started");
    this.emitSessionStarted(session);

    return ok(session);
  }

  clearSession(reason: AccountSessionClearReason = "manual"): Result<void, SdkError> {
    const previousSession = this.session;
    if (previousSession === null) {
      return ok(undefined);
    }

    this.session = null;
    this.notifySessionChanged(null, previousSession, reason);
    this.emitSessionCleared(reason);
    return ok(undefined);
  }

  onSessionChanged(listener: AccountSessionChangedListener): Unsubscribe {
    if (this.destroyed) {
      return noopUnsubscribe;
    }

    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.lifecycleEpoch += 1;
    this.destroyed = true;
    this.clearSession("sdk_destroyed");
    this.listeners.clear();
  }

  private isLoginLifecycleCurrent(lifecycleEpoch: number): boolean {
    return !this.destroyed && this.lifecycleEpoch === lifecycleEpoch;
  }

  private notifySessionChanged(
    session: AccountSession | null,
    previousSession: AccountSession | null,
    reason: AccountSessionClearReason | "started",
  ): void {
    const listeners: AccountSessionChangedListener[] = [];
    this.listeners.forEach((listener) => {
      listeners.push(listener);
    });

    for (const listener of listeners) {
      try {
        listener(session, previousSession, reason);
      } catch (error) {
        this.options.context.logger.warn("Account session listener failed.", { error });
      }
    }
  }

  private emitSessionStarted(session: AccountSession): void {
    emitSdkEventAndWarn(
      this.options.context,
      "account.session.started",
      {
        atMs: this.options.context.clock.now(),
        accountId: session.accountId,
        platform: session.platform,
        ...(session.expiresAtMs === undefined ? {} : { expiresAtMs: session.expiresAtMs }),
      },
      "Account session started event handler failed.",
    );
  }

  private emitSessionCleared(reason: AccountSessionClearReason): void {
    emitSdkEventAndWarn(
      this.options.context,
      "account.session.cleared",
      {
        atMs: this.options.context.clock.now(),
        reason,
      },
      "Account session cleared event handler failed.",
    );
  }

  private emitLoginFailed(error: SdkError): void {
    emitSdkEventAndWarn(
      this.options.context,
      "account.login.failed",
      {
        atMs: this.options.context.clock.now(),
        code: error.code,
        message: error.message,
      },
      "Account login failed event handler failed.",
    );
  }
}

function normalizeBackendLoginResult(
  result: unknown,
): Result<BackendSilentLoginOutput, SdkError> {
  if (!isRecord(result) || typeof result["ok"] !== "boolean") {
    return fail(invalidBackendResponse("Backend login port must return a Result.", { result }));
  }

  if (!result["ok"]) {
    const error = result["error"];
    if (error instanceof SdkError) {
      return fail(error);
    }

    return fail(
      SdkError.fromUnknown("account.backend_unavailable", "Backend login port returned an invalid failure.", error, {
        moduleName: "account",
      }),
    );
  }

  return normalizeBackendLoginOutput(result["value"]);
}

function normalizeBackendLoginOutput(value: unknown): Result<BackendSilentLoginOutput, SdkError> {
  if (!isRecord(value)) {
    return fail(invalidBackendResponse("Backend login port success value must be an object.", { value }));
  }

  const accountId = readStringOrFiniteNumber(value, "accountId");
  if (accountId === undefined) {
    return fail(invalidBackendResponse("Backend login port success value is missing accountId.", { value }));
  }

  const platform = value["platform"];
  if (!isPlatformTarget(platform)) {
    return fail(invalidBackendResponse("Backend login port success value has invalid platform.", { value }));
  }

  const accessToken = readNonEmptyString(value, "accessToken");
  if (accessToken === undefined) {
    return fail(invalidBackendResponse("Backend login port success value is missing accessToken.", { value }));
  }

  const expiresAtMs = value["expiresAtMs"];
  if (expiresAtMs !== undefined && (typeof expiresAtMs !== "number" || !Number.isFinite(expiresAtMs))) {
    return fail(invalidBackendResponse("Backend login port success value has invalid expiresAtMs.", { value }));
  }

  return ok({
    accountId,
    platform,
    accessToken,
    ...(expiresAtMs === undefined ? {} : { expiresAtMs }),
    ...(value["raw"] === undefined ? {} : { raw: value["raw"] }),
  });
}

function invalidBackendResponse(message: string, metadata: Readonly<Record<string, unknown>>): SdkError {
  return new SdkError("account.backend_invalid_response", message, {
    moduleName: "account",
    metadata,
  });
}

function createDestroyedLoginError(): SdkError {
  return new SdkError("lifecycle.invalid_state", "Destroyed account service cannot complete login.", {
    moduleName: "account",
  });
}

function isPlatformTarget(value: unknown): value is BackendSilentLoginOutput["platform"] {
  return value === "douyin" || value === "wechat" || value === "web" || value === "noop";
}

function mapPlatformLoginFailure(
  reason: CapabilityFailureReason,
  message: string | undefined,
  details: { readonly code?: string | undefined; readonly raw?: unknown },
): SdkError {
  const code = platformFailureToAccountCode(reason);
  return new SdkError(code, message ?? "Platform login code request failed.", {
    moduleName: "account",
    metadata: {
      platformReason: reason,
      ...(details.code === undefined ? {} : { platformCode: details.code }),
      ...(details.raw === undefined ? {} : { raw: details.raw }),
    },
  });
}

function platformFailureToAccountCode(reason: CapabilityFailureReason): SdkErrorCode {
  switch (reason) {
    case "unavailable":
    case "unsupported":
    case "not_configured":
      return "account.platform_unavailable";
    case "permission_denied":
    case "user_cancelled":
      return "account.login_denied";
    case "timeout":
    case "native_failed":
    case "invalid_response":
    case "busy":
      return "account.platform_login_failed";
  }
}
