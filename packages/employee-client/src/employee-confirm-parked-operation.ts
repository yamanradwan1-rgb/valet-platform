import { EmployeeApiError } from "./api-error";
import {
  isActiveParkingCanonical,
  reconcileConfirmParkedSnapshot,
  type EmployeeConfirmParkedTarget,
} from "./employee-confirm-parked-state";
import type {
  EmployeeConfirmParkedConflict,
  EmployeeConfirmParkedPhase,
  EmployeeConfirmParkedSnapshot,
  EmployeeConfirmParkedSuccess,
  EmployeeConfirmParkedTransport,
} from "./employee-confirm-parked-types";

export interface EmployeeConfirmParkedAttempt {
  readonly expectedSessionVersion: number;
  readonly expectedTaskVersion: number;
  readonly keySlotCode: string;
  readonly keySlotId: string | null;
  readonly parkingSpotCode: string;
  readonly parkingSpotId: string | null;
  readonly target: EmployeeConfirmParkedTarget;
}

export function createConfirmParkedAttempt(
  snapshot: EmployeeConfirmParkedSnapshot,
  target: EmployeeConfirmParkedTarget | null,
): EmployeeConfirmParkedAttempt | null {
  if (
    target === null ||
    snapshot.session === null ||
    snapshot.task === null ||
    snapshot.phase !== "ready" ||
    !isActiveParkingCanonical(target, snapshot.task, snapshot.session)
  ) {
    return null;
  }
  return {
    expectedSessionVersion: snapshot.session.version,
    expectedTaskVersion: snapshot.task.version,
    keySlotCode: snapshot.keySlotCandidate,
    keySlotId: snapshot.keySlotResourceId,
    parkingSpotCode: snapshot.parkingSpotCandidate,
    parkingSpotId: snapshot.parkingSpotResourceId,
    target,
  };
}

export function confirmParkedAttemptMatches(
  snapshot: EmployeeConfirmParkedSnapshot,
  attempt: EmployeeConfirmParkedAttempt,
): boolean {
  return (
    snapshot.phase === "submitting" &&
    snapshot.session?.version === attempt.expectedSessionVersion &&
    snapshot.task?.version === attempt.expectedTaskVersion &&
    snapshot.keySlotCandidate === attempt.keySlotCode &&
    snapshot.keySlotResourceId === attempt.keySlotId &&
    snapshot.parkingSpotCandidate === attempt.parkingSpotCode &&
    snapshot.parkingSpotResourceId === attempt.parkingSpotId
  );
}

export async function executeConfirmParkedOperation(
  transport: EmployeeConfirmParkedTransport,
  attempt: EmployeeConfirmParkedAttempt,
): Promise<EmployeeConfirmParkedSuccess> {
  const response = await transport.confirmParked(attempt.target.sessionId, {
    expectedSessionVersion: attempt.expectedSessionVersion,
    expectedTaskVersion: attempt.expectedTaskVersion,
    keySlotCode: attempt.keySlotCode,
    ...(attempt.keySlotId === null ? {} : { keySlotId: attempt.keySlotId }),
    parkingSpotCode: attempt.parkingSpotCode,
    ...(attempt.parkingSpotId === null
      ? {}
      : { parkingSpotId: attempt.parkingSpotId }),
  });
  if (
    response.sessionId !== attempt.target.sessionId ||
    response.taskId !== attempt.target.taskId ||
    response.parkingSpotCode !== attempt.parkingSpotCode ||
    response.sessionVersion !== attempt.expectedSessionVersion + 1 ||
    response.taskVersion !== attempt.expectedTaskVersion + 1
  ) {
    throw new EmployeeApiError({
      code: "CONFIRM_PARKED_RESPONSE_MISMATCH",
      message: "The Confirm Parked result did not match the current work.",
      status: 502,
    });
  }
  return {
    keySlotCode: attempt.keySlotCode,
    response,
    source: "command",
  };
}

export async function loadConfirmParkedCanonical(
  transport: EmployeeConfirmParkedTransport,
  snapshot: EmployeeConfirmParkedSnapshot,
  target: EmployeeConfirmParkedTarget,
  previous: EmployeeConfirmParkedPhase,
  conflict: EmployeeConfirmParkedConflict | null,
): Promise<EmployeeConfirmParkedSnapshot> {
  const [queue, session] = await Promise.all([
    transport.loadTaskQueue(target.locationId),
    transport.loadSession(target.sessionId),
  ]);
  return reconcileConfirmParkedSnapshot(
    snapshot,
    target,
    queue,
    session,
    previous,
    conflict,
  );
}
