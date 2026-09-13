/**
 * Fail-open telemetry wrappers (MOB-024A).
 *
 * Telemetry is a diagnostic side-channel: it must NEVER break the business
 * operation it observes. These wrappers swallow every error a collector can
 * produce — sync throws, getter traps, recursive re-entry — so the caller
 * always proceeds.
 */
import type {
  EmployeeTelemetryCollector,
  EmployeeTelemetryEvent,
} from "./employee-telemetry-types";

/**
 * Wraps `inner` so that `record` can never propagate an error. All sync
 * throws inside `inner.record` are swallowed. Use this at the seam where an
 * untrusted (platform) collector is injected into portable code.
 */
export function failOpenTelemetryCollector(
  inner: EmployeeTelemetryCollector,
): EmployeeTelemetryCollector {
  return {
    record(event: EmployeeTelemetryEvent): void {
      try {
        inner.record(event);
      } catch {
        /* fail-open: telemetry must never break the caller */
      }
    },
  };
}

/**
 * Fail-open single-shot helper for direct calls: records `event` on
 * `collector` and swallows any error the collector raises.
 */
export function recordTelemetrySafely(
  collector: EmployeeTelemetryCollector,
  event: EmployeeTelemetryEvent,
): void {
  try {
    collector.record(event);
  } catch {
    /* fail-open: telemetry must never break the caller */
  }
}
