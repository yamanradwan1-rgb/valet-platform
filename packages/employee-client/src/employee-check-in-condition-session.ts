import { EmployeeApiError } from "./api-error";
import {
  reconcileConditionOutcome,
  type ConditionRecoveryAttempt,
} from "./employee-check-in-condition-recovery";
import { EmployeeCheckInCorrectionSession } from "./employee-check-in-correction-session";
import type {
  EmployeeCheckInAuthoritativeSession,
  EmployeeCheckInConditionSelection,
} from "./employee-check-in-types";
import {
  isAmbiguousMutationFailure,
  operationalFailure,
} from "./employee-operational-recovery";

/**
 * Condition and check-in completion orchestration.
 *
 * The authoritative sequence mirrors the Employee Web reference: append the
 * selected condition as a CHECK_IN note (the server permits zero notes),
 * record the idempotent condition-completion marker, then complete check-in
 * with the session's expected version. The server owns every transition.
 *
 * DEC-063 classifies this boundary REHYDRATE_BEFORE_RETRY: a lost response
 * never proves failure, so the append-only note is never blindly replayed.
 * After an ambiguous outcome the canonical session is re-read; a re-attempt
 * of the same session and selection skips the note (zero notes is
 * contract-valid) so a retry can never duplicate protected evidence.
 */
export abstract class EmployeeCheckInConditionSession extends EmployeeCheckInCorrectionSession {
  private unresolvedNote: {
    readonly selection: EmployeeCheckInConditionSelection;
    readonly sessionId: string;
  } | null = null;

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
      await this.appendProtectedNote(attempt, active);
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
      this.unresolvedNote = null;
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

  clear(): void {
    this.unresolvedNote = null;
    super.clear();
  }

  protected abstract mutableActive(): EmployeeCheckInAuthoritativeSession | null;

  private async appendProtectedNote(
    attempt: ConditionRecoveryAttempt,
    active: EmployeeCheckInAuthoritativeSession,
  ): Promise<void> {
    if (active.conditionCompletedAt !== null) return;
    const noteAlreadySent =
      this.unresolvedNote !== null &&
      this.unresolvedNote.sessionId === attempt.sessionId &&
      this.unresolvedNote.selection === attempt.selection;
    if (noteAlreadySent) return;
    await this.options.transport.createConditionNote(attempt.sessionId, {
      content: attempt.selection,
    });
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

  /**
   * Client-side staleness guard for a live attempt. Server-side version drift
   * is NOT staleness: the reconciling reread intentionally adopts the newer
   * authoritative version, so the comparison targets session identity and
   * workflow scope, not the version.
   */
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
      this.unresolvedNote = {
        selection: attempt.selection,
        sessionId: attempt.sessionId,
      };
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
      this.unresolvedNote = null;
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

function isCheckInSessionConflict(error: unknown): boolean {
  return (
    error instanceof EmployeeApiError &&
    (error.code === "VERSION_CONFLICT" ||
      error.code === "INVALID_STATE_TRANSITION")
  );
}
