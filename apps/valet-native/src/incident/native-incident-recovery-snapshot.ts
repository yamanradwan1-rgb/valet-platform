import type { IncidentRecoveryResolution } from "@valet/employee-client";
import type { NativeIncidentSnapshot } from "./native-incident-types";

const base = {
  detail: null,
  error: null,
  report: null,
  target: null,
} as const;

export const inactiveIncident: NativeIncidentSnapshot = {
  ...base,
  deadlineReached: false,
  phase: "inactive",
};

export function toRecoverySnapshot(
  resolution: IncidentRecoveryResolution,
  deadlineReached: boolean,
): NativeIncidentSnapshot {
  if (resolution.outcome === "FOUND") {
    return {
      ...base,
      deadlineReached,
      phase: "success",
      report: resolution.report,
    };
  }
  if (resolution.outcome === "RESERVED") {
    return { ...base, deadlineReached, phase: "recovery-reserved" };
  }
  if (resolution.outcome === "UNAVAILABLE") {
    return { ...base, deadlineReached, phase: "recovery-unavailable" };
  }
  return {
    ...base,
    deadlineReached,
    phase:
      resolution.outcome === "RETIRED"
        ? "recovery-retired"
        : "recovery-unknown",
  };
}
