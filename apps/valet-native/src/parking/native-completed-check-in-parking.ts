import type {
  EmployeeOperationalScope,
  EmployeeOperationalSession,
  EmployeeParkingStartSession,
} from "@valet/employee-client";

export async function startCompletedCheckInParking(input: {
  readonly identityGeneration: number;
  readonly operations: EmployeeOperationalSession;
  readonly parking: EmployeeParkingStartSession;
  readonly scope: EmployeeOperationalScope;
  readonly sessionId: string;
}) {
  await input.parking.openCompletedCheckIn(
    input.identityGeneration,
    input.scope,
    input.sessionId,
  );
  let snapshot = input.parking.current();
  const task = snapshot.task;
  if (snapshot.phase === "assigned" && task !== null) {
    await input.operations.refreshQueue();
    await input.operations.acceptTask(task.taskId);
    await input.parking.checkServerState();
    snapshot = input.parking.current();
  }
  if (snapshot.phase === "accepted") await input.parking.startParking();
}
