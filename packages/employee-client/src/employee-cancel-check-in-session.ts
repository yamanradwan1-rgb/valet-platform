import type { EmployeeCancelCheckInTransport } from "./employee-cancel-check-in-transport";
import type { EmployeeOperationalScope } from "./employee-operational-types";
import { isSameEmployeeOperationalScope } from "./employee-operational-scope";
import { EmployeeApiError } from "./api-error";
import { isAmbiguousMutationFailure } from "./employee-operational-recovery";

export type EmployeeCancelCheckInPhase =
  | "inactive"
  | "preparing"
  | "confirm"
  | "submitting"
  | "unknown"
  | "reconciling"
  | "retry-available"
  | "cancelled"
  | "conflict"
  | "unavailable";
export interface EmployeeCancelCheckInSnapshot {
  readonly phase: EmployeeCancelCheckInPhase;
  readonly sessionId: string | null;
}
interface Intent {
  readonly sessionId: string;
  readonly expectedVersion: number;
  readonly expectedShiftId: string;
}

/** In-memory, owner-bound command intent; mutations are never replayed. */
export class EmployeeCancelCheckInSession {
  private snapshot: EmployeeCancelCheckInSnapshot = {
    phase: "inactive",
    sessionId: null,
  };
  private readonly subscribers = new Set<() => void>();
  private scope: EmployeeOperationalScope | null = null;
  private generation: number | null = null;
  private sequence = 0;
  private intent: Intent | null = null;
  private pendingPost = false;
  constructor(
    private readonly transport: EmployeeCancelCheckInTransport,
    private readonly onCancelled: (sessionId: string) => void = () => {},
  ) {}

  current() {
    return this.snapshot;
  }
  subscribe(listener: () => void) {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }
  bind(generation: number, scope: EmployeeOperationalScope) {
    if (
      generation === this.generation &&
      isSameEmployeeOperationalScope(this.scope, scope) &&
      this.scope?.role === scope.role
    )
      return;
    this.clear();
    this.generation = generation;
    this.scope = { ...scope };
  }
  clear() {
    this.sequence += 1;
    this.intent = null;
    this.generation = null;
    this.scope = null;
    this.publish("inactive", null);
  }
  dismiss() {
    if (["submitting", "unknown", "reconciling"].includes(this.snapshot.phase))
      return;
    this.sequence += 1;
    this.intent = null;
    this.publish("inactive", null);
  }
  async prepare(sessionId: string) {
    if (
      !this.scope ||
      this.pendingPost ||
      ["unknown", "reconciling", "preparing"].includes(this.snapshot.phase)
    )
      return;
    const request = ++this.sequence;
    const scope = this.scope;
    this.intent = null;
    this.publish("preparing", sessionId);
    try {
      const detail = await this.transport.prepare(sessionId);
      if (request !== this.sequence) return;
      if (
        detail.sessionId !== sessionId ||
        detail.locationId !== scope.locationId ||
        detail.state !== "CHECKING_IN"
      ) {
        this.publish("conflict", sessionId);
        return;
      }
      this.intent = {
        sessionId,
        expectedShiftId: scope.shiftId,
        expectedVersion: detail.version,
      };
      this.publish("confirm", sessionId);
    } catch {
      if (request === this.sequence) this.publish("unavailable", sessionId);
    }
  }
  async confirm() {
    const intent = this.intent;
    if (
      !intent ||
      !this.scope ||
      this.pendingPost ||
      this.snapshot.phase !== "confirm"
    )
      return;
    const request = ++this.sequence;
    this.pendingPost = true;
    this.publish("submitting", intent.sessionId);
    try {
      const result = await this.transport.cancel(intent.sessionId, {
        expectedShiftId: intent.expectedShiftId,
        expectedVersion: intent.expectedVersion,
      });
      if (request !== this.sequence) return;
      if (
        result.sessionId !== intent.sessionId ||
        result.locationId !== this.scope?.locationId ||
        result.version !== intent.expectedVersion + 1
      ) {
        this.publish("unknown", intent.sessionId);
        return;
      }
      this.succeed(intent.sessionId);
    } catch (error) {
      if (request !== this.sequence) return;
      const ambiguous =
        !(error instanceof EmployeeApiError) ||
        isAmbiguousMutationFailure(error);
      this.publish(ambiguous ? "unknown" : "conflict", intent.sessionId);
    } finally {
      this.pendingPost = false;
    }
  }
  async reconcile() {
    const intent = this.intent;
    if (!intent || !this.scope || this.snapshot.phase !== "unknown") return;
    const request = ++this.sequence;
    this.publish("reconciling", intent.sessionId);
    try {
      const result = await this.transport.status(
        intent.sessionId,
        intent.expectedShiftId,
      );
      if (request !== this.sequence) return;
      if (
        result.sessionId !== intent.sessionId ||
        result.locationId !== this.scope?.locationId
      ) {
        this.publish("unknown", intent.sessionId);
        return;
      }
      if (
        result.state === "CANCELLED" &&
        result.version === intent.expectedVersion + 1
      )
        this.succeed(intent.sessionId);
      else if (
        result.state === "CHECKING_IN" &&
        result.version === intent.expectedVersion
      )
        this.publish("retry-available", intent.sessionId);
      else this.publish("conflict", intent.sessionId);
    } catch (error) {
      if (request === this.sequence)
        this.publish(
          error instanceof EmployeeApiError &&
            !isAmbiguousMutationFailure(error)
            ? "conflict"
            : "unknown",
          intent.sessionId,
        );
    }
  }
  /** A stable read enables a fresh confirmation, never an automatic second POST. */
  confirmRetry() {
    if (this.snapshot.phase === "retry-available" && !this.pendingPost)
      this.publish("confirm", this.snapshot.sessionId);
  }
  suspendForBackground() {
    const phase = this.snapshot.phase;
    this.sequence += 1;
    if (phase === "submitting" || phase === "reconciling")
      this.publish("unknown", this.snapshot.sessionId);
    else if (
      phase === "preparing" ||
      phase === "confirm" ||
      phase === "retry-available"
    ) {
      this.intent = null;
      this.publish("inactive", null);
    }
  }
  private succeed(sessionId: string) {
    this.intent = null;
    this.publish("cancelled", sessionId);
    this.onCancelled(sessionId);
  }
  private publish(phase: EmployeeCancelCheckInPhase, sessionId: string | null) {
    this.snapshot = { phase, sessionId };
    for (const subscriber of this.subscribers) subscriber();
  }
}
