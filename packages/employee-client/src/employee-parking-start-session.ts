import type { StaffTaskQueueItem } from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import {
  isAmbiguousMutationFailure,
  operationalFailure,
} from "./employee-operational-recovery";
import type { EmployeeOperationalScope } from "./employee-operational-types";
import {
  classifyParkingStartCanonical,
  assertParkingStartResultMatches,
  emptyParkingStartSnapshot,
  findParkingStartTask,
  isParkingStartTargetCurrent,
  parkingStartConflictCodes,
  parkingStartReadFailurePhase,
  type EmployeeParkingStartTarget as Target,
} from "./employee-parking-start-recovery";
import type {
  EmployeeParkingStartOptions,
  EmployeeParkingStartSnapshot,
} from "./employee-parking-start-types";

export class EmployeeParkingStartSession {
  private activeCommand: Promise<void> | undefined;
  private activeRead: Promise<void> | undefined;
  private request = 0;
  private boundary = 0;
  private snapshot = emptyParkingStartSnapshot();
  private readonly subscribers = new Set<
    (snapshot: EmployeeParkingStartSnapshot) => void
  >();
  private target: Target | null = null;

  constructor(private readonly options: EmployeeParkingStartOptions) {}
  current = () => this.snapshot;
  workflowRevision = () => this.boundary;
  subscribe(listener: (snapshot: EmployeeParkingStartSnapshot) => void) {
    this.subscribers.add(listener);
    listener(this.snapshot);
    return () => this.subscribers.delete(listener);
  }
  openQueueTask(
    identityGeneration: number,
    scope: EmployeeOperationalScope,
    taskId: string,
    sessionId: string,
  ): Promise<void> {
    this.bind(identityGeneration, scope, taskId, sessionId);
    return this.reconcile("loading");
  }
  openCompletedCheckIn(
    identityGeneration: number,
    scope: EmployeeOperationalScope,
    sessionId: string,
  ): Promise<void> {
    this.bind(identityGeneration, scope, null, sessionId);
    return this.queueAndReconcile(this.request);
  }

  checkServerState(): Promise<void> {
    if (this.target === null || this.snapshot.phase === "submitting") {
      return this.activeCommand ?? Promise.resolve();
    }
    return this.reconcile(
      this.snapshot.phase === "ambiguous" ? "reconciling" : "loading",
    );
  }
  suspendForBackground(): void {
    if (this.target === null) return;
    const protectedOutcome = this.activeCommand !== undefined;
    this.fenceActiveWork();
    if (protectedOutcome)
      this.publish({ ...this.snapshot, failure: null, phase: "ambiguous" });
  }

  startParking(): Promise<void> {
    if (this.activeCommand !== undefined) return this.activeCommand;
    const target = this.target;
    const task = this.snapshot.task;
    const session = this.snapshot.session;
    if (
      target === null ||
      task === null ||
      session === null ||
      this.snapshot.phase !== "accepted"
    ) {
      return Promise.resolve();
    }
    const request = ++this.request;
    this.publish({ ...this.snapshot, failure: null, phase: "submitting" });
    const operation = this.executeStart(target, task, session, request).finally(
      () => {
        if (this.activeCommand === operation) this.activeCommand = undefined;
      },
    );
    this.activeCommand = operation;
    return operation;
  }

  clear(): void {
    this.fenceActiveWork();
    this.target = null;
    this.publish(emptyParkingStartSnapshot());
  }

  private bind(
    identityGeneration: number,
    scope: EmployeeOperationalScope,
    taskId: string | null,
    sessionId: string,
  ): void {
    this.fenceActiveWork();
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
      emptyParkingStartSnapshot(identityGeneration, scope, "loading"),
    );
  }

  private async queueAndReconcile(request: number): Promise<void> {
    const target = this.target;
    if (target === null) return;
    try {
      const task = await this.options.transport.queueParkingTask(
        target.sessionId,
      );
      if (!this.isCurrent(target, request)) return;
      if (task.sessionId !== target.sessionId) {
        throw new EmployeeApiError({
          code: "PARKING_TASK_RESPONSE_MISMATCH",
          message: "The Parking Task result did not match the current work.",
          status: 502,
        });
      }
      target.taskId = task.taskId;
    } catch (error) {
      if (!this.isCurrent(target, request)) return;
      if (!isAmbiguousMutationFailure(error)) {
        this.publish({
          ...this.snapshot,
          failure: operationalFailure(error),
          phase: "unavailable",
        });
        return;
      }
    }
    await this.reconcile("loading");
  }

  private reconcile(phase: "loading" | "reconciling"): Promise<void> {
    if (this.activeRead !== undefined) return this.activeRead;
    const target = this.target;
    if (target === null) return Promise.resolve();
    const request = ++this.request;
    const previous = this.snapshot.phase;
    this.publish({ ...this.snapshot, failure: null, phase });
    const operation = this.executeRead(target, request, previous).finally(
      () => {
        if (this.activeRead === operation) this.activeRead = undefined;
      },
    );
    this.activeRead = operation;
    return operation;
  }

  private async executeRead(
    target: Target,
    request: number,
    previous: EmployeeParkingStartSnapshot["phase"],
  ): Promise<void> {
    try {
      const queue = await this.options.transport.loadTaskQueue(
        target.locationId,
      );
      const task = findParkingStartTask(queue, target);
      if (task === undefined)
        throw new EmployeeApiError({
          code: "PARKING_TASK_CHANGED",
          message: "The Parking Task is no longer available.",
          status: 409,
        });
      const session = await this.options.transport.loadSession(task.sessionId);
      if (!this.isCurrent(target, request)) return;
      target.taskId = task.taskId;
      this.publish({
        ...this.snapshot,
        failure: null,
        phase: classifyParkingStartCanonical(target, task, session),
        session,
        task,
      });
    } catch (error) {
      if (!this.isCurrent(target, request)) return;
      this.publish({
        ...this.snapshot,
        failure: operationalFailure(error),
        phase: parkingStartReadFailurePhase(previous),
      });
    }
  }

  private async executeStart(
    target: Target,
    task: StaffTaskQueueItem,
    session: NonNullable<EmployeeParkingStartSnapshot["session"]>,
    request: number,
  ): Promise<void> {
    try {
      const result = await this.options.transport.startParking(
        session.sessionId,
        session.version,
        task.version,
      );
      if (!this.isCurrent(target, request)) return;
      assertParkingStartResultMatches(result, task, session);
      this.publish({
        ...this.snapshot,
        failure: null,
        phase: "started",
        session: {
          ...session,
          parking: {
            ...session.parking,
            parkingStartedAt: result.parkingStartedAt,
          },
          state: result.state,
          version: result.sessionVersion,
        },
        task: {
          ...task,
          status: result.taskStatus,
          valetSessionState: result.state,
          valetSessionVersion: result.sessionVersion,
          version: result.taskVersion,
        },
      });
    } catch (error) {
      if (!this.isCurrent(target, request)) return;
      if (isAmbiguousMutationFailure(error)) {
        this.publish({
          ...this.snapshot,
          failure: operationalFailure(error),
          phase: "ambiguous",
        });
        await this.reconcile("reconciling");
        return;
      }
      if (
        error instanceof EmployeeApiError &&
        parkingStartConflictCodes.has(error.code)
      ) {
        this.publish({
          ...this.snapshot,
          failure: operationalFailure(error),
          phase: "conflict",
        });
        await this.reconcile("reconciling");
        return;
      }
      this.publish({
        ...this.snapshot,
        failure: operationalFailure(error),
        phase: "conflict",
      });
    }
  }

  private isCurrent(target: Target, request?: number): boolean {
    return (
      this.target === target &&
      isParkingStartTargetCurrent(this.snapshot, target) &&
      (request === undefined || request === this.request)
    );
  }

  private fenceActiveWork(): void {
    this.boundary += 1;
    this.request += 1;
    this.activeCommand = undefined;
    this.activeRead = undefined;
  }

  private publish(snapshot: EmployeeParkingStartSnapshot): void {
    this.snapshot = snapshot;
    this.options.onStateChange?.(snapshot);
    for (const subscriber of this.subscribers) subscriber(snapshot);
  }
}
