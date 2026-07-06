export type SdkErrorCode =
  | "config.invalid"
  | "event.handler_failed"
  | "lifecycle.invalid_state"
  | "module.duplicate"
  | "module.init_failed"
  | "module.start_failed"
  | "module.destroy_failed"
  | "platform.unavailable"
  | "platform.native_failed"
  | "account.platform_unavailable"
  | "account.login_denied"
  | "account.platform_login_failed"
  | "account.backend_auth_failed"
  | "account.backend_unavailable"
  | "account.backend_timeout"
  | "account.backend_invalid_response"
  | "account.session_missing"
  | "telemetry.plan_invalid"
  | "telemetry.event_invalid"
  | "telemetry.token_unavailable"
  | "telemetry.auth_failed"
  | "telemetry.transport_failed"
  | "telemetry.queue_full"
  | "profile.unavailable"
  | "profile.local_store_unavailable"
  | "profile.local_revision_conflict"
  | "profile.module_invalid"
  | "profile.module_missing"
  | "profile.module_owner_forbidden"
  | "profile.module_version_mismatch"
  | "profile.module_revision_conflict"
  | "profile.command_replay_conflict"
  | "profile.command_failed"
  | "profile.account_missing"
  | "profile.account_mismatch"
  | "profile.cloud_unavailable"
  | "profile.cloud_auth_required"
  | "profile.cloud_invalid_response"
  | "profile.cloud_invalid_snapshot"
  | "profile.cloud_revision_conflict"
  | "profile.sync_conflict_open"
  | "profile.conflict_resolution_failed"
  | "commerce.unavailable"
  | "commerce.destroyed"
  | "commerce.invalid_bundle"
  | "commerce.insufficient_funds"
  | "commerce.command_replay_conflict"
  | "commerce.claim_not_found"
  | "commerce.claim_expired"
  | "commerce.claim_limit_exceeded"
  | "commerce.claim_definition_conflict"
  | "commerce.persistence_unavailable"
  | "commerce.persistence_conflict"
  | "commerce.persistence_invalid"
  | "audio.unavailable"
  | "audio.config_not_found"
  | "audio.config_disabled"
  | "audio.asset_load_failed"
  | "audio.play_failed"
  | "audio.persistence_unavailable"
  | "audio.persistence_invalid"
  | "haptics.unavailable"
  | "haptics.persistence_unavailable"
  | "haptics.persistence_invalid"
  | "unknown";

export interface SdkErrorDetails {
  readonly moduleName?: string;
  readonly cause?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export class SdkError extends Error {
  readonly code: SdkErrorCode;
  readonly moduleName: string | undefined;
  readonly cause: unknown;
  readonly metadata: Readonly<Record<string, unknown>> | undefined;

  constructor(code: SdkErrorCode, message: string, details: SdkErrorDetails = {}) {
    super(message);
    this.name = "SdkError";
    this.code = code;
    this.moduleName = details.moduleName;
    this.cause = details.cause;
    this.metadata = details.metadata;
  }

  static fromUnknown(
    code: SdkErrorCode,
    message: string,
    cause: unknown,
    details: Omit<SdkErrorDetails, "cause"> = {},
  ): SdkError {
    if (cause instanceof SdkError) {
      return cause;
    }

    return new SdkError(code, message, { ...details, cause });
  }
}
