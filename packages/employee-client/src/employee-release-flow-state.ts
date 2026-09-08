import type {
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
} from "@valet/contracts";

import type { EmployeeOperationalScope } from "./employee-operational-types";
import type {
  EmployeeReleasePhase,
  EmployeeReleaseSnapshot,
  EmployeeReleaseTransport,
} from "./employee-release-flow-types";

export interface EmployeeReleaseTarget {
  readonly identityGeneration: number;
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly role: EmployeeOperationalScope["role"];
  readonly sessionId: string;
  readonly shiftId: string;
  readonly taskId: string;
}

export function emptyReleaseSnapshot(
  identityGeneration: number | null = null,
  scope: EmployeeOperationalScope | null = null,
  phase: EmployeeReleasePhase = "inactive",
): EmployeeReleaseSnapshot {
  return {
    block: null,
    completion: null,
    failure: null,
    identityGeneration,
    phase,
    releaseRequiresPayment: null,
    releaseSatisfied: null,
    scope,
    session: null,
    task: null,
  };
}

export function isReleaseTargetCurrent(
  snapshot: EmployeeReleaseSnapshot,
  target: EmployeeReleaseTarget,
) {
  return (
    snapshot.identityGeneration === target.identityGeneration &&
    snapshot.scope?.organizationId === target.organizationId &&
    snapshot.scope.membershipId === target.membershipId &&
    snapshot.scope.locationId === target.locationId &&
    snapshot.scope.shiftId === target.shiftId &&
    snapshot.scope.role === target.role
  );
}

export function sameReleaseTaskAuthority(
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

function validSession(
  target: EmployeeReleaseTarget,
  session: StaffValetSessionDetailResponse,
) {
  return (
    session.sessionId === target.sessionId &&
    session.locationId === target.locationId
  );
}

export async function loadReleaseCanonical(
  transport: EmployeeReleaseTransport,
  target: EmployeeReleaseTarget,
  scope: EmployeeOperationalScope,
): Promise<EmployeeReleaseSnapshot> {
  const session = await transport.loadSession(target.sessionId);
  const base = {
    ...emptyReleaseSnapshot(target.identityGeneration, scope),
    session,
  };
  if (!validSession(target, session)) return { ...base, phase: "conflict" };
  if (session.state === "COMPLETED") {
    return { ...base, phase: "released" };
  }
  if (
    session.state !== "HANDOFF_PENDING" ||
    session.handoff.pendingAt === null ||
    session.handoff.verification?.status !== "VERIFIED" ||
    session.handoff.verification.verifiedAt === null
  ) {
    return { ...base, block: "verification", phase: "blocked" };
  }
  const queue = await transport.loadTaskQueue(target.locationId);
  const task = queue.tasks.find(
    (item) =>
      item.taskId === target.taskId && item.sessionId === target.sessionId,
  );
  const withTask = { ...base, task: task ?? null };
  if (
    !task ||
    task.taskType !== "RETRIEVAL" ||
    task.status !== "IN_PROGRESS" ||
    task.valetSessionState !== session.state ||
    task.valetSessionVersion !== session.version
  ) {
    return { ...withTask, phase: "conflict" };
  }
  if (task.currentAssigneeMembershipId !== target.membershipId) {
    return { ...withTask, block: "authority", phase: "blocked" };
  }
  const financial = await transport.loadPayment(target.sessionId);
  const projected = {
    ...withTask,
    releaseRequiresPayment: financial.releaseRequiresPayment,
    releaseSatisfied: financial.releaseSatisfied,
  };
  return financial.releaseSatisfied
    ? { ...projected, phase: "ready" }
    : { ...projected, block: "financial", phase: "blocked" };
}
