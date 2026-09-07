import {
  ConditionNoteReplayFence,
  isCheckInSessionConflict,
} from "./employee-check-in-condition-note-fence";
import {
  reconcileConditionOutcome,
  type ConditionRecoveryAttempt,
} from "./employee-check-in-condition-recovery";
import { EmployeeCheckInCorrectionSession } from "./employee-check-in-correction-session";
import type {
  EmployeeCheckInAuthoritativeSession,
  EmployeeCheckInConditionSelection,
  EmployeeCheckInRecoverable,
} from "./employee-check-in-types";
import {
  isAmbiguousMutationFailure,
  operationalFailure,
} from "./employee-operational-recovery";

export abstract class EmployeeCheckInConditionSession extends EmployeeCheckInCorrectionSession {
  private readonly noteReplayFence = new ConditionNoteReplayFence();

  async submitConditionCompletion(): Promise<void> {
    const active = this.mutableActive();
    const continuation = this.snapshot.continuation;
    if (active === null || continuation.mode !== "select-condition") return;
    if (this.continuationBusy()) return;
    const selection = continuation.conditionSelection ?? "No visible issue";
    const attempt = this.createConditionAttempt(active, selection);
    this.publish({
      ...this.snapshot,
      continuation: {
        ...continuation,
        mode: "submitting",
        pendingConditionSelection: selection,
        pendingConditionStage: "note",
      },
      error: null,
    });
    try {
      if (!(await this.appendProtectedNote(attempt, active))) return;
      const current = await this.completeConditionMarker(attempt, active);
      if (current === null) return;
      this.publish({
        ...this.snapshot,
        continuation: {
          ...this.snapshot.continuation,
          pendingConditionStage: "completion",
        },
      });
      const completed = await this.options.transport.completeCheckIn(
        attempt.sessionId,
        { expectedVersion: attempt.expectedVersion },
      );
      if (!this.conditionAttemptIsCurrent(attempt)) return;
      if (completed.valetSessionId !== attempt.sessionId) {
        throw new Error("Completion response did not match the session.");
      }
      this.noteReplayFence.clear();
      this.publishConditionSuccess(current, completed.version);
    } catch (error) {
      await this.handleConditionFailure(attempt, error);
    }
  }

  retryConditionRecovery(): Promise<void> {
    const pending = this.snapshot.continuation.pendingConditionSelection;
    const active = this.mutableActive();
    if (pending === null || active === null) return Promise.resolve();
    if (this.snapshot.continuation.mode !== "ambiguous") {
      return Promise.resolve();
    }
    return this.reconcileCondition(
      this.createConditionAttempt(active, pending),
      pending,
    );
  }

  activate(
    identityGeneration: number,
    locationId: string,
    workflowOwner = locationId,
  ): Promise<void> {
    if (
      this.snapshot.identityGeneration !== identityGeneration ||
      this.snapshot.locationId !== locationId ||
      this.workflowOwner !== workflowOwner
    ) {
      this.noteReplayFence.clear();
    }
    return super.activate(identityGeneration, locationId, workflowOwner);
  }

  clear(): void {
    this.noteReplayFence.clear();
    super.clear();
  }

  startNew(): void {
    this.noteReplayFence.clear();
    super.startNew();
  }

  resume(recoverable: EmployeeCheckInRecoverable): Promise<void> {
    if (this.snapshot.active?.sessionId !== recoverable.value.sessionId) {
      this.noteReplayFence.clear();
    }
    return super.resume(recoverable);
  }

  protected abstract mutableActive(): EmployeeCheckInAuthoritativeSession | null;

  private async appendProtectedNote(
    attempt: ConditionRecoveryAttempt,
    active: EmployeeCheckInAuthoritativeSession,
  ): Promise<boolean> {
    if (
      active.conditionCompletedAt !== null ||
      this.noteReplayFence.protects(attempt)
    ) {
      return true;
    }
    try {
      await this.options.transport.createConditionNote(attempt.sessionId, {
        content: attempt.selection,
      });
    } catch (error) {
      if (
        isAmbiguousMutationFailure(error) &&
        this.conditionAttemptIsCurrent(attempt)
      ) {
        this.noteReplayFence.protect(attempt);
      }
      throw error;
    }
    if (!this.conditionAttemptIsCurrent(attempt)) return false;
    this.noteReplayFence.protect(attempt);
    return true;
  }

  private async completeConditionMarker(
    attempt: ConditionRecoveryAttempt,
    active: EmployeeCheckInAuthoritativeSession,
  ): Promise<EmployeeCheckInAuthoritativeSession | null> {
    if (active.conditionCompletedAt !== null) return active;
    const marker = await this.options.transport.completeCondition(
      attempt.sessionId,
    );
    if (!this.conditionAttemptIsCurrent(attempt)) return null;
    return { ...active, conditionCompletedAt: marker.completedAt };
  }

  private publishConditionSuccess(
    active: EmployeeCheckInAuthoritativeSession,
    version: number,
  ): void {
    this.publish({
      ...this.snapshot,
      active: { ...active, state: "AWAITING_PARKING", version },
      continuation: {
        ...this.snapshot.continuation,
        mode: "condition-completed",
        pendingConditionSelection: null,
        pendingConditionStage: null,
      },
      error: null,
      phase: "continuation",
    });
  }

  private createConditionAttempt(
    active: EmployeeCheckInAuthoritativeSession,
    selection: EmployeeCheckInConditionSelection,
  ): ConditionRecoveryAttempt {
    if (
      this.snapshot.identityGeneration === null ||
      this.snapshot.locationId === null ||
      this.workflowOwner === null
    ) {
      throw new Error("Authoritative check-in context is unavailable.");
    }
    return {
      expectedVersion: active.version,
      identityGeneration: this.snapshot.identityGeneration,
      locationId: this.snapshot.locationId,
      request: ++this.sequence,
      selection,
      sessionId: active.sessionId,
      workflowOwner: this.workflowOwner,
    };
  }

  private conditionAttemptIsCurrent(
    attempt: ConditionRecoveryAttempt,
  ): boolean {
    const active = this.snapshot.active;
    return (
      this.isCurrent(attempt.request) &&
      this.snapshot.identityGeneration === attempt.identityGeneration &&
      this.snapshot.locationId === attempt.locationId &&
      this.workflowOwner === attempt.workflowOwner &&
      active?.sessionId === attempt.sessionId &&
      (this.snapshot.continuation.mode !== "submitting" ||
        active.version === attempt.expectedVersion)
    );
  }

  private async handleConditionFailure(
    attempt: ConditionRecoveryAttempt,
    error: unknown,
  ): Promise<void> {
    if (!this.conditionAttemptIsCurrent(attempt)) return;
    if (isAmbiguousMutationFailure(error)) {
      await this.reconcileCondition(attempt, attempt.selection, error);
      return;
    }
    if (isCheckInSessionConflict(error)) {
      await this.reconcileCondition(attempt, attempt.selection, error);
      return;
    }
    this.publish({
      ...this.snapshot,
      continuation: {
        ...this.snapshot.continuation,
        mode: "select-condition",
        pendingConditionSelection: null,
        pendingConditionStage: null,
      },
      error: operationalFailure(error),
    });
  }

  private async reconcileCondition(
    attempt: ConditionRecoveryAttempt,
    selection: EmployeeCheckInConditionSelection,
    originalError?: unknown,
  ): Promise<void> {
    this.publish({
      ...this.snapshot,
      continuation: {
        ...this.snapshot.continuation,
        mode: "reconciling",
        pendingConditionSelection: selection,
      },
      error: null,
    });
    const outcome = await reconcileConditionOutcome(
      this.options.transport,
      attempt,
    );
    if (!this.conditionAttemptIsCurrent(attempt)) return;
    if (outcome.kind === "READ_FAILED") {
      this.publish({
        ...this.snapshot,
        continuation: {
          ...this.snapshot.continuation,
          mode: "ambiguous",
          pendingConditionSelection: selection,
        },
        error: outcome.failure,
      });
      return;
    }
    if (outcome.result.completed) {
      this.noteReplayFence.clear();
      this.publish({
        ...this.snapshot,
        active: outcome.result.active,
        continuation: {
          ...this.snapshot.continuation,
          mode: "condition-completed",
          pendingConditionSelection: null,
          pendingConditionStage: null,
        },
        error: null,
        phase: "continuation",
      });
      return;
    }
    this.publish({
      ...this.snapshot,
      active: outcome.result.active,
      continuation: {
        ...this.snapshot.continuation,
        mode: "select-condition",
        pendingConditionSelection: null,
        pendingConditionStage: null,
      },
      error:
        originalError === undefined
          ? {
              code: "CONDITION_COMPLETION_UNRESOLVED",
              message:
                "The previous condition attempt did not complete. The recorded note was preserved; confirm the condition to finish check-in.",
            }
          : operationalFailure(originalError),
    });
  }
}
