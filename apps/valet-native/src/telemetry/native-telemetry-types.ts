/**
 * Native telemetry surface types (MOB-024A).
 *
 * The closed classification vocabulary is OWNED by the portable contract
 * (`EMPLOYEE_TELEMETRY_CLASSIFICATIONS` in @valet/employee-client). This file
 * derives the Native-facing literal unions from that single table so the two
 * surfaces can never drift: a classification legal here is legal there, and a
 * value rejected there can never be recorded here.
 *
 * PRIVACY: events are bounded, enumerated records only. No free business
 * strings (plates, URLs, bodies, header values) may ever reach an event.
 */
import {
  EMPLOYEE_TELEMETRY_CLASSIFICATIONS,
  type EmployeeTelemetryEvent,
  type EmployeeTelemetryProvenance,
  type EmployeeTelemetrySource,
} from "@valet/employee-client";

/** Per-source literal unions, derived — never re-enumerated locally. */
export type NativeTelemetryClassifications<S extends EmployeeTelemetrySource> =
  (typeof EMPLOYEE_TELEMETRY_CLASSIFICATIONS)[S][number];

export type NativeHttpClassification = NativeTelemetryClassifications<"http">;
export type NativeAuthClassification = NativeTelemetryClassifications<"auth">;
export type NativeLifecycleClassification =
  NativeTelemetryClassifications<"lifecycle">;
export type NativeNetworkClassification =
  NativeTelemetryClassifications<"network">;
export type NativeOcrClassification = NativeTelemetryClassifications<"ocr">;
export type NativePushClassification = NativeTelemetryClassifications<"push">;
export type NativeRecoveryClassification =
  NativeTelemetryClassifications<"recovery">;

/**
 * Sanitized, support-displayable view of recorded telemetry: the bounded
 * event ring plus build provenance. Nothing here can contain business data.
 */
export interface NativeTelemetrySnapshot {
  readonly events: readonly EmployeeTelemetryEvent[];
  readonly provenance: EmployeeTelemetryProvenance;
}

/**
 * Fail-open recording seam accepted by Native call sites. Implementations
 * must never throw and never alter the business result they observe.
 */
export interface NativeTelemetryRecorder {
  record(event: EmployeeTelemetryEvent): void;
}
