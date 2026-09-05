import {
  createEmployeeQueueAttempt,
  isEmployeeAttemptScope,
  operationalFailure,
  reconcileAcceptAttempt,
} from "./employee-operational-recovery";
import {
  isSameEmployeeOperationalScope,
  resolveEmployeeOperationalScope,
} from "./employee-operational-scope";
import {
  applyEmployeeMutationPhase,
  applyEmployeeOperationalScope,
  applyEmployeeQueueEvent,
  emptyEmployeeOperationalSnapshot,
  resetEmployeeOperationalContext,
} from "./employee-operational-state";
import {
  EmployeeTaskQueueOwner,
  type EmployeeQueueSnapshotEvent,
} from "./employee-task-queue-owner";
import { executeEmployeeTaskAction } from "./employee-task-action-runner";
import type {
  EmployeeAcceptAttempt as AcceptAttempt,
  EmployeeOperationalSessionOptions,
  EmployeeOperationalSnapshot,
} from "./employee-operational-types";

export class EmployeeOperationalSession {
  private activeAccept: Promise<void> | undefined;
  private activeContext:
    | { readonly generation: number; readonly promise: Promise<void> }
    | undefined;
  private contextSequence = 0;
  private foreground: boolean;
  private generation: number | null = null;
  private pendingAttempt: AcceptAttempt | undefined;
  private readonly queue: EmployeeTaskQueueOwner;
  private snapshot = emptyEmployeeOperationalSnapshot();
  private readonly subscribers = new Set<
    (snapshot: EmployeeOperationalSnapshot) => void
  >();
  constructor(private readonly options: EmployeeOperationalSessionOptions) {
    this.foreground = options.initialForeground ?? true;
    this.queue = new EmployeeTaskQueueOwner({
      intervalMs: options.pollingIntervalMs ?? 5000,
      onSnapshot: (event) => this.handleQueueEvent(event),
      transport: options.transport,
    });
    this.queue.setForeground(this.foreground);
  }

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
    if (this.generation !== identityGeneration)
      this.invalidate(identityGeneration);
    return this.loadContext(identityGeneration);
  }

  setForeground(foreground: boolean): Promise<void> {
    if (this.foreground === foreground) return Promise.resolve();
    this.foreground = foreground;
    if (!foreground) {
      this.queue.setForeground(false);
      return Promise.resolve();
    }

    return this.refresh().then(async () => {
      if (!this.foreground) return;
      this.queue.setForeground(true);
      await this.queue.refresh(
        this.snapshot.successfulQueueSnapshotCount === 0,
      );
    });
  }

  clear(): void {
    this.invalidate(null);
  }

  dispose(): void {
    this.invalidate(null);
    this.queue.dispose();
    this.subscribers.clear();
  }

  refresh(): Promise<void> {
    const generation = this.generation;
    return generation === null
      ? Promise.resolve()
      : this.loadContext(generation);
  }

  refreshQueue(): Promise<void> {
    return this.queue.refresh();
  }

  acceptTask(taskId: string): Promise<void> {
    if (this.pendingAttempt !== undefined) {
      return this.activeAccept ?? Promise.resolve();
    }
    const generation = this.generation;
    const attempt = createEmployeeQueueAttempt(
      this.snapshot,
      generation,
      taskId,
    );
    if (attempt === undefined) return Promise.resolve();
    const operation = this.runAccept(attempt);
    this.activeAccept = operation;
    return operation;
  }

  private loadContext(generation: number): Promise<void> {
    if (this.activeContext?.generation === generation) {
      return this.activeContext.promise;
    }
    const request = ++this.contextSequence;
    const operation = this.executeContextLoad(generation, request).finally(
      () => {
        if (this.activeContext?.promise === operation)
          this.activeContext = undefined;
      },
    );
    this.activeContext = { generation, promise: operation };
    return operation;
  }

  private async executeContextLoad(
    generation: number,
    request: number,
  ): Promise<void> {
    this.publish({
      ...this.snapshot,
      contextFailure: null,
      identityGeneration: generation,
      phase: "loading-context",
    });
    try {
      const response = await this.options.transport.loadOperationalContext();
      if (this.generation !== generation || request !== this.contextSequence)
        return;
      const resolution = resolveEmployeeOperationalScope(response);
      if (resolution.phase !== "ready") {
        this.clearPendingAction();
        this.queue.clear();
        this.publish(
          resetEmployeeOperationalContext(
            { ...this.snapshot, mutation: { phase: "idle" } },
            generation,
            resolution.phase,
          ),
        );
        return;
      }
      const retained =
        isSameEmployeeOperationalScope(this.snapshot.scope, resolution.scope) ||
        isEmployeeAttemptScope(
          this.pendingAttempt,
          generation,
          resolution.scope,
        );
      if (!retained) this.clearPendingAction();
      this.publish(
        applyEmployeeOperationalScope(
          this.snapshot,
          generation,
          resolution.scope,
          retained,
          this.foreground,
        ),
      );
      await this.queue.setScope(generation, resolution.scope).promise;
    } catch (error) {
      if (this.generation !== generation || request !== this.contextSequence)
        return;
      this.queue.suspend();
      this.publish({
        ...resetEmployeeOperationalContext(this.snapshot, generation, "error"),
        contextFailure: operationalFailure(error),
      });
    }
  }

  private async runAccept(attempt: AcceptAttempt): Promise<void> {
    this.pendingAttempt = attempt;
    this.publish(
      applyEmployeeMutationPhase(this.snapshot, attempt, "submitting"),
    );
    const result = await executeEmployeeTaskAction(
      attempt,
      this.options.transport,
      () =>
        !this.snapshot.queueHardStopped &&
        isEmployeeAttemptScope(attempt, this.generation, this.snapshot.scope),
    );
    if (result.kind === "stale") {
      if (this.pendingAttempt === attempt) {
        this.publish(
          applyEmployeeMutationPhase(this.snapshot, attempt, "reconciling"),
        );
      }
      return;
    }
    if (result.kind === "reconcile") {
      this.publish(
        applyEmployeeMutationPhase(this.snapshot, attempt, "reconciling"),
      );
      await this.queue.refresh(false, true);
      return;
    }
    this.pendingAttempt = undefined;
    this.activeAccept = undefined;
    this.publish({
      ...this.snapshot,
      mutation: {
        expectedVersion: attempt.expectedVersion,
        failure: result.failure,
        phase: "failed",
        taskId: attempt.taskId,
      },
    });
  }

  private handleQueueEvent(event: EmployeeQueueSnapshotEvent): void {
    if (!isSameEmployeeOperationalScope(this.snapshot.scope, event.scope))
      return;
    if (event.hardStopped) this.clearPendingAction();
    this.publish(
      applyEmployeeQueueEvent(
        this.snapshot,
        event,
        this.pendingAttempt !== undefined,
      ),
    );
    if (event.tasks !== undefined) this.reconcilePendingAttempt();
  }

  private reconcilePendingAttempt(): void {
    const attempt = this.pendingAttempt;
    if (
      attempt === undefined ||
      this.generation !== attempt.generation ||
      (this.snapshot.mutation.phase !== "reconciling" &&
        this.snapshot.mutation.phase !== "recovery-unavailable")
    ) {
      return;
    }
    const task = this.snapshot.tasks.find(
      (item) => item.taskId === attempt.taskId,
    );
    const phase = reconcileAcceptAttempt({ ...attempt, task });
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
    this.generation = generation;
    this.activeContext = undefined;
    this.clearPendingAction();
    this.queue.clear();
    this.publish({
      ...emptyEmployeeOperationalSnapshot(),
      identityGeneration: generation,
    });
  }

  private clearPendingAction(): void {
    this.pendingAttempt = undefined;
    this.activeAccept = undefined;
  }

  private publish(snapshot: EmployeeOperationalSnapshot): void {
    this.snapshot = snapshot;
    this.options.onStateChange?.(snapshot);
    for (const subscriber of this.subscribers) subscriber(snapshot);
  }
}
