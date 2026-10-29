export interface EmergencyTakeoverDomainInput {
  readonly currentAssigneeMembershipId: string | null;
  readonly replacementAssigneeMembershipId: string;
  readonly retrievalRequestStatus: string | null;
  readonly sessionState: string;
  readonly taskStatus: string;
  readonly taskType: string;
}

export type EmergencyTakeoverDomainVerdict =
  | { readonly allowed: true; readonly movementActive: boolean }
  | {
      readonly allowed: false;
      readonly reason: "INVALID_LIFECYCLE" | "INVALID_OWNER";
    };

/**
 * Pure lifecycle guard. Caller must separately hold Session/Task locks,
 * authorize actor and replacement, and compare both persisted versions.
 */
export function classifyEmergencyTakeoverDomain(
  input: EmergencyTakeoverDomainInput,
): EmergencyTakeoverDomainVerdict {
  if (
    input.currentAssigneeMembershipId === null ||
    input.currentAssigneeMembershipId === input.replacementAssigneeMembershipId
  ) {
    return { allowed: false, reason: "INVALID_OWNER" };
  }
  if (input.taskStatus !== "IN_PROGRESS") {
    return { allowed: false, reason: "INVALID_LIFECYCLE" };
  }
  if (input.taskType === "PARKING" && input.sessionState === "PARKING") {
    return { allowed: true, movementActive: true };
  }
  if (
    input.taskType === "RETRIEVAL" &&
    input.retrievalRequestStatus === "ACCEPTED"
  ) {
    if (input.sessionState === "RETRIEVING") {
      return { allowed: true, movementActive: true };
    }
    if (
      input.sessionState === "READY" ||
      input.sessionState === "HANDOFF_PENDING"
    ) {
      return { allowed: true, movementActive: false };
    }
  }
  return { allowed: false, reason: "INVALID_LIFECYCLE" };
}
