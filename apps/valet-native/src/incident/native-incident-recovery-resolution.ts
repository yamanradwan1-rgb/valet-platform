import type {
  IncidentRecoveryMarker,
  IncidentRecoveryResolution,
  IncidentRecoveryRestore,
  IncidentRecoveryState,
} from "@valet/employee-client";

import {
  inactiveIncident,
  toRecoverySnapshot,
} from "./native-incident-recovery-snapshot";

export async function applyNativeIncidentRecoveryRestore(
  recovery: IncidentRecoveryState,
  restored: IncidentRecoveryRestore,
  currentMarker: IncidentRecoveryMarker | null,
) {
  if (restored.kind === "empty") {
    return { marker: null, snapshot: inactiveIncident };
  }
  if (restored.kind === "invalidated") {
    return {
      marker: null,
      snapshot: { ...inactiveIncident, phase: "recovery-invalidated" } as const,
    };
  }
  if (restored.kind === "storage-unavailable") {
    return {
      marker: currentMarker,
      snapshot: { ...inactiveIncident, phase: "recovery-unavailable" } as const,
    };
  }
  try {
    return await applyNativeIncidentRecoveryResolution(
      recovery,
      restored.marker,
      restored.resolution,
      restored.deadlineReached,
    );
  } catch {
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
  return {
    marker: definitive ? null : marker,
    snapshot: toRecoverySnapshot(resolution, deadlineReached),
  };
}
