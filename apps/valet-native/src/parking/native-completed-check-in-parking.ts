import type {
  EmployeeOperationalScope,
  EmployeeOperationalSession,
  EmployeeParkingStartSnapshot,
  EmployeeParkingStartSession,
} from "@valet/employee-client";
import { isSameEmployeeOperationalScope } from "@valet/employee-client";

export async function openCompletedCheckInParking(input: {
  readonly identityGeneration: number;
  readonly operations: EmployeeOperationalSession;
  readonly parking: EmployeeParkingStartSession;
  readonly scope: EmployeeOperationalScope;
  readonly sessionId: string;
}): Promise<boolean> {
  try {
    if (!hasCurrentAuthority(input)) return false;
    const held = input.parking.current();
    if (held.phase === "started" && isHeldStarted(held, input)) return true;
    const opening = input.parking.openCompletedCheckIn(
      input.identityGeneration,
      input.scope,
      input.sessionId,
    );
    const revision = input.parking.workflowRevision?.();
    await opening;
    if (revision !== input.parking.workflowRevision?.()) return false;
    let snapshot = input.parking.current();
    if (isHeldStarted(snapshot, input)) return true;
    const task = snapshot.task;
    if (snapshot.phase === "assigned" && task !== null) {
      await input.operations.refreshQueue();
      if (
        revision !== input.parking.workflowRevision?.() ||
        !hasCurrentAuthority(input)
      )
        return false;
      await input.operations.acceptTask(task.taskId);
      if (revision !== input.parking.workflowRevision?.()) return false;
      await input.parking.checkServerState();
      snapshot = input.parking.current();
    }
    return (
      revision === input.parking.workflowRevision?.() &&
      isHeldStarted(snapshot, input)
    );
  } catch {
    return false;
  }
}

function isHeldStarted(
  snapshot: EmployeeParkingStartSnapshot,
  input: Parameters<typeof openCompletedCheckInParking>[0],
) {
  const scope = snapshot.scope;
  return (
    hasCurrentAuthority(input) &&
    isReadyParkingSession(snapshot, input.sessionId) &&
    snapshot.identityGeneration === input.identityGeneration &&
    scope !== null &&
    scope.role === input.scope.role &&
    isSameEmployeeOperationalScope(scope, input.scope)
  );
}

function hasCurrentAuthority(
  input: Parameters<typeof openCompletedCheckInParking>[0],
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

function isReadyParkingSession(
  snapshot: EmployeeParkingStartSnapshot,
  sessionId: string,
) {
  return (
    (snapshot.phase === "started" || snapshot.phase === "accepted") &&
    snapshot.session?.sessionId === sessionId &&
    snapshot.task?.sessionId === sessionId
  );
}

type StartInput = Parameters<typeof openCompletedCheckInParking>[0];
const launches = new WeakMap<
  object,
  { readonly identity: string; readonly operation: Promise<boolean> }
>();

export function launchCompletedCheckInParking(
  input: StartInput & {
    readonly clearCheckIn: () => void;
    readonly navigateParking: () => void;
  },
): Promise<boolean> {
  const key = input.parking as object;
  const identity = [
    input.identityGeneration,
    input.sessionId,
    input.scope.organizationId,
    input.scope.locationId,
    input.scope.membershipId,
    input.scope.shiftId,
    input.scope.role,
  ].join(":");
  const active = launches.get(key);
  if (active !== undefined)
    return active.identity === identity
      ? active.operation
      : Promise.resolve(false);
  const operation = (async () => {
    const started = await openCompletedCheckInParking(input);
    if (!started) return false;
    input.clearCheckIn();
    input.navigateParking();
    return true;
  })().finally(() => {
    if (launches.get(key)?.operation === operation) launches.delete(key);
  });
  launches.set(key, { identity, operation });
  return operation;
}
