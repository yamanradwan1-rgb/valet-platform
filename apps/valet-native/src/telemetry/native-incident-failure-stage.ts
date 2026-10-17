import type { IncidentPreflightStage } from "@valet/employee-client";

/** The sole runtime allowlist for content-free Incident failure retention. */
const stages: ReadonlySet<string> = new Set<IncidentPreflightStage>([
  "session-detail-transport",
  "session-detail-response",
  "context",
  "input-validation",
  "storage-read",
  "marker-parse",
  "secure-uuid",
  "storage-write",
  "storage-readback",
  "marker-verify",
  "reserve-transport",
  "reserve-response",
  "reserve-binding",
  "report-transport",
  "report-response",
]);

export function isNativeIncidentFailureStage(
  value: unknown,
): value is IncidentPreflightStage {
  return typeof value === "string" && stages.has(value);
}
