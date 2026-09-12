import type {
  HandoffStandardMethod,
  StaffTaskQueueItem,
} from "@valet/contracts";

import {
  applyHandoffResult,
  validateHandoffResult,
  type EmployeeHandoffCommand as Command,
} from "./employee-handoff-flow-command";
import { operationalFailure } from "./employee-operational-recovery";
import type { EmployeeOperationalScope } from "./employee-operational-types";
import { DYNAMIC_QR_PATTERN } from "./qr-input";
import {
  emptyHandoffSnapshot,
  handoffFailureKind,
  isHandoffBusy,
  isHandoffTargetCurrent,
  loadHandoffCanonical,
  sameHandoffTaskAuthority,
  type EmployeeHandoffTarget as Target,
} from "./employee-handoff-flow-state";
import type {
  EmployeeHandoffOptions,
  EmployeeHandoffSnapshot,
} from "./employee-handoff-flow-types";

export class EmployeeHandoffSession {
  private active: Promise<void> | undefined;
  private request = 0;
  private snapshot = emptyHandoffSnapshot();
  private readonly subscribers = new Set<
    (value: EmployeeHandoffSnapshot) => void
  >();
  private target: Target | null = null;

  constructor(private readonly options: EmployeeHandoffOptions) {}
  current = () => this.snapshot;
  subscribe(listener: (value: EmployeeHandoffSnapshot) => void) {
    this.subscribers.add(listener);
    listener(this.snapshot);
    return () => this.subscribers.delete(listener);
  }

  openTask(
    generation: number,
    scope: EmployeeOperationalScope,
    taskId: string,
    sessionId: string,
  ) {
    this.request += 1;
    this.active = undefined;
    this.target = {
      identityGeneration: generation,
      locationId: scope.locationId,
      membershipId: scope.membershipId,
      organizationId: scope.organizationId,
      role: scope.role,
      sessionId,
      shiftId: scope.shiftId,
      taskId,
    };
    this.publish(emptyHandoffSnapshot(generation, scope, "loading"));
    return this.reconcile("loading");
  }

  checkServerState() {
    if (!this.target || isHandoffBusy(this.snapshot.phase))
      return this.active ?? Promise.resolve();
    return this.reconcile("reconciling");
  }

  observeTaskAuthority(task: StaffTaskQueueItem | undefined) {
    const current = this.snapshot.task;
    if (!this.target || !current || sameHandoffTaskAuthority(current, task)) {
      return Promise.resolve();
    }
    // A newer queue projection supersedes protected work; reread canonical state.
    this.request += 1;
    this.active = undefined;
    return this.reconcile("reconciling");
  }

  suspendForBackground() {
    if (!this.target || !this.active) return;
    const protectedOutcome = isHandoffBusy(this.snapshot.phase);
    this.request += 1;
    this.active = undefined;
    if (protectedOutcome)
      this.publish({ ...this.snapshot, failure: null, phase: "ambiguous" });
  }

  initiate() {
    return this.run("initiate", null, null);
  }
  verifyPickupCode(proof: string) {
    return this.run("verify", "PICKUP_CODE", proof);
  }
  verifyDynamicQr(proof: string) {
    return this.run("verify", "DYNAMIC_QR", proof);
  }
  override(reason: string) {
    return this.run("override", "SUPERVISOR_OVERRIDE", reason.trim());
  }
  abort(reason: string) {
    return this.run("abort", null, reason.trim());
  }

  clear() {
    this.request += 1;
    this.target = null;
    this.active = undefined;
    this.publish(emptyHandoffSnapshot());
  }

  private run(
    command: Command,
    method: HandoffStandardMethod | "SUPERVISOR_OVERRIDE" | null,
    value: string | null,
  ) {
    if (this.active) return this.active;
    const target = this.target;
    const session = this.snapshot.session;
    const task = this.snapshot.task;
    const owner =
      task?.currentAssigneeMembershipId === target?.membershipId &&
      (target?.role === "VALET_EMPLOYEE" ||
        target?.role === "VALET_SUPERVISOR");
    const valid =
      target &&
      session &&
      task &&
      ((command === "initiate" && this.snapshot.phase === "ready" && owner) ||
        (command === "verify" &&
          this.snapshot.phase === "pending" &&
          owner &&
          validProof(method, value)) ||
        (command === "override" &&
          this.snapshot.phase === "pending" &&
          target.role === "VALET_SUPERVISOR" &&
          validReason(value)) ||
        (command === "abort" &&
          (this.snapshot.phase === "pending" ||
            this.snapshot.phase === "verified") &&
          (owner || target.role === "VALET_SUPERVISOR") &&
          validReason(value)));
    if (!valid) return Promise.resolve();
    const request = ++this.request;
    const prior = this.snapshot.phase;
    const busy =
      command === "initiate"
        ? "initiating"
        : command === "verify"
          ? "verifying"
          : command === "override"
            ? "overriding"
            : "aborting";
    this.publish({ ...this.snapshot, failure: null, phase: busy });
    const operation = this.execute(
      command,
      method,
      value,
      target,
      session,
      task,
      request,
      prior,
    ).finally(() => {
      if (this.active === operation) this.active = undefined;
    });
    this.active = operation;
    return operation;
  }

  private async execute(
    command: Command,
    method: HandoffStandardMethod | "SUPERVISOR_OVERRIDE" | null,
    value: string | null,
    target: Target,
    session: NonNullable<EmployeeHandoffSnapshot["session"]>,
    task: NonNullable<EmployeeHandoffSnapshot["task"]>,
    request: number,
    prior: EmployeeHandoffSnapshot["phase"],
  ) {
    try {
      const result =
        command === "initiate"
          ? await this.options.transport.initiate(
              session.sessionId,
              session.version,
            )
          : command === "abort"
            ? await this.options.transport.abort(
                session.sessionId,
                session.version,
                value!,
              )
            : command === "override"
              ? await this.options.transport.override(
                  session.sessionId,
                  session.version,
                  value!,
                )
              : method === "PICKUP_CODE"
                ? await this.options.transport.verifyPickupCode(
                    session.sessionId,
                    session.version,
                    value!,
                  )
                : await this.options.transport.verifyDynamicQr(
                    session.sessionId,
                    session.version,
                    value!,
                  );
      if (!this.isCurrent(target, request)) return;
      validateHandoffResult(
        command,
        method,
        session.sessionId,
        session.version,
        task.taskId,
        task.version,
        result,
      );
      this.publish(applyHandoffResult(this.snapshot, command, result));
    } catch (error) {
      if (!this.isCurrent(target, request)) return;
      const kind = handoffFailureKind(error);
      this.publish({
        ...this.snapshot,
        failure: operationalFailure(error),
        phase: kind === "unavailable" ? prior : "ambiguous",
      });
      if (kind !== "unavailable") await this.reconcile("reconciling");
    }
  }

  private reconcile(phase: "loading" | "reconciling") {
    if (this.active && phase === "loading") return this.active;
    const target = this.target;
    const scope = this.snapshot.scope;
    if (!target || !scope) return Promise.resolve();
    const request = ++this.request;
    const previous = this.snapshot.phase;
    this.publish({ ...this.snapshot, failure: null, phase });
    const operation = (async () => {
      try {
        const next = await loadHandoffCanonical(
          this.options.transport,
          target,
          scope,
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
    })().finally(() => {
      if (this.active === operation) this.active = undefined;
    });
    this.active = operation;
    return operation;
  }

  private isCurrent(target: Target, request: number) {
    return (
      this.target === target &&
      request === this.request &&
      isHandoffTargetCurrent(this.snapshot, target)
    );
  }
  private publish(value: EmployeeHandoffSnapshot) {
    this.snapshot = value;
    this.options.onStateChange?.(value);
    this.subscribers.forEach((subscriber) => subscriber(value));
  }
}

function validReason(value: string | null): value is string {
  return (
    value !== null && value.trim().length >= 1 && value.trim().length <= 500
  );
}

function validProof(
  method: HandoffStandardMethod | "SUPERVISOR_OVERRIDE" | null,
  value: string | null,
): value is string {
  return (
    value !== null &&
    (method === "PICKUP_CODE"
      ? /^\d{4}$/.test(value)
      : method === "DYNAMIC_QR" && DYNAMIC_QR_PATTERN.test(value))
  );
}
