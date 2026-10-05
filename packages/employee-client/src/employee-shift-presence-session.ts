import { dispatchPresenceShift } from "./employee-shift-presence-dispatch";
import {
  classifyPresenceSubmissionFailure,
  recordPresenceFailure,
} from "./employee-shift-presence-failure";
import { acquirePresenceEvidence } from "./employee-shift-presence-evidence";
import { EmployeeApiError } from "./api-error";
import type {
  PresenceAcquisition,
  PresenceDescriptor,
  PresenceResult,
  PresenceSnapshot,
  PresenceStore,
  PresenceTarget,
  PresenceTransport,
} from "./employee-shift-presence-types";
import { presenceTargetKey } from "./employee-shift-presence-types";
import {
  createPresenceException,
  recoverPresence,
} from "./employee-shift-presence-recovery";
import {
  emptyPresenceSnapshot,
  presenceFailure,
  type PresenceAttempt,
  type PresenceWorkflow,
} from "./employee-shift-presence-workflow";

/** Transient evidence orchestration. The existing Shift sessions own presentation. */
export class EmployeeShiftPresenceSession implements PresenceWorkflow {
  private generation = 0;
  private attempt: PresenceAttempt | undefined;
  private active: Promise<unknown> | undefined;
  private state = emptyPresenceSnapshot();
  private readonly listeners = new Set<(value: PresenceSnapshot) => void>();
  private notBefore = 0;
  readonly transport: PresenceTransport;
  readonly store: PresenceStore;

  constructor(
    private readonly options: {
      transport: PresenceTransport;
      store: PresenceStore;
      acquisition: PresenceAcquisition;
      createId: () => string;
      isAuthorized: (target: PresenceTarget) => boolean;
      isAvailable?: () => boolean;
      now?: () => number;
    },
  ) {
    this.transport = options.transport;
    this.store = options.store;
  }

  snapshot = (): PresenceSnapshot => this.state;
  subscribe(listener: (value: PresenceSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
  publish(patch: Partial<PresenceSnapshot>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener(this.state));
  }
  current(attempt: PresenceAttempt): boolean {
    return (
      this.attempt === attempt &&
      attempt.generation === this.generation &&
      !attempt.controller.signal.aborted &&
      this.options.isAuthorized(attempt.descriptor.target)
    );
  }
  available(): boolean {
    return this.options.isAvailable?.() ?? true;
  }
  descriptor(): PresenceDescriptor | undefined {
    return this.attempt?.descriptor;
  }

  observeTarget(target: PresenceTarget | null): void {
    if (
      this.attempt !== undefined &&
      (target === null ||
        presenceTargetKey(target) !==
          presenceTargetKey(this.attempt.descriptor.target))
    )
      this.clear();
  }

  clear(purge = true): void {
    this.retire();
    this.state = emptyPresenceSnapshot();
    this.publish({});
    if (purge) void this.store.delete().catch(() => undefined);
  }
  suspend(): void {
    const old = this.attempt;
    this.retire();
    if (old === undefined) return;
    this.attempt = {
      ...old,
      generation: this.generation,
      controller: new AbortController(),
    };
    if (!old.terminal || this.state.phase === "submitting")
      this.publish({
        phase: old.sent || old.exceptionSent ? "uncertain" : "unavailable",
        reason: "LOCATION_CANCELLED",
      });
  }
  cancel(): void {
    if (this.attempt?.sent || this.attempt?.exceptionSent) this.suspend();
    else this.clear();
  }
  async openSettings(): Promise<void> {
    this.cancel();
    await this.options.acquisition.openSettings();
  }

  restore(descriptor: PresenceDescriptor): void {
    if (
      this.attempt !== undefined ||
      !this.options.isAuthorized(descriptor.target)
    )
      return;
    this.allocate(descriptor.target, descriptor.operationId);
    this.attempt!.descriptor = descriptor;
    this.attempt!.sent =
      descriptor.stage === undefined ||
      descriptor.stage === "SHIFT_MAY_HAVE_LEFT";
    this.attempt!.exceptionSent =
      descriptor.stage === "EXCEPTION_MAY_HAVE_LEFT";
    this.publish({ phase: "uncertain" });
  }

  run(target: PresenceTarget): Promise<PresenceResult> {
    if (!this.available()) return Promise.reject(presenceFailure());
    this.observeTarget(target);
    if (this.active !== undefined)
      return this.active as Promise<PresenceResult>;
    if (!this.options.isAuthorized(target))
      return Promise.reject(presenceFailure("PRESENCE_RETIRED", 409));
    if ((this.options.now ?? Date.now)() < this.notBefore)
      return Promise.reject(
        presenceFailure("SHIFT_PRESENCE_RATE_LIMITED", 429),
      );
    const operation = this.execute(target);
    this.active = operation;
    void operation
      .finally(() => {
        if (this.active === operation) this.active = undefined;
      })
      .catch(() => undefined);
    return operation;
  }

  async requestManager(): Promise<void> {
    if ((this.options.now ?? Date.now)() < this.notBefore) return;
    if (this.active !== undefined || this.attempt === undefined) return;
    const reason = this.state.overrideReason;
    if (
      !this.available() ||
      reason === null ||
      (this.state.mode !== "REQUIRE_OR_OVERRIDE" &&
        !(this.state.mode === null && this.attempt.terminal))
    )
      return;
    const old = this.attempt;
    if ((old.sent || old.exceptionSent) && !old.terminal) return;
    let attempt = old;
    const operation = (async () => {
      if (old.terminal) attempt = this.allocate(old.descriptor.target);
      await createPresenceException(this, attempt, reason);
    })();
    this.active = operation;
    try {
      await operation;
    } catch (error) {
      if (this.current(attempt)) this.handleFailure(error);
    } finally {
      if (this.active === operation) this.active = undefined;
    }
  }

  async checkStatus(): Promise<void> {
    if ((this.options.now ?? Date.now)() < this.notBefore) return;
    const attempt = this.attempt;
    if (attempt === undefined || this.active !== undefined) return;
    const operation = recoverPresence(this, attempt);
    this.active = operation;
    try {
      await operation;
    } catch (error) {
      if (this.current(attempt)) this.handleFailure(error);
    } finally {
      if (this.active === operation) this.active = undefined;
    }
  }

  private allocate(
    target: PresenceTarget,
    operationId = this.options.createId(),
  ): PresenceAttempt {
    this.retire();
    const attempt: PresenceAttempt = {
      generation: this.generation,
      descriptor: { version: 1, operationId, target, stage: "LOCAL" },
      controller: new AbortController(),
      challenge: undefined,
      exception: undefined,
      sent: false,
      exceptionSent: false,
      terminal: false,
    };
    this.attempt = attempt;
    this.state = emptyPresenceSnapshot();
    return attempt;
  }

  private async execute(target: PresenceTarget): Promise<PresenceResult> {
    let attempt = this.attempt;
    if (attempt !== undefined && this.state.phase === "uncertain")
      return this.recover(attempt);
    if (attempt?.result !== undefined) return attempt.result;
    if (
      attempt !== undefined &&
      !attempt.terminal &&
      (attempt.sent || attempt.exceptionSent)
    ) {
      if (
        this.state.phase !== "approved" ||
        attempt.exception?.status !== "APPROVED"
      )
        return this.recover(attempt);
    } else attempt = this.allocate(target);
    try {
      let evidence = await acquirePresenceEvidence(
        this,
        attempt,
        this.options.acquisition,
        this.options.createId,
      );
      const dispatch = dispatchPresenceShift(this, attempt, target, evidence);
      evidence = undefined;
      return await dispatch;
    } catch (error) {
      if (classifyPresenceSubmissionFailure(this, attempt, error) === "recover")
        return this.recover(attempt);
      this.handleFailure(error);
      throw error instanceof EmployeeApiError ? error : presenceFailure();
    }
  }

  private async recover(attempt: PresenceAttempt): Promise<PresenceResult> {
    try {
      return await recoverPresence(this, attempt);
    } catch (error) {
      if (this.current(attempt)) this.handleFailure(error);
      throw error instanceof EmployeeApiError ? error : presenceFailure();
    }
  }
  private handleFailure(error: unknown): void {
    const retryAfter = recordPresenceFailure(this, error);
    if (retryAfter !== null)
      this.notBefore = (this.options.now ?? Date.now)() + retryAfter * 1000;
  }
  private retire(): void {
    this.generation += 1;
    this.attempt?.controller.abort();
    this.attempt = undefined;
    this.active = undefined;
  }
}
