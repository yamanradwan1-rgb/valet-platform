import type { EmployeeHandoffSnapshot } from "@valet/employee-client";

export interface NativeHandoffGuestAccessRecoveryTarget {
  readonly origin: "HANDOFF";
  readonly sessionId: string;
}

/**
 * Derives recovery context only from a stable, canonical active Handoff
 * projection. Server-side Guest Access authorization remains authoritative.
 */
export function nativeHandoffGuestAccessRecoveryTarget(
  snapshot: EmployeeHandoffSnapshot,
): NativeHandoffGuestAccessRecoveryTarget | null {
  const scope = snapshot.scope;
  const session = snapshot.session;
  const task = snapshot.task;
  if (
    snapshot.phase !== "pending" ||
    scope === null ||
    session === null ||
    task === null ||
    (scope.role !== "VALET_EMPLOYEE" && scope.role !== "VALET_SUPERVISOR") ||
    session.state !== "HANDOFF_PENDING" ||
    session.handoff.pendingAt === null ||
    (session.handoff.verification?.verifiedAt ?? null) !== null ||
    session.locationId !== scope.locationId ||
    task.taskType !== "RETRIEVAL" ||
    task.status !== "IN_PROGRESS" ||
    task.sessionId !== session.sessionId ||
    task.valetSessionState !== "HANDOFF_PENDING" ||
    task.valetSessionVersion !== session.version
  ) {
    return null;
  }

  return { origin: "HANDOFF", sessionId: session.sessionId };
}
