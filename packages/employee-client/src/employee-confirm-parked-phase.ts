import type {
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
} from "@valet/contracts";
import type {
  EmployeeConfirmParkedConflict,
  EmployeeConfirmParkedPhase,
  EmployeeConfirmParkedSnapshot,
} from "./employee-confirm-parked-types";

export function hasCurrentParkingSpotValidation(
  snapshot: EmployeeConfirmParkedSnapshot,
  task: StaffTaskQueueItem,
  session: StaffValetSessionDetailResponse,
): boolean {
  const proof = snapshot.parkingSpotValidation;
  return (
    proof !== null &&
    proof.available === true &&
    proof.sessionId === session.sessionId &&
    proof.taskId === task.taskId &&
    proof.sessionVersion === session.version &&
    proof.taskVersion === task.version &&
    proof.parkingSpotCode === snapshot.parkingSpotCandidate &&
    (snapshot.parkingSpotResourceId === null ||
      proof.parkingSpotId === snapshot.parkingSpotResourceId)
  );
}

export function phaseAfterActiveRead(
  previous: EmployeeConfirmParkedPhase,
  conflict: EmployeeConfirmParkedConflict | null,
  validated: boolean,
  slot: string,
): EmployeeConfirmParkedPhase {
  if (!validated || conflict === "spot" || previous === "loading")
    return "spot";
  if (conflict === "slot") return "slot";
  return slot === "" ? "slot" : "ready";
}

export function backgroundConfirmParkedSnapshot(
  snapshot: EmployeeConfirmParkedSnapshot,
  protectedOutcome: boolean,
): EmployeeConfirmParkedSnapshot {
  return {
    ...snapshot,
    parkingSpotValidation: null,
    parkingSpotValidationPending: false,
    ...(protectedOutcome
      ? { failure: null, phase: "ambiguous" as const }
      : snapshot.phase === "slot" || snapshot.phase === "ready"
        ? {
            phase: "spot" as const,
            keySlotCandidate: "",
            keySlotResourceId: null,
          }
        : {}),
  };
}
