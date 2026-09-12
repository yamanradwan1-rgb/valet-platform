import {
  isEmployeeAttemptScope,
  operationalFailure,
} from "./employee-operational-recovery";
import {
  isSameEmployeeOperationalScope,
  resolveEmployeeOperationalScope,
} from "./employee-operational-scope";
import {
  applyEmployeeOperationalScope,
  applyEmployeeQueueEvent,
  emptyEmployeeOperationalSnapshot,
  resetEmployeeOperationalContext,
} from "./employee-operational-state";
import {
  EmployeeTaskQueueOwner,
  type EmployeeQueueSnapshotEvent,
} from "./employee-task-queue-owner";
import { EmployeeTaskActionOwner } from "./employee-task-action-owner";
import type {
  EmployeeOperationalSessionOptions,
  EmployeeOperationalSnapshot,
} from "./employee-operational-types";

export class EmployeeOperationalSession {
  private readonly action: EmployeeTaskActionOwner;
  private activeContext:
    | { readonly generation: number; readonly promise: Promise<void> }
    | undefined;
  private contextSequence = 0;
  private foreground: boolean;
  private generation: number | null = null;
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
    this.action = new EmployeeTaskActionOwner({
      current: () => this.snapshot,
      isForeground: () => this.foreground,
      publish: (snapshot) => this.publish(snapshot),
      refreshQueue: () => this.queue.refresh(),
      transport: options.transport,
    });
    this.queue.setForeground(this.foreground);
  }
  current = () => this.snapshot;
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
      this.contextSequence += 1;
      this.activeContext = undefined;
      this.action.suspendForBackground();
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
    return this.action.acceptTask(taskId, this.generation);
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
      this.options.onOperationalContext?.(generation, response);
      const resolution = resolveEmployeeOperationalScope(response);
      if (resolution.phase !== "ready") {
        this.action.clear();
        this.queue.clear();
        this.publish({
          ...resetEmployeeOperationalContext(
            { ...this.snapshot, mutation: { phase: "idle" } },
            generation,
            resolution.phase,
          ),
          activeShiftCount:
            resolution.phase === "ambiguous-active-shifts"
              ? resolution.activeShiftCount
              : null,
        });
        return;
      }
      const retained =
        isSameEmployeeOperationalScope(this.snapshot.scope, resolution.scope) ||
        isEmployeeAttemptScope(
          this.action.currentAttempt(),
          generation,
          resolution.scope,
        );
      if (!retained) this.action.clear();
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

  private handleQueueEvent(event: EmployeeQueueSnapshotEvent): void {
    if (!isSameEmployeeOperationalScope(this.snapshot.scope, event.scope))
      return;
    if (event.hardStopped) this.action.clear();
    this.publish(
      applyEmployeeQueueEvent(
        this.snapshot,
        event,
        this.action.currentAttempt() !== undefined,
      ),
    );
    if (event.tasks !== undefined) this.action.reconcileCurrentQueue();
  }

  private invalidate(generation: number | null): void {
    this.contextSequence += 1;
    this.generation = generation;
    this.activeContext = undefined;
    this.action.clear();
    this.queue.clear();
    this.publish({
      ...emptyEmployeeOperationalSnapshot(),
      identityGeneration: generation,
    });
  }

  private publish(snapshot: EmployeeOperationalSnapshot): void {
    this.snapshot = snapshot;
    this.options.onStateChange?.(snapshot);
    for (const subscriber of this.subscribers) subscriber(snapshot);
  }
}
