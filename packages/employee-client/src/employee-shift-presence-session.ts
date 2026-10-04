import { recordPresenceFailure } from "./employee-shift-presence-failure";
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
  assertCurrent,
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
    this.attempt!.sent = true; // Conservative: restart never authorizes a POST.
    this.publish({ phase: "uncertain" });
  }

  run(target: PresenceTarget): Promise<PresenceResult> {
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
    if (reason === null || this.state.mode !== "REQUIRE_OR_OVERRIDE") return;
    const old = this.attempt;
    if (old.sent && !old.terminal) return;
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
      descriptor: { version: 1, operationId, target },
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
    if (attempt?.result !== undefined) return attempt.result;
    if (attempt !== undefined && this.state.phase === "uncertain")
      return this.recover(attempt);
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
      assertCurrent(this, attempt);
      this.publish({ phase: "submitting" });
      attempt.sent = true;
      const sent = this.transport.submit(
        target,
        attempt.descriptor.operationId,
        evidence,
      );
      evidence = undefined;
      const result = await sent;
      assertCurrent(this, attempt);
      if (
        result.locationId !== target.locationId ||
        (target.action === "END" && result.shiftId !== target.shiftId)
      )
        throw presenceFailure("PRESENCE_RESPONSE_MISMATCH");
      attempt.terminal = true;
      attempt.result = result;
      await this.store.delete();
      assertCurrent(this, attempt);
      this.publish({ phase: "confirmed", overrideReason: null });
      return result;
    } catch (error) {
      if (!this.current(attempt))
        throw presenceFailure("PRESENCE_RETIRED", 409);
      if (
        error instanceof EmployeeApiError &&
        [
          "PRESENCE_REJECTED",
          "PRESENCE_REQUIRED",
          "APPROVER_AUTHORITY_REVOKED",
        ].includes(error.code)
      ) {
        this.publish({ phase: "uncertain" });
        return this.recover(attempt);
      }
      if (
        error instanceof EmployeeApiError &&
        !error.isNetworkError &&
        error.status < 500 &&
        error.status !== 408 &&
        this.state.phase !== "unavailable"
      ) {
        attempt.sent = false;
        this.publish({
          phase: "unavailable",
          reason: error.code,
          overrideReason: null,
        });
      }
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
