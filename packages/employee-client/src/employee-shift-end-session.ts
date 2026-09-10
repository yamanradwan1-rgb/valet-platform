import { EmployeeApiError } from "./api-error";
import {
  isAmbiguousMutationFailure,
  operationalFailure,
} from "./employee-operational-recovery";
import {
  employeeShiftEndAuthorityKey,
  emptyEmployeeShiftEndSnapshot,
  isEmployeeShiftCashValid,
  normalizeEmployeeShiftCash,
  resolveEmployeeShiftEndAuthority,
  validateEmployeeShiftEndResult,
} from "./employee-shift-end-state";
import type {
  EmployeeShiftEndAuthority,
  EmployeeShiftEndSessionOptions,
  EmployeeShiftEndSnapshot,
} from "./employee-shift-end-types";
import type { StaffOperationalContextResponse } from "@valet/contracts";

interface EndAttempt {
  readonly authority: EmployeeShiftEndAuthority;
  readonly cashReported: string;
  readonly workflowGeneration: number;
}

export class EmployeeShiftEndSession {
  private activeSend: Promise<void> | undefined;
  private attempt: EndAttempt | undefined;
  private endedPresentationAcknowledged = false;
  private noActiveShiftObserved = false;
  private snapshot: EmployeeShiftEndSnapshot;
  private readonly subscribers = new Set<
    (snapshot: EmployeeShiftEndSnapshot) => void
  >();
  private workflowGeneration = 0;

  constructor(private readonly options: EmployeeShiftEndSessionOptions) {
    this.snapshot = emptyEmployeeShiftEndSnapshot(
      null,
      options.initialOnline ?? true,
    );
  }

  current(): EmployeeShiftEndSnapshot {
    return this.snapshot;
  }

  subscribe(
    listener: (snapshot: EmployeeShiftEndSnapshot) => void,
  ): () => void {
    this.subscribers.add(listener);
    listener(this.snapshot);
    return () => this.subscribers.delete(listener);
  }

  activate(identityGeneration: number): void {
    if (this.snapshot.identityGeneration === identityGeneration) return;
    this.reset(identityGeneration);
  }

  clear(): void {
    this.reset(null);
  }

  observeOperationalContext(
    identityGeneration: number,
    response: StaffOperationalContextResponse,
  ): void {
    if (identityGeneration !== this.snapshot.identityGeneration) return;
    const authority = resolveEmployeeShiftEndAuthority(
      identityGeneration,
      response,
    );
    if (authority === null) {
      if (
        this.snapshot.phase === "ended" &&
        response.contexts.every((context) => context.activeShift === null)
      ) {
        this.noActiveShiftObserved = true;
        this.finishEndedReconciliation();
      }
      return;
    }
    const current = this.snapshot.authority;
    if (
      current !== null &&
      employeeShiftEndAuthorityKey(current) ===
        employeeShiftEndAuthorityKey(authority)
    ) {
      this.publish({ ...this.snapshot, authority });
      return;
    }
    this.workflowGeneration += 1;
    this.attempt = undefined;
    this.activeSend = undefined;
    this.endedPresentationAcknowledged = false;
    this.noActiveShiftObserved = false;
    this.publish({
      ...emptyEmployeeShiftEndSnapshot(
        identityGeneration,
        this.snapshot.online,
      ),
      authority,
      phase: "active",
    });
  }

  setOnline(online: boolean): void {
    if (this.snapshot.online === online) return;
    this.publish({ ...this.snapshot, online });
  }

  setCashInput(cashInput: string): void {
    if (!["active", "blocked-open-work", "error"].includes(this.snapshot.phase))
      return;
    this.publish({
      ...this.snapshot,
      cashInput,
      cashValidationVisible:
        this.snapshot.cashValidationVisible &&
        !isEmployeeShiftCashValid(cashInput),
      failure: null,
      phase: "active",
    });
  }

  requestConfirmation(): void {
    if (
      !this.snapshot.online ||
      this.snapshot.authority === null ||
      !["active", "blocked-open-work", "error"].includes(this.snapshot.phase)
    )
      return;
    if (!isEmployeeShiftCashValid(this.snapshot.cashInput)) {
      this.publish({ ...this.snapshot, cashValidationVisible: true });
      return;
    }
    this.publish({
      ...this.snapshot,
      cashValidationVisible: false,
      failure: null,
      phase: "confirming",
    });
  }

  cancelConfirmation(): void {
    if (this.snapshot.phase !== "confirming") return;
    this.publish({ ...this.snapshot, phase: "active" });
  }

  endShift(): Promise<void> {
    if (this.activeSend !== undefined) return this.activeSend;
    const authority = this.snapshot.authority;
    if (
      authority === null ||
      !this.snapshot.online ||
      this.snapshot.phase !== "confirming"
    )
      return Promise.resolve();
    const attempt: EndAttempt = {
      authority,
      cashReported: normalizeEmployeeShiftCash(this.snapshot.cashInput),
      workflowGeneration: this.workflowGeneration,
    };
    return this.send(attempt);
  }

  retry(): Promise<void> {
    if (this.activeSend !== undefined) return this.activeSend;
    if (
      this.snapshot.phase !== "uncertain" ||
      !this.snapshot.online ||
      this.attempt === undefined ||
      !this.isCurrent(this.attempt)
    )
      return Promise.resolve();
    return this.send(this.attempt);
  }

  suspendForBackground(): void {
    this.fenceSubmittingAttempt();
  }

  fenceOperationalScope(): void {
    this.fenceSubmittingAttempt();
  }

  private fenceSubmittingAttempt(): void {
    if (this.snapshot.phase !== "submitting" || this.attempt === undefined)
      return;
    this.workflowGeneration += 1;
    this.attempt = {
      ...this.attempt,
      workflowGeneration: this.workflowGeneration,
    };
    this.publish({
      ...this.snapshot,
      failure: {
        code: "SHIFT_END_RESULT_UNKNOWN",
        message: "The Shift end result could not be confirmed.",
      },
      phase: "uncertain",
    });
  }

  finish(): void {
    if (this.snapshot.phase !== "ended") return;
    this.reset(this.snapshot.identityGeneration);
  }

  acknowledgeEndedPresentation(): void {
    if (this.snapshot.phase !== "ended") return;
    this.endedPresentationAcknowledged = true;
    this.finishEndedReconciliation();
  }

  private send(attempt: EndAttempt): Promise<void> {
    this.attempt = attempt;
    this.publish({ ...this.snapshot, failure: null, phase: "submitting" });
    const operation = this.execute(attempt).finally(() => {
      if (this.activeSend === operation) this.activeSend = undefined;
    });
    this.activeSend = operation;
    return operation;
  }

  private async execute(attempt: EndAttempt): Promise<void> {
    try {
      const result = await this.options.transport.endShift(
        attempt.authority.shiftId,
        attempt.cashReported,
      );
      if (!this.isCurrent(attempt)) return;
      validateEmployeeShiftEndResult(
        attempt.authority,
        attempt.cashReported,
        result,
      );
      this.attempt = undefined;
      this.endedPresentationAcknowledged = false;
      this.noActiveShiftObserved = false;
      this.publish({ ...this.snapshot, phase: "ended", result });
      this.options.onEnded?.(result);
    } catch (error) {
      if (!this.isCurrent(attempt)) return;
      const failure = operationalFailure(error);
      if (isAmbiguousMutationFailure(error)) {
        this.publish({ ...this.snapshot, failure, phase: "uncertain" });
        return;
      }
      this.attempt = undefined;
      this.publish({
        ...this.snapshot,
        failure,
        phase:
          error instanceof EmployeeApiError &&
          error.code === "OPEN_TASK_HANDOFF_REQUIRED"
            ? "blocked-open-work"
            : "error",
      });
    }
  }

  private isCurrent(attempt: EndAttempt): boolean {
    return (
      this.attempt === attempt &&
      this.workflowGeneration === attempt.workflowGeneration &&
      this.snapshot.authority !== null &&
      employeeShiftEndAuthorityKey(this.snapshot.authority) ===
        employeeShiftEndAuthorityKey(attempt.authority)
    );
  }

  private reset(identityGeneration: number | null): void {
    this.workflowGeneration += 1;
    this.attempt = undefined;
    this.activeSend = undefined;
    this.endedPresentationAcknowledged = false;
    this.noActiveShiftObserved = false;
    this.publish(
      emptyEmployeeShiftEndSnapshot(identityGeneration, this.snapshot.online),
    );
  }
  private finishEndedReconciliation(): void {
    if (
      this.endedPresentationAcknowledged &&
      this.noActiveShiftObserved &&
      this.snapshot.phase === "ended"
    ) {
      this.finish();
    }
  }

  private publish(snapshot: EmployeeShiftEndSnapshot): void {
    this.snapshot = snapshot;
    this.options.onStateChange?.(snapshot);
    for (const subscriber of this.subscribers) subscriber(snapshot);
  }
}
