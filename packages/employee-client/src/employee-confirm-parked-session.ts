import {
  isAmbiguousMutationFailure,
  operationalFailure,
} from "./employee-operational-recovery";
import type { EmployeeOperationalScope } from "./employee-operational-types";
import {
  confirmParkedAttemptMatches,
  createConfirmParkedAttempt,
  executeConfirmParkedOperation,
  loadConfirmParkedCanonical,
  type EmployeeConfirmParkedAttempt as Attempt,
} from "./employee-confirm-parked-operation";
import {
  emptyConfirmParkedSnapshot,
  classifyConfirmParkedFailure,
  confirmParkedScanCandidate,
  targetMatches,
  type EmployeeConfirmParkedTarget as Target,
} from "./employee-confirm-parked-state";
import type {
  EmployeeConfirmParkedConflict,
  EmployeeConfirmParkedOptions,
  EmployeeConfirmParkedPhase,
  EmployeeConfirmParkedSnapshot,
} from "./employee-confirm-parked-types";

export class EmployeeConfirmParkedSession {
  private activeCommand: Promise<void> | undefined;
  private activeRead: Promise<void> | undefined;
  private request = 0;
  private snapshot = emptyConfirmParkedSnapshot();
  private subscribers = new Set<
    (value: EmployeeConfirmParkedSnapshot) => void
  >();
  private target: Target | null = null;

  constructor(private readonly options: EmployeeConfirmParkedOptions) {}

  current(): EmployeeConfirmParkedSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (value: EmployeeConfirmParkedSnapshot) => void) {
    this.subscribers.add(listener);
    listener(this.snapshot);
    return () => this.subscribers.delete(listener);
  }

  open(
    identityGeneration: number,
    scope: EmployeeOperationalScope,
    taskId: string,
    sessionId: string,
  ): Promise<void> {
    this.request += 1;
    this.activeCommand = undefined;
    this.activeRead = undefined;
    this.target = {
      identityGeneration,
      locationId: scope.locationId,
      membershipId: scope.membershipId,
      organizationId: scope.organizationId,
      sessionId,
      shiftId: scope.shiftId,
      taskId,
    };
    this.publish(
      emptyConfirmParkedSnapshot(identityGeneration, scope, "loading"),
    );
    return this.reconcile("loading", null);
  }

  enterParkingSpot(value: string): void {
    if (this.snapshot.phase !== "spot") return;
    this.setSpot(value);
  }

  scanParkingSpot(payload: unknown): boolean {
    const candidate = confirmParkedScanCandidate("parking-spot", payload);
    if (candidate === null || this.snapshot.phase !== "spot") return false;
    this.setSpot(candidate);
    return true;
  }

  continueToKeySlot(): void {
    if (
      this.snapshot.phase !== "spot" ||
      this.snapshot.parkingSpotCandidate === ""
    )
      return;
    this.publish({ ...this.snapshot, conflict: null, phase: "slot" });
  }

  enterKeySlot(value: string): void {
    if (this.snapshot.phase !== "slot" && this.snapshot.phase !== "ready")
      return;
    const candidate = value.trim();
    this.publish({
      ...this.snapshot,
      conflict: null,
      failure: null,
      keySlotCandidate: candidate,
      phase: candidate === "" ? "slot" : "ready",
    });
  }

  scanKeySlot(payload: unknown): boolean {
    const candidate = confirmParkedScanCandidate("key-slot", payload);
    if (
      candidate === null ||
      (this.snapshot.phase !== "slot" && this.snapshot.phase !== "ready")
    )
      return false;
    this.enterKeySlot(candidate);
    return true;
  }

  backToSpot(): void {
    if (this.snapshot.phase !== "slot" && this.snapshot.phase !== "ready")
      return;
    this.publish({
      ...this.snapshot,
      conflict: null,
      failure: null,
      keySlotCandidate: "",
      phase: "spot",
    });
  }

  confirmParked(): Promise<void> {
    if (this.activeCommand !== undefined) return this.activeCommand;
    const attempt = createConfirmParkedAttempt(this.snapshot, this.target);
    if (attempt === null) return Promise.resolve();
    const request = ++this.request;
    this.publish({
      ...this.snapshot,
      conflict: null,
      failure: null,
      phase: "submitting",
    });
    const operation = this.executeConfirm(attempt, request).finally(() => {
      if (this.activeCommand === operation) this.activeCommand = undefined;
    });
    this.activeCommand = operation;
    return operation;
  }

  checkServerState(): Promise<void> {
    if (this.target === null || this.snapshot.phase === "submitting") {
      return this.activeCommand ?? Promise.resolve();
    }
    return this.reconcile("reconciling", this.snapshot.conflict);
  }

  suspendForBackground(): void {
    if (this.target === null || this.snapshot.phase !== "submitting") return;
    this.request += 1;
    this.activeCommand = undefined;
    this.publish({ ...this.snapshot, failure: null, phase: "ambiguous" });
  }

  clear(): void {
    this.request += 1;
    this.target = null;
    this.activeCommand = undefined;
    this.activeRead = undefined;
    this.publish(emptyConfirmParkedSnapshot());
  }

  private setSpot(value: string): void {
    this.publish({
      ...this.snapshot,
      conflict: null,
      failure: null,
      keySlotCandidate: "",
      parkingSpotCandidate: value.trim(),
    });
  }

  private async executeConfirm(
    attempt: Attempt,
    request: number,
  ): Promise<void> {
    try {
      const parked = await executeConfirmParkedOperation(
        this.options.transport,
        attempt,
      );
      if (
        !this.isCurrent(attempt.target, request) ||
        !confirmParkedAttemptMatches(this.snapshot, attempt)
      )
        return;
      this.publish({
        ...this.snapshot,
        failure: null,
        parked,
        phase: "parked",
      });
    } catch (error) {
      if (
        !this.isCurrent(attempt.target, request) ||
        !confirmParkedAttemptMatches(this.snapshot, attempt)
      )
        return;
      const conflict = classifyConfirmParkedFailure(error);
      if (isAmbiguousMutationFailure(error)) {
        this.publish({
          ...this.snapshot,
          failure: operationalFailure(error),
          phase: "ambiguous",
        });
        await this.reconcile("reconciling", null);
      } else if (conflict !== null) {
        this.publish({
          ...this.snapshot,
          conflict,
          failure: operationalFailure(error),
        });
        await this.reconcile("reconciling", conflict);
      } else {
        this.publish({
          ...this.snapshot,
          failure: operationalFailure(error),
          phase: "unavailable",
        });
      }
    }
  }

  private reconcile(
    phase: "loading" | "reconciling",
    conflict: EmployeeConfirmParkedConflict | null,
  ): Promise<void> {
    if (this.activeRead !== undefined) return this.activeRead;
    const target = this.target;
    if (target === null) return Promise.resolve();
    const request = ++this.request;
    const previous = this.snapshot.phase;
    this.publish({ ...this.snapshot, phase });
    const operation = this.executeRead(
      target,
      request,
      previous,
      conflict,
    ).finally(() => {
      if (this.activeRead === operation) this.activeRead = undefined;
    });
    this.activeRead = operation;
    return operation;
  }

  private async executeRead(
    target: Target,
    request: number,
    previous: EmployeeConfirmParkedPhase,
    conflict: EmployeeConfirmParkedConflict | null,
  ): Promise<void> {
    try {
      const next = await loadConfirmParkedCanonical(
        this.options.transport,
        this.snapshot,
        target,
        previous,
        conflict,
      );
      if (!this.isCurrent(target, request)) return;
      this.publish(next);
    } catch (error) {
      if (!this.isCurrent(target, request)) return;
      this.publish({
        ...this.snapshot,
        failure: operationalFailure(error),
        phase: previous === "ambiguous" ? "ambiguous" : "unavailable",
      });
    }
  }

  private isCurrent(target: Target, request?: number): boolean {
    return (
      this.target === target &&
      targetMatches(this.snapshot, target) &&
      (request === undefined || request === this.request)
    );
  }

  private publish(snapshot: EmployeeConfirmParkedSnapshot): void {
    this.snapshot = snapshot;
    this.options.onStateChange?.(snapshot);
    this.subscribers.forEach((subscriber) => subscriber(snapshot));
  }
}
