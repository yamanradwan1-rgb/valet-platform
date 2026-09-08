import type { StaffTaskQueueItem } from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import {
  applyReleaseResult,
  validateReleaseResult,
} from "./employee-release-flow-command";
import {
  isAmbiguousMutationFailure,
  operationalFailure,
} from "./employee-operational-recovery";
import type { EmployeeOperationalScope } from "./employee-operational-types";
import {
  emptyReleaseSnapshot,
  isReleaseTargetCurrent,
  loadReleaseCanonical,
  sameReleaseTaskAuthority,
  type EmployeeReleaseTarget as Target,
} from "./employee-release-flow-state";
import type {
  EmployeeReleaseBlock,
  EmployeeReleaseOptions,
  EmployeeReleaseSnapshot,
} from "./employee-release-flow-types";

export class EmployeeReleaseSession {
  private active: Promise<void> | undefined;
  private request = 0;
  private snapshot = emptyReleaseSnapshot();
  private readonly subscribers = new Set<
    (value: EmployeeReleaseSnapshot) => void
  >();
  private target: Target | null = null;

  constructor(private readonly options: EmployeeReleaseOptions) {}
  current = () => this.snapshot;
  subscribe(listener: (value: EmployeeReleaseSnapshot) => void) {
    this.subscribers.add(listener);
    listener(this.snapshot);
    return () => this.subscribers.delete(listener);
  }

  openTask(
    identityGeneration: number,
    scope: EmployeeOperationalScope,
    taskId: string,
    sessionId: string,
  ) {
    if (
      this.target?.identityGeneration === identityGeneration &&
      this.target.organizationId === scope.organizationId &&
      this.target.locationId === scope.locationId &&
      this.target.membershipId === scope.membershipId &&
      this.target.shiftId === scope.shiftId &&
      this.target.role === scope.role &&
      this.target.taskId === taskId &&
      this.target.sessionId === sessionId &&
      this.snapshot.phase !== "inactive"
    ) {
      return this.active ?? Promise.resolve();
    }
    this.request += 1;
    this.active = undefined;
    this.target = {
      identityGeneration,
      locationId: scope.locationId,
      membershipId: scope.membershipId,
      organizationId: scope.organizationId,
      role: scope.role,
      sessionId,
      shiftId: scope.shiftId,
      taskId,
    };
    this.publish(emptyReleaseSnapshot(identityGeneration, scope, "loading"));
    return this.reconcile("loading");
  }

  checkServerState() {
    if (!this.target || isReleaseBusy(this.snapshot.phase)) {
      return this.active ?? Promise.resolve();
    }
    return this.reconcile("reconciling");
  }

  observeTaskAuthority(task: StaffTaskQueueItem | undefined) {
    const current = this.snapshot.task;
    if (
      !this.target ||
      this.snapshot.phase === "released" ||
      (current && sameReleaseTaskAuthority(current, task))
    ) {
      return Promise.resolve();
    }
    const protectedOutcome = isReleaseProtected(this.snapshot.phase);
    this.request += 1;
    this.active = undefined;
    if (protectedOutcome) {
      this.publish({ ...this.snapshot, failure: null, phase: "ambiguous" });
    }
    return this.reconcile("reconciling");
  }

  suspendForBackground() {
    if (!this.target || !isReleaseProtected(this.snapshot.phase)) return;
    this.request += 1;
    this.active = undefined;
    this.publish({ ...this.snapshot, failure: null, phase: "ambiguous" });
  }

  release() {
    if (this.active) return this.active;
    const target = this.target;
    const session = this.snapshot.session;
    const task = this.snapshot.task;
    const valid =
      target &&
      session &&
      task &&
      this.snapshot.phase === "ready" &&
      this.snapshot.releaseSatisfied === true &&
      session.state === "HANDOFF_PENDING" &&
      session.handoff.verification?.status === "VERIFIED" &&
      task.currentAssigneeMembershipId === target.membershipId;
    if (!valid) return Promise.resolve();
    const request = ++this.request;
    this.publish({ ...this.snapshot, failure: null, phase: "releasing" });
    const operation = this.execute(target, session, task, request).finally(
      () => {
        if (this.active === operation) this.active = undefined;
      },
    );
    this.active = operation;
    return operation;
  }

  clear() {
    this.request += 1;
    this.target = null;
    this.active = undefined;
    this.publish(emptyReleaseSnapshot());
  }

  private async execute(
    target: Target,
    session: NonNullable<EmployeeReleaseSnapshot["session"]>,
    task: NonNullable<EmployeeReleaseSnapshot["task"]>,
    request: number,
  ) {
    try {
      const result = await this.options.transport.complete(
        session.sessionId,
        session.version,
      );
      if (!this.isCurrent(target, request)) return;
      validateReleaseResult(
        session.sessionId,
        session.version,
        task.taskId,
        task.version,
        result,
      );
      this.publish(applyReleaseResult(this.snapshot, result));
    } catch (error) {
      if (!this.isCurrent(target, request)) return;
      const disposition = releaseFailureDisposition(error);
      const block =
        disposition === "authority" ||
        disposition === "financial" ||
        disposition === "verification"
          ? disposition
          : null;
      this.publish({
        ...this.snapshot,
        block,
        failure: operationalFailure(error),
        phase:
          disposition === "ambiguous"
            ? "ambiguous"
            : disposition === "conflict"
              ? "conflict"
              : "blocked",
      });
      if (disposition === "ambiguous") {
        this.active = undefined;
        await this.reconcile("reconciling");
      }
    }
  }

  private reconcile(phase: "loading" | "reconciling") {
    if (this.active) return this.active;
    const target = this.target;
    const scope = this.snapshot.scope;
    if (!target || !scope) return Promise.resolve();
    const request = ++this.request;
    const previous = this.snapshot;
    this.publish({ ...previous, failure: null, phase });
    const operation = (async () => {
      try {
        let next = await loadReleaseCanonical(
          this.options.transport,
          target,
          scope,
        );
        if (!this.isCurrent(target, request)) return;
        if (
          previous.block === "verification" &&
          next.phase === "ready" &&
          previous.session?.version === next.session?.version
        ) {
          next = { ...next, block: "verification", phase: "blocked" };
        }
        this.publish(next);
      } catch (error) {
        if (!this.isCurrent(target, request)) return;
        this.publish({
          ...this.snapshot,
          failure: operationalFailure(error),
          phase: previous.phase === "ambiguous" ? "ambiguous" : "unavailable",
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
      isReleaseTargetCurrent(this.snapshot, target)
    );
  }
  private publish(value: EmployeeReleaseSnapshot) {
    this.snapshot = value;
    this.options.onStateChange?.(value);
    this.subscribers.forEach((subscriber) => subscriber(value));
  }
}

export function isReleaseBusy(phase: EmployeeReleaseSnapshot["phase"]) {
  return phase === "releasing" || phase === "reconciling";
}

export function isReleaseProtected(phase: EmployeeReleaseSnapshot["phase"]) {
  return isReleaseBusy(phase) || phase === "ambiguous";
}

type ReleaseFailureDisposition =
  EmployeeReleaseBlock | "ambiguous" | "conflict";

function releaseFailureDisposition(error: unknown): ReleaseFailureDisposition {
  if (!(error instanceof EmployeeApiError)) return "ambiguous";
  if (
    isAmbiguousMutationFailure(error) ||
    error.code === "VERSION_CONFLICT" ||
    error.code === "RELEASE_RESPONSE_INVALID" ||
    error.code === "RELEASE_RESPONSE_MISMATCH"
  ) {
    return "ambiguous";
  }
  if (error.code === "FINANCIAL_RELEASE_NOT_SATISFIED") return "financial";
  if (error.code === "HANDOFF_VERIFICATION_FAILED") return "verification";
  if (
    error.code === "INVALID_STATE_TRANSITION" ||
    error.code === "KEY_CUSTODY_NOT_READY" ||
    error.code === "RETRIEVAL_REQUEST_NOT_READY" ||
    error.code === "TASK_INVALID_STATE"
  ) {
    return "conflict";
  }
  return "authority";
}
