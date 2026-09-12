import {
  createEmployeeQueueAttempt,
  isEmployeeAttemptScope,
  reconcileAcceptAttempt,
} from "./employee-operational-recovery";
import { applyEmployeeMutationPhase } from "./employee-operational-state";
import { executeEmployeeTaskAction } from "./employee-task-action-runner";
import type {
  EmployeeAcceptAttempt,
  EmployeeOperationalSnapshot,
  EmployeeOperationalTransport,
} from "./employee-operational-types";

interface EmployeeTaskActionOwnerOptions {
  readonly current: () => EmployeeOperationalSnapshot;
  readonly isForeground: () => boolean;
  readonly publish: (snapshot: EmployeeOperationalSnapshot) => void;
  readonly refreshQueue: () => Promise<void>;
  readonly transport: EmployeeOperationalTransport;
}

/** Owns one in-process Task claim/accept attempt and its lifecycle fence. */
export class EmployeeTaskActionOwner {
  private active: Promise<void> | undefined;
  private attempt: EmployeeAcceptAttempt | undefined;
  private sequence = 0;

  constructor(private readonly options: EmployeeTaskActionOwnerOptions) {}

  currentAttempt(): EmployeeAcceptAttempt | undefined {
    return this.attempt;
  }

  acceptTask(taskId: string, generation: number | null): Promise<void> {
    if (this.attempt !== undefined) return this.active ?? Promise.resolve();
    if (!this.options.isForeground()) return Promise.resolve();
    const attempt = createEmployeeQueueAttempt(
      this.options.current(),
      generation,
      taskId,
    );
    if (attempt === undefined) return Promise.resolve();
    const sequence = ++this.sequence;
    const operation = this.run(attempt, sequence).finally(() => {
      if (this.active === operation) this.active = undefined;
    });
    this.active = operation;
    return operation;
  }

  suspendForBackground(): void {
    if (this.attempt === undefined) return;
    this.sequence += 1;
    this.active = undefined;
    this.options.publish(
      applyEmployeeMutationPhase(
        this.options.current(),
        this.attempt,
        "reconciling",
      ),
    );
  }

  clear(): void {
    this.sequence += 1;
    this.attempt = undefined;
    this.active = undefined;
  }

  reconcileCurrentQueue(): void {
    const attempt = this.attempt;
    const snapshot = this.options.current();
    if (
      attempt === undefined ||
      snapshot.identityGeneration !== attempt.generation ||
      (snapshot.mutation.phase !== "reconciling" &&
        snapshot.mutation.phase !== "recovery-unavailable")
    )
      return;
    const task = snapshot.tasks.find((item) => item.taskId === attempt.taskId);
    const phase = reconcileAcceptAttempt({ ...attempt, task });
    this.clear();
    this.options.publish({
      ...snapshot,
      mutation: {
        expectedVersion: attempt.expectedVersion,
        phase,
        taskId: attempt.taskId,
      },
    });
  }

  private async run(
    attempt: EmployeeAcceptAttempt,
    sequence: number,
  ): Promise<void> {
    this.attempt = attempt;
    this.options.publish(
      applyEmployeeMutationPhase(this.options.current(), attempt, "submitting"),
    );
    const result = await executeEmployeeTaskAction(
      attempt,
      this.options.transport,
      () => this.isCurrent(attempt, sequence),
    );
    if (result.kind === "stale" || !this.isCurrent(attempt, sequence)) {
      this.preserveUnresolved(attempt);
      return;
    }
    if (result.kind === "reconcile") {
      this.options.publish(
        applyEmployeeMutationPhase(
          this.options.current(),
          attempt,
          "reconciling",
        ),
      );
      if (!this.isCurrent(attempt, sequence)) return;
      await this.options.refreshQueue();
      return;
    }
    this.clear();
    this.options.publish({
      ...this.options.current(),
      mutation: {
        expectedVersion: attempt.expectedVersion,
        failure: result.failure,
        phase: "failed",
        taskId: attempt.taskId,
      },
    });
  }

  private preserveUnresolved(attempt: EmployeeAcceptAttempt): void {
    if (this.attempt !== attempt) return;
    this.options.publish(
      applyEmployeeMutationPhase(
        this.options.current(),
        attempt,
        "reconciling",
      ),
    );
  }

  private isCurrent(attempt: EmployeeAcceptAttempt, sequence: number): boolean {
    const snapshot = this.options.current();
    return (
      this.options.isForeground() &&
      sequence === this.sequence &&
      this.attempt === attempt &&
      !snapshot.queueHardStopped &&
      isEmployeeAttemptScope(
        attempt,
        snapshot.identityGeneration,
        snapshot.scope,
      )
    );
  }
}
