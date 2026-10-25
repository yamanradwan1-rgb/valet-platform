import type {
  DashboardSessionState,
  DashboardTaskStatus,
  IncidentOverviewEntry,
} from "@valet/contracts";

export function sessionStateLabel(state: DashboardSessionState): string {
  return state.replaceAll("_", " ");
}

export function taskStatusLabel(status: DashboardTaskStatus): string {
  return status.replaceAll("_", " ");
}

export function sessionTone(state: DashboardSessionState) {
  if (state === "PARKED" || state === "READY") return "good" as const;
  if (state === "PARKING" || state === "RETRIEVING") return "info" as const;
  if (state === "REQUESTED" || state === "HANDOFF_PENDING")
    return "warn" as const;
  return "neutral" as const;
}

export function taskTone(status: DashboardTaskStatus) {
  if (status === "COMPLETED") return "good" as const;
  if (status === "IN_PROGRESS" || status === "ACCEPTED") return "info" as const;
  if (status === "CANCELLED") return "bad" as const;
  if (status === "QUEUED" || status === "ASSIGNED") return "warn" as const;
  return "neutral" as const;
}

export function incidentTone(status: IncidentOverviewEntry["status"]) {
  if (status === "RESOLVED") return "good" as const;
  if (status === "OPEN") return "bad" as const;
  if (status === "INVESTIGATING") return "warn" as const;
  return "neutral" as const;
}

export function severityTone(severity: IncidentOverviewEntry["severity"]) {
  if (severity === "CRITICAL" || severity === "HIGH") return "bad" as const;
  if (severity === "MEDIUM") return "warn" as const;
  return "neutral" as const;
}
