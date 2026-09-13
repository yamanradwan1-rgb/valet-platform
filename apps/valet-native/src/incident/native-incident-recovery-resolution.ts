import type {
  IncidentRecoveryMarker,
  IncidentRecoveryResolution,
  IncidentRecoveryRestore,
  IncidentRecoveryState,
} from "@valet/employee-client";

import { getNativeTelemetry } from "../telemetry/native-telemetry-owner";
import {
  inactiveIncident,
  toRecoverySnapshot,
} from "./native-incident-recovery-snapshot";

/** Closed recovery classification for a resolution outcome. */
function recoveryClassification(
  outcome: IncidentRecoveryResolution["outcome"],
): "found" | "reserved" | "retired" | "unavailable" | "unknown" {
  switch (outcome) {
    case "FOUND":
      return "found";
    case "RESERVED":
      return "reserved";
    case "RETIRED":
      return "retired";
    case "UNAVAILABLE":
      return "unavailable";
    default:
      return "unknown";
  }
}

function recordRecoveryTelemetry(
  classification: string,
  outcome: "error" | "success" | "unknown",
): void {
  getNativeTelemetry().record({
    classification,
    outcome,
    source: "recovery",
  });
}

function recordResolutionTelemetry(
  resolution: IncidentRecoveryResolution,
): void {
  const classification = recoveryClassification(resolution.outcome);
  recordRecoveryTelemetry(
    classification,
    resolution.outcome === "UNAVAILABLE" || resolution.outcome === "UNKNOWN"
      ? classification === "unavailable"
        ? "error"
        : "unknown"
      : "success",
  );
}

export async function applyNativeIncidentRecoveryRestore(
  recovery: IncidentRecoveryState,
  restored: IncidentRecoveryRestore,
  currentMarker: IncidentRecoveryMarker | null,
) {
  if (restored.kind === "empty") {
    return { marker: null, snapshot: inactiveIncident };
  }
  if (restored.kind === "invalidated") {
    // The stored marker no longer matches server-side identity/location.
    recordRecoveryTelemetry("invalidated", "error");
    return {
      marker: null,
      snapshot: { ...inactiveIncident, phase: "recovery-invalidated" } as const,
    };
  }
  if (restored.kind === "storage-unavailable") {
    // Local recovery storage could not be read — a local unavailability.
    recordRecoveryTelemetry("unavailable", "error");
    return {
      marker: currentMarker,
      snapshot: { ...inactiveIncident, phase: "recovery-unavailable" } as const,
    };
  }
  try {
    const applied = await applyNativeIncidentRecoveryResolution(
      recovery,
      restored.marker,
      restored.resolution,
      restored.deadlineReached,
    );
    recordResolutionTelemetry(restored.resolution);
    return applied;
  } catch {
    recordRecoveryTelemetry("unavailable", "error");
    return {
      marker: restored.marker,
      snapshot: { ...inactiveIncident, phase: "recovery-unavailable" } as const,
    };
  }
}

export async function applyNativeIncidentRecoveryResolution(
  recovery: IncidentRecoveryState,
  marker: IncidentRecoveryMarker,
  resolution: IncidentRecoveryResolution,
  deadlineReached: boolean,
) {
  const definitive =
    resolution.outcome === "RETIRED" || resolution.outcome === "UNKNOWN";
  if (definitive) await recovery.clearResolved();
  const result = {
    marker: definitive ? null : marker,
    snapshot: toRecoverySnapshot(resolution, deadlineReached),
  };
  recordResolutionTelemetry(resolution);
  return result;
}
