import type {
  EmployeeOperationalScope,
  EmployeeOperationalSession,
  EmployeeParkingStartSnapshot,
  EmployeeParkingStartSession,
} from "@valet/employee-client";

export async function startCompletedCheckInParking(input: {
  readonly identityGeneration: number;
  readonly operations: EmployeeOperationalSession;
  readonly parking: EmployeeParkingStartSession;
  readonly scope: EmployeeOperationalScope;
  readonly sessionId: string;
}): Promise<boolean> {
  try {
    const held = input.parking.current();
    if (isHeldStarted(held, input)) return true;
    await input.parking.openCompletedCheckIn(
      input.identityGeneration,
      input.scope,
      input.sessionId,
    );
    let snapshot = input.parking.current();
    if (isStartedSession(snapshot, input.sessionId)) return true;
    const task = snapshot.task;
    if (snapshot.phase === "assigned" && task !== null) {
      await input.operations.refreshQueue();
      await input.operations.acceptTask(task.taskId);
      await input.parking.checkServerState();
      snapshot = input.parking.current();
    }
    if (snapshot.phase === "accepted") {
      await input.parking.startParking();
      snapshot = input.parking.current();
    }
    return isStartedSession(snapshot, input.sessionId);
  } catch {
    return false;
  }
}

function isHeldStarted(
  snapshot: EmployeeParkingStartSnapshot,
  input: Parameters<typeof startCompletedCheckInParking>[0],
) {
  const scope = snapshot.scope;
  return (
    isStartedSession(snapshot, input.sessionId) &&
    snapshot.identityGeneration === input.identityGeneration &&
    scope?.organizationId === input.scope.organizationId &&
    scope?.locationId === input.scope.locationId &&
    scope?.membershipId === input.scope.membershipId &&
    scope?.shiftId === input.scope.shiftId
  );
}

function isStartedSession(
  snapshot: EmployeeParkingStartSnapshot,
  sessionId: string,
) {
  return (
    snapshot.phase === "started" &&
    snapshot.session?.sessionId === sessionId &&
    snapshot.task?.sessionId === sessionId
  );
}

type StartInput = Parameters<typeof startCompletedCheckInParking>[0];
const launches = new WeakMap<object, Promise<boolean>>();

export function launchCompletedCheckInParking(
  input: StartInput & {
    readonly clearCheckIn: () => void;
    readonly navigateParking: () => void;
  },
): Promise<boolean> {
  const key = input.parking as object;
  const active = launches.get(key);
  if (active !== undefined) return active;
  const operation = (async () => {
    const started = await startCompletedCheckInParking(input);
    if (!started) return false;
    input.clearCheckIn();
    input.navigateParking();
    return true;
  })().finally(() => {
    if (launches.get(key) === operation) launches.delete(key);
  });
  launches.set(key, operation);
  return operation;
}
