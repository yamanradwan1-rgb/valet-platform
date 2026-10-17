import type {
  EmployeeOperationalScope,
  EmployeeOperationalSession,
  EmployeeParkingStartSession,
  EmployeeRetrievalSession,
  StaffTaskQueueItem,
} from "@valet/employee-client";
import { isSameEmployeeOperationalScope } from "@valet/employee-client";

export type NativeTaskActionResult =
  | { readonly kind: "denied" }
  | { readonly kind: "failed" }
  | {
      readonly kind: "navigate";
      readonly destination: "parking" | "retrieval";
    };

export async function executeNativeTaskAction(input: {
  readonly identityGeneration: number;
  readonly operations: EmployeeOperationalSession;
  readonly parking: EmployeeParkingStartSession;
  readonly retrieval: EmployeeRetrievalSession;
  readonly scope: EmployeeOperationalScope;
  readonly task: StaffTaskQueueItem;
  readonly isEntryCurrent?: () => boolean;
}): Promise<NativeTaskActionResult> {
  if (!isEntryCurrent(input) || !hasCurrentAuthority(input)) return { kind: "denied" };
  const initial = currentTask(input.operations, input.task, false);
  if (initial === null || assignedToOther(initial, input.scope.membershipId)) {
    return { kind: "denied" };
  }

  if (initial.taskType === "PARKING") {
    return executeParkingAction(input, initial);
  }

  if (initial.status === "QUEUED" || initial.status === "ASSIGNED") {
    await input.operations.acceptTask(initial.taskId);
  }
  if (!isEntryCurrent(input) || !hasCurrentAuthority(input))
    return { kind: "failed" };

  const task = currentTask(input.operations, initial);
  if (
    task === null ||
    assignedToOther(task, input.scope.membershipId) ||
    (task.status !== "ACCEPTED" && task.status !== "IN_PROGRESS")
  ) {
    return { kind: "failed" };
  }

  if (task.valetSessionState === "HANDOFF_PENDING") {
    return { kind: "navigate", destination: "retrieval" };
  }
  if (!isEntryCurrent(input)) return { kind: "failed" };
  await input.retrieval.openQueueTask(
    input.identityGeneration,
    input.scope,
    task.taskId,
    task.sessionId,
  );
  if (!isEntryCurrent(input) || !hasCurrentAuthority(input))
    return { kind: "failed" };
  const phase = input.retrieval.current().phase;
  return phase === "key-checkout" || phase === "retrieving" || phase === "ready"
    ? { kind: "navigate", destination: "retrieval" }
    : { kind: "failed" };
}

function isEntryCurrent(input: Parameters<typeof executeNativeTaskAction>[0]) {
  return input.isEntryCurrent?.() !== false;
}

async function executeParkingAction(
  input: Parameters<typeof executeNativeTaskAction>[0],
  initial: StaffTaskQueueItem,
): Promise<NativeTaskActionResult> {
  const opening = input.parking.openQueueTask(
    input.identityGeneration,
    input.scope,
    initial.taskId,
    initial.sessionId,
  );
  const revision = input.parking.workflowRevision?.();
  await opening;
  if (revision !== input.parking.workflowRevision?.())
    return { kind: "failed" };
  if (!hasCurrentAuthority(input)) return { kind: "failed" };
  if (initial.status === "QUEUED" || initial.status === "ASSIGNED") {
    if (input.parking.current().phase !== "assigned") return { kind: "failed" };
    await input.operations.acceptTask(initial.taskId);
    if (revision !== input.parking.workflowRevision?.())
      return { kind: "failed" };
    if (!hasCurrentAuthority(input)) return { kind: "failed" };
    const accepted = currentTask(input.operations, initial);
    if (
      accepted === null ||
      assignedToOther(accepted, input.scope.membershipId) ||
      accepted.status !== "ACCEPTED"
    )
      return { kind: "failed" };
    await input.parking.checkServerState();
  }
  const phase = input.parking.current().phase;
  const parked = input.parking.current();
  return revision === input.parking.workflowRevision?.() &&
    hasCurrentAuthority(input) &&
    parked.identityGeneration === input.identityGeneration &&
    parked.session?.sessionId === initial.sessionId &&
    parked.task?.taskId === initial.taskId &&
    parked.scope !== null &&
    isSameEmployeeOperationalScope(parked.scope, input.scope) &&
    (phase === "accepted" || phase === "started")
    ? { kind: "navigate", destination: "parking" }
    : { kind: "failed" };
}

function hasCurrentAuthority(
  input: Parameters<typeof executeNativeTaskAction>[0],
) {
  const current = input.operations.current();
  return (
    current.phase === "ready" &&
    current.identityGeneration === input.identityGeneration &&
    current.scope !== null &&
    current.scope.role === input.scope.role &&
    isSameEmployeeOperationalScope(current.scope, input.scope)
  );
}

function currentTask(
  operations: EmployeeOperationalSession,
  expected: StaffTaskQueueItem,
  allowAdvancedVersion = true,
): StaffTaskQueueItem | null {
  const snapshot = operations.current();
  if (snapshot.phase !== "ready" || snapshot.scope === null) return null;
  const task = snapshot.tasks.find((item) => item.taskId === expected.taskId);
  if (task === undefined || task.sessionId !== expected.sessionId) return null;
  if (
    task.version < expected.version ||
    (!allowAdvancedVersion && task.version !== expected.version)
  )
    return null;
  return task;
}

function assignedToOther(task: StaffTaskQueueItem, membershipId: string) {
  return (
    task.currentAssigneeMembershipId !== null &&
    task.currentAssigneeMembershipId !== membershipId
  );
}
