import type {
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
} from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import { isAmbiguousMutationFailure } from "./employee-operational-recovery";
import type { EmployeeOperationalScope } from "./employee-operational-types";
import type {
  EmployeeHandoffPhase,
  EmployeeHandoffSnapshot,
  EmployeeHandoffTransport,
} from "./employee-handoff-flow-types";

export interface EmployeeHandoffTarget {
  readonly identityGeneration: number;
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly role: EmployeeOperationalScope["role"];
  readonly sessionId: string;
  readonly shiftId: string;
  taskId: string;
}

const reconciliationCodes = new Set([
  "HANDOFF_VERIFICATION_ALREADY_VERIFIED",
  "HANDOFF_VERIFICATION_NOT_ACTIVE",
  "INVALID_STATE_TRANSITION",
  "RETRIEVAL_REQUEST_NOT_READY",
  "TASK_INVALID_STATE",
  "TASK_NOT_FOUND_OR_FORBIDDEN",
  "VERSION_CONFLICT",
]);

export function emptyHandoffSnapshot(
  identityGeneration: number | null = null,
  scope: EmployeeOperationalScope | null = null,
  phase: EmployeeHandoffPhase = "inactive",
): EmployeeHandoffSnapshot {
  return {
    failure: null,
    identityGeneration,
    phase,
    scope,
    session: null,
    task: null,
  };
}

export function isHandoffBusy(phase: EmployeeHandoffPhase): boolean {
  return [
    "aborting",
    "initiating",
    "overriding",
    "reconciling",
    "verifying",
  ].includes(phase);
}

export function isHandoffTargetCurrent(
  snapshot: EmployeeHandoffSnapshot,
  target: EmployeeHandoffTarget,
): boolean {
  return (
    snapshot.identityGeneration === target.identityGeneration &&
    snapshot.scope?.organizationId === target.organizationId &&
    snapshot.scope.membershipId === target.membershipId &&
    snapshot.scope.locationId === target.locationId &&
    snapshot.scope.shiftId === target.shiftId &&
    snapshot.scope.role === target.role
  );
}

export function sameHandoffTaskAuthority(
  current: StaffTaskQueueItem,
  observed: StaffTaskQueueItem | undefined,
) {
  return (
    observed !== undefined &&
    observed.taskId === current.taskId &&
    observed.sessionId === current.sessionId &&
    observed.currentAssigneeMembershipId ===
      current.currentAssigneeMembershipId &&
    observed.status === current.status &&
    observed.version === current.version &&
    observed.valetSessionState === current.valetSessionState &&
    observed.valetSessionVersion === current.valetSessionVersion
  );
}

export function classifyHandoffCanonical(
  target: EmployeeHandoffTarget,
  task: StaffTaskQueueItem | undefined,
  session: StaffValetSessionDetailResponse,
): EmployeeHandoffPhase {
  const owner =
    task?.currentAssigneeMembershipId === target.membershipId &&
    (target.role === "VALET_EMPLOYEE" || target.role === "VALET_SUPERVISOR");
  const supervisor = target.role === "VALET_SUPERVISOR";
  if (
    !task ||
    task.taskType !== "RETRIEVAL" ||
    task.status !== "IN_PROGRESS" ||
    task.currentAssigneeMembershipId === null ||
    task.sessionId !== target.sessionId ||
    session.sessionId !== target.sessionId ||
    session.locationId !== target.locationId ||
    task.valetSessionState !== session.state ||
    task.valetSessionVersion !== session.version
  )
    return "conflict";
  if (session.state === "READY") {
    return owner &&
      session.handoff.pendingAt === null &&
      session.handoff.verification === null
      ? "ready"
      : "conflict";
  }
  if (
    session.state !== "HANDOFF_PENDING" ||
    (!owner && !supervisor) ||
    session.handoff.pendingAt === null
  )
    return "conflict";
  const verification = session.handoff.verification;
  if (verification?.status === "VERIFIED") {
    return verification.verifiedAt === null ? "conflict" : "verified";
  }
  return verification === null ||
    (verification.status === "PENDING" && verification.verifiedAt === null)
    ? "pending"
    : "conflict";
}

export function handoffFailureKind(
  error: unknown,
): "ambiguous" | "reconcile" | "unavailable" {
  if (isAmbiguousMutationFailure(error)) return "ambiguous";
  return error instanceof EmployeeApiError &&
    reconciliationCodes.has(error.code)
    ? "reconcile"
    : "unavailable";
}

export async function loadHandoffCanonical(
  transport: EmployeeHandoffTransport,
  target: EmployeeHandoffTarget,
  scope: EmployeeOperationalScope,
): Promise<EmployeeHandoffSnapshot> {
  const [queue, session] = await Promise.all([
    transport.loadTaskQueue(target.locationId),
    transport.loadSession(target.sessionId),
  ]);
  const task = queue.tasks.find(
    (item) =>
      item.taskId === target.taskId &&
      item.sessionId === target.sessionId &&
      item.taskType === "RETRIEVAL",
  );
  return {
    failure: null,
    identityGeneration: target.identityGeneration,
    phase: classifyHandoffCanonical(target, task, session),
    scope,
    session,
    task: task ?? null,
  };
}
