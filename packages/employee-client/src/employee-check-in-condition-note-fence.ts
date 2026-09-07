import { EmployeeApiError } from "./api-error";
import type { ConditionRecoveryAttempt } from "./employee-check-in-condition-recovery";

type ProtectedConditionNote = Pick<
  ConditionRecoveryAttempt,
  | "identityGeneration"
  | "locationId"
  | "selection"
  | "sessionId"
  | "workflowOwner"
>;

export class ConditionNoteReplayFence {
  private protectedNotes: ReadonlyArray<ProtectedConditionNote> = [];

  clear(): void {
    this.protectedNotes = [];
  }

  protects(attempt: ConditionRecoveryAttempt): boolean {
    return this.protectedNotes.some(
      (note) =>
        note.identityGeneration === attempt.identityGeneration &&
        note.locationId === attempt.locationId &&
        note.workflowOwner === attempt.workflowOwner &&
        note.sessionId === attempt.sessionId &&
        note.selection === attempt.selection,
    );
  }

  protect(attempt: ConditionRecoveryAttempt): void {
    if (this.protects(attempt)) return;
    this.protectedNotes = [
      ...this.protectedNotes,
      {
        identityGeneration: attempt.identityGeneration,
        locationId: attempt.locationId,
        selection: attempt.selection,
        sessionId: attempt.sessionId,
        workflowOwner: attempt.workflowOwner,
      },
    ];
  }
}

export function isCheckInSessionConflict(error: unknown): boolean {
  return (
    error instanceof EmployeeApiError &&
    (error.code === "VERSION_CONFLICT" ||
      error.code === "INVALID_STATE_TRANSITION")
  );
}
