import { SdkError } from "../core/errors";
import { fail, ok, type Result } from "../core/result";
import type {
  TelemetryEventCategory,
  TelemetryPayload,
  TrackingPlan,
  TrackingPlanEvent,
} from "./types";

const DEFAULT_EVENT_VERSION = 1;
const EVENT_CATEGORIES = new Set<TelemetryEventCategory>([
  "session",
  "behavior",
  "progression",
  "economy",
  "error",
  "ad",
]);

export interface RegisteredTrackingPlanEvent<TPayload extends TelemetryPayload = TelemetryPayload>
  extends TrackingPlanEvent<TPayload> {
  readonly version: number;
}

export class TrackingPlanRegistry {
  private readonly plans = new Set<string>();
  private readonly events = new Map<string, RegisteredTrackingPlanEvent>();

  register(plan: TrackingPlan): Result<void, SdkError> {
    const planValidation = validatePlanShape(plan);
    if (!planValidation.ok) {
      return planValidation;
    }

    const planKey = `${plan.name}:${plan.version ?? "default"}`;
    if (this.plans.has(planKey)) {
      return fail(
        new SdkError("telemetry.plan_invalid", "Tracking plan is already registered.", {
          moduleName: "telemetry",
          metadata: { planName: plan.name, planVersion: plan.version },
        }),
      );
    }

    const normalizedEvents = new Map<string, RegisteredTrackingPlanEvent>();
    for (const event of plan.events) {
      const normalized = normalizeEvent(event);
      const eventValidation = validateEventShape(normalized);
      if (!eventValidation.ok) {
        return eventValidation;
      }

      const key = eventKey(normalized.name, normalized.version);
      if (normalizedEvents.has(key) || this.events.has(key)) {
        return fail(
          new SdkError("telemetry.plan_invalid", "Tracking plan event name/version is duplicated.", {
            moduleName: "telemetry",
            metadata: { eventName: normalized.name, eventVersion: normalized.version },
          }),
        );
      }

      normalizedEvents.set(key, normalized);
    }

    this.plans.add(planKey);
    for (const [key, event] of normalizedEvents) {
      this.events.set(key, event);
    }

    return ok(undefined);
  }

  resolve(
    name: string,
    version?: number,
  ): RegisteredTrackingPlanEvent | "unknown" | "inactive" {
    if (version !== undefined) {
      const event = this.events.get(eventKey(name, version));
      if (event === undefined) {
        return "unknown";
      }

      return event.active === false ? "inactive" : event;
    }

    const candidates = Array.from(this.events.values())
      .filter((event) => event.name === name)
      .sort((left, right) => right.version - left.version);
    const latest = candidates[0];
    if (latest === undefined) {
      return "unknown";
    }

    return latest.active === false ? "inactive" : latest;
  }
}

function normalizeEvent(event: TrackingPlanEvent): RegisteredTrackingPlanEvent {
  return {
    ...event,
    version: event.version ?? DEFAULT_EVENT_VERSION,
  };
}

function validatePlanShape(plan: TrackingPlan): Result<void, SdkError> {
  if (plan.name.trim().length === 0) {
    return fail(
      new SdkError("telemetry.plan_invalid", "Tracking plan name is required.", {
        moduleName: "telemetry",
      }),
    );
  }

  if (plan.version !== undefined && plan.version.trim().length === 0) {
    return fail(
      new SdkError("telemetry.plan_invalid", "Tracking plan version must be non-empty when set.", {
        moduleName: "telemetry",
      }),
    );
  }

  if (plan.events.length === 0) {
    return fail(
      new SdkError("telemetry.plan_invalid", "Tracking plan must contain at least one event.", {
        moduleName: "telemetry",
        metadata: { planName: plan.name },
      }),
    );
  }

  return ok(undefined);
}

function validateEventShape(event: RegisteredTrackingPlanEvent): Result<void, SdkError> {
  if (event.name.trim().length === 0) {
    return fail(
      new SdkError("telemetry.plan_invalid", "Tracking plan event name is required.", {
        moduleName: "telemetry",
      }),
    );
  }

  if (!Number.isInteger(event.version) || event.version <= 0) {
    return fail(
      new SdkError("telemetry.plan_invalid", "Tracking plan event version must be a positive integer.", {
        moduleName: "telemetry",
        metadata: { eventName: event.name, eventVersion: event.version },
      }),
    );
  }

  if (!EVENT_CATEGORIES.has(event.category)) {
    return fail(
      new SdkError("telemetry.plan_invalid", "Tracking plan event category is invalid.", {
        moduleName: "telemetry",
        metadata: { eventName: event.name, category: event.category },
      }),
    );
  }

  return ok(undefined);
}

function eventKey(name: string, version: number): string {
  return `${name}:${version}`;
}
