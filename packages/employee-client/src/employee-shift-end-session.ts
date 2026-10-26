import { changeEndCash, confirmEnd } from "./employee-shift-end-form";
import { recoverEmployeeEndAttempt } from "./employee-shift-end-recovery";
import {
  suspendedEndAttempt,
  suspendedEndSnapshot,
} from "./employee-shift-presence-parent-fence";
import {
  executeEmployeeEndAttempt,
  confirmedEndAttempt,
  isCurrentEndAttempt,
  type EndAttempt,
} from "./employee-shift-end-attempt";
import {
  employeeShiftEndAuthorityKey,
  emptyEmployeeShiftEndSnapshot,
  resolveEmployeeShiftEndAuthority,
} from "./employee-shift-end-state";
import type {
  EmployeeShiftEndSessionOptions,
  EmployeeShiftEndSnapshot,
} from "./employee-shift-end-types";
import type { StaffOperationalContextResponse } from "@valet/contracts";

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

  get presence() {
    return this.options.presence;
  }

  resumePresenceRecovery(
    authority: import("./employee-shift-end-types").EmployeeShiftEndAuthority,
    cashReported: string,
    restore: () => void = () => undefined,
  ): Promise<void> {
    this.publish({
      ...this.snapshot,
      authority,
      cashInput: cashReported,
      phase: "uncertain",
    });
    restore();
    return this.send(
      {
        authority,
        cashReported,
        workflowGeneration: this.workflowGeneration,
      },
      true,
    );
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
    if (current !== null) this.options.presence?.clear();
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
    const next = changeEndCash(this, cashInput);
    if (next === undefined) return;
    if (cashInput !== this.snapshot.cashInput) this.options.presence?.clear();
    this.publish(next);
  }

  requestConfirmation(): void {
    const next = confirmEnd(this);
    if (next !== undefined) this.publish(next);
  }

  cancelConfirmation(): void {
    if (this.snapshot.phase !== "confirming") return;
    this.options.presence?.cancel();
    this.publish({ ...this.snapshot, phase: "active" });
  }

  endShift(): Promise<void> {
    if (this.activeSend !== undefined) return this.activeSend;
    const attempt = confirmedEndAttempt(this.snapshot, this.workflowGeneration);
    if (attempt === undefined) return Promise.resolve();
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
    return this.options.presence === undefined
      ? this.send(this.attempt)
      : this.checkPresenceStatus();
  }

  continuePresence(): Promise<void> {
    if (this.activeSend !== undefined) return this.activeSend;
    if (
      this.attempt === undefined ||
      !this.isCurrent(this.attempt) ||
      !this.snapshot.online ||
      this.options.presence?.snapshot().phase !== "approved"
    )
      return Promise.resolve();
    return this.send(this.attempt);
  }

  checkPresenceStatus(): Promise<void> {
    if (this.activeSend !== undefined) return this.activeSend;
    if (this.attempt === undefined)
      return (
        this.options.presence?.checkStatus().then(() => undefined) ??
        Promise.resolve()
      );
    return this.send(this.attempt, true);
  }

  suspendForBackground(): void {
    this.options.presence?.suspend();
    this.fenceSubmittingAttempt();
  }

  fenceOperationalScope(): void {
    this.options.presence?.suspend();
    this.fenceSubmittingAttempt();
  }

  private fenceSubmittingAttempt(): void {
    const attempt = suspendedEndAttempt(
      this.options.presence,
      this.attempt,
      this.snapshot,
      this.workflowGeneration + 1,
    );
    if (attempt === undefined) return;
    this.workflowGeneration += 1;
    this.attempt = attempt;
    this.activeSend = undefined;
    this.publish(suspendedEndSnapshot(this.snapshot));
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

  private send(attempt: EndAttempt, recoveryOnly = false): Promise<void> {
    this.attempt = attempt;
    if (!recoveryOnly)
      this.publish({ ...this.snapshot, failure: null, phase: "submitting" });
    const operation = this.execute(attempt, recoveryOnly).finally(() => {
      if (this.activeSend === operation) this.activeSend = undefined;
    });
    this.activeSend = operation;
    return operation;
  }

  private async execute(
    attempt: EndAttempt,
    recoveryOnly: boolean,
  ): Promise<void> {
    const outcome = recoveryOnly
      ? await recoverEmployeeEndAttempt(this.options, attempt)
      : await executeEmployeeEndAttempt(this.options, attempt);
    if (!this.isCurrent(attempt)) return;
    if (outcome.checkStatus !== undefined)
      this.options.presence?.publish({ checkStatus: outcome.checkStatus });
    if (outcome.phase !== "uncertain") this.attempt = undefined;
    if (outcome.result !== null) {
      this.endedPresentationAcknowledged = false;
      this.noActiveShiftObserved = false;
    }
    this.publish({ ...this.snapshot, ...outcome });
    if (outcome.result !== null) this.options.onEnded?.(outcome.result);
  }
  private isCurrent(attempt: EndAttempt): boolean {
    return isCurrentEndAttempt(
      attempt,
      this.attempt,
      this.snapshot,
      this.workflowGeneration,
    );
  }

  private reset(identityGeneration: number | null): void {
    this.options.presence?.clear(this.snapshot.identityGeneration !== null);
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
