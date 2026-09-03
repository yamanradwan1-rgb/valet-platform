import { EmployeeApiError } from "./api-error";
import {
  isAmbiguousMutationFailure,
  operationalFailure,
  reconcileAcceptAttempt,
} from "./employee-operational-recovery";
import { resolveEmployeeOperationalScope } from "./employee-operational-scope";
import {
  emptyEmployeeOperationalSnapshot,
  resetEmployeeOperationalContext,
} from "./employee-operational-state";
import type {
  EmployeeAcceptAttempt as AcceptAttempt,
  EmployeeOperationalScope,
  EmployeeOperationalSessionOptions,
  EmployeeOperationalSnapshot,
} from "./employee-operational-types";

export class EmployeeOperationalSession {
  private activeAccept: Promise<void> | undefined;
  private contextSequence = 0;
  private generation: number | null = null;
  private pendingAttempt: AcceptAttempt | undefined;
  private queueSequence = 0;
  private snapshot = emptyEmployeeOperationalSnapshot();
  private readonly subscribers = new Set<
    (snapshot: EmployeeOperationalSnapshot) => void
  >();

  constructor(private readonly options: EmployeeOperationalSessionOptions) {}

  current(): EmployeeOperationalSnapshot {
    return this.snapshot;
  }

  subscribe(
    listener: (snapshot: EmployeeOperationalSnapshot) => void,
  ): () => void {
    this.subscribers.add(listener);
    listener(this.snapshot);
    return () => this.subscribers.delete(listener);
  }

  activate(identityGeneration: number): Promise<void> {
    if (this.generation !== identityGeneration) {
      this.invalidate(identityGeneration);
    }
    return this.loadContext(identityGeneration);
  }

  clear(): void {
    this.invalidate(null);
  }

  refresh(): Promise<void> {
    const generation = this.generation;
    if (generation === null) return Promise.resolve();
    return this.loadContext(generation);
  }

  refreshQueue(): Promise<void> {
    const generation = this.generation;
    const scope = this.snapshot.scope;
    if (generation === null || scope === null) return Promise.resolve();
    return this.loadQueue(generation, scope);
  }

  acceptTask(taskId: string): Promise<void> {
    if (this.pendingAttempt !== undefined) {
      return this.activeAccept ?? Promise.resolve();
    }
    const generation = this.generation;
    const scope = this.snapshot.scope;
    const task = this.snapshot.tasks.find(
      (candidate) => candidate.taskId === taskId,
    );
    if (
      generation === null ||
      scope === null ||
      task?.taskType !== "PARKING" ||
      task.status !== "ASSIGNED" ||
      task.currentAssigneeMembershipId !== scope.membershipId
    ) {
      return Promise.resolve();
    }
    const attempt: AcceptAttempt = {
      assigneeMembershipId: scope.membershipId,
      expectedVersion: task.version,
      generation,
      taskId,
    };
    const operation = this.runAccept(attempt);
    this.activeAccept = operation;
    return operation;
  }

  private async loadContext(generation: number): Promise<void> {
    const request = ++this.contextSequence;
    this.publish({
      ...this.snapshot,
      contextFailure: null,
      identityGeneration: generation,
      phase: "loading-context",
    });
    try {
      const response = await this.options.transport.loadOperationalContext();
      if (!this.isCurrent(generation) || request !== this.contextSequence)
        return;
      const resolution = resolveEmployeeOperationalScope(response);
      if (resolution.phase !== "ready") {
        this.publish(
          resetEmployeeOperationalContext(
            this.snapshot,
            generation,
            resolution.phase,
          ),
        );
        return;
      }
      const scope = resolution.scope;
      this.publish({
        ...resetEmployeeOperationalContext(this.snapshot, generation, "ready"),
        queueLoading: true,
        scope,
      });
      await this.loadQueue(generation, scope);
    } catch (error) {
      if (!this.isCurrent(generation) || request !== this.contextSequence)
        return;
      this.publish({
        ...resetEmployeeOperationalContext(this.snapshot, generation, "error"),
        contextFailure: operationalFailure(error),
      });
    }
  }

  private async loadQueue(
    generation: number,
    scope: EmployeeOperationalScope,
  ): Promise<void> {
    const request = ++this.queueSequence;
    this.publish({ ...this.snapshot, queueFailure: null, queueLoading: true });
    try {
      const response = await this.options.transport.loadTaskQueue(
        scope.locationId,
      );
      if (!this.isCurrentScope(generation, scope, request)) return;
      this.publish({
        ...this.snapshot,
        queueFailure: null,
        queueLoading: false,
        tasks: response.tasks.filter((task) => task.taskType === "PARKING"),
      });
      this.reconcilePendingAttempt();
    } catch (error) {
      if (!this.isCurrentScope(generation, scope, request)) return;
      this.publish({
        ...this.snapshot,
        mutation:
          this.pendingAttempt === undefined ||
          this.snapshot.mutation.phase === "submitting"
            ? this.snapshot.mutation
            : {
                ...this.snapshot.mutation,
                failure: operationalFailure(error),
                phase: "recovery-unavailable",
              },
        queueFailure: operationalFailure(error),
        queueLoading: false,
      });
    }
  }

  private async runAccept(attempt: AcceptAttempt): Promise<void> {
    this.pendingAttempt = attempt;
    this.publish({
      ...this.snapshot,
      mutation: {
        expectedVersion: attempt.expectedVersion,
        phase: "submitting",
        taskId: attempt.taskId,
      },
    });
    try {
      await this.options.transport.acceptTask(
        attempt.taskId,
        attempt.expectedVersion,
      );
      if (!this.isCurrent(attempt.generation)) return;
      this.publishReconciling(attempt);
      await this.refreshQueue();
    } catch (error) {
      if (!this.isCurrent(attempt.generation)) return;
      if (
        error instanceof EmployeeApiError &&
        error.code === "VERSION_CONFLICT"
      ) {
        this.publishReconciling(attempt);
        await this.refreshQueue();
        return;
      }
      if (isAmbiguousMutationFailure(error)) {
        this.publishReconciling(attempt);
        await this.refreshQueue();
        return;
      }
      this.pendingAttempt = undefined;
      this.activeAccept = undefined;
      this.publish({
        ...this.snapshot,
        mutation: {
          expectedVersion: attempt.expectedVersion,
          failure: operationalFailure(error),
          phase: "failed",
          taskId: attempt.taskId,
        },
      });
    }
  }

  private publishReconciling(attempt: AcceptAttempt): void {
    this.publish({
      ...this.snapshot,
      mutation: {
        expectedVersion: attempt.expectedVersion,
        phase: "reconciling",
        taskId: attempt.taskId,
      },
    });
  }

  private reconcilePendingAttempt(): void {
    const attempt = this.pendingAttempt;
    if (
      attempt === undefined ||
      !this.isCurrent(attempt.generation) ||
      (this.snapshot.mutation.phase !== "reconciling" &&
        this.snapshot.mutation.phase !== "recovery-unavailable")
    ) {
      return;
    }
    const task = this.snapshot.tasks.find(
      (candidate) => candidate.taskId === attempt.taskId,
    );
    const phase = reconcileAcceptAttempt({
      assigneeMembershipId: attempt.assigneeMembershipId,
      expectedVersion: attempt.expectedVersion,
      task,
    });
    this.pendingAttempt = undefined;
    this.activeAccept = undefined;
    this.publish({
      ...this.snapshot,
      mutation: {
        expectedVersion: attempt.expectedVersion,
        phase,
        taskId: attempt.taskId,
      },
    });
  }

  private invalidate(generation: number | null): void {
    this.contextSequence += 1;
    this.queueSequence += 1;
    this.generation = generation;
    this.pendingAttempt = undefined;
    this.activeAccept = undefined;
    this.publish({
      ...emptyEmployeeOperationalSnapshot(),
      identityGeneration: generation,
    });
  }

  private isCurrent(generation: number): boolean {
    return this.generation === generation;
  }

  private isCurrentScope(
    generation: number,
    scope: EmployeeOperationalScope,
    request: number,
  ): boolean {
    return (
      this.isCurrent(generation) &&
      this.snapshot.scope?.locationId === scope.locationId &&
      request === this.queueSequence
    );
  }

  private publish(snapshot: EmployeeOperationalSnapshot): void {
    this.snapshot = snapshot;
    this.options.onStateChange?.(snapshot);
    for (const subscriber of this.subscribers) subscriber(snapshot);
  }
}
