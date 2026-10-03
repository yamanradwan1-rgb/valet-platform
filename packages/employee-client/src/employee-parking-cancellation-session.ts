import { EmployeeApiError } from "./api-error";
import { isAmbiguousMutationFailure } from "./employee-operational-recovery";
import type { CancelBeforeParkingResponse } from "@valet/contracts";
import type {
  EmployeeParkingCancellationOptions,
  EmployeeParkingCancellationSnapshot,
  EmployeeParkingCancellationTarget as Target,
} from "./employee-parking-cancellation-types";

export class EmployeeParkingCancellationSession {
  private snapshot: EmployeeParkingCancellationSnapshot = {
    phase: "idle",
    target: null,
  };
  private generation = 0;
  private foreground = true;
  private activePost: Promise<void> | undefined;
  private activeRead: Promise<void> | undefined;
  private readonly subscribers = new Set<
    (value: EmployeeParkingCancellationSnapshot) => void
  >();
  constructor(private readonly options: EmployeeParkingCancellationOptions) {}
  current = () => this.snapshot;
  subscribe(listener: (value: EmployeeParkingCancellationSnapshot) => void) {
    this.subscribers.add(listener);
    listener(this.snapshot);
    return () => {
      this.subscribers.delete(listener);
    };
  }
  confirm(target: Target): void {
    if (this.protected() || !this.foreground || !this.options.isCurrent(target))
      return;
    this.clear();
    this.publish({
      phase: "confirming",
      target: { ...target, scope: { ...target.scope } },
    });
  }
  dismiss(): void {
    if (this.snapshot.phase === "confirming" || this.snapshot.phase === "error")
      this.clear();
  }
  protected(): boolean {
    return ["submitting", "uncertain", "reconciling"].includes(
      this.snapshot.phase,
    );
  }
  submit(): Promise<void> {
    if (this.activePost) return this.activePost;
    const target = this.snapshot.target;
    if (!target || !this.foreground || this.snapshot.phase !== "confirming")
      return Promise.resolve();
    if (!this.options.isCurrent(target)) {
      this.clear();
      return Promise.resolve();
    }
    const generation = ++this.generation;
    this.publish({ phase: "submitting", target });
    const operation = this.post(target, generation).finally(() => {
      if (this.activePost === operation) this.activePost = undefined;
    });
    this.activePost = operation;
    return operation;
  }
  checkServerState(): Promise<void> {
    if (this.activeRead) return this.activeRead;
    const target = this.snapshot.target;
    if (!target || !this.foreground || this.snapshot.phase === "submitting")
      return Promise.resolve();
    if (!this.options.isCurrent(target)) {
      this.clear();
      return Promise.resolve();
    }
    const generation = ++this.generation;
    this.publish({ phase: "reconciling", target });
    const operation = this.read(target, generation).finally(() => {
      if (this.activeRead === operation) this.activeRead = undefined;
    });
    this.activeRead = operation;
    return operation;
  }
  retry(): void {
    if (
      this.snapshot.phase === "retry" &&
      this.snapshot.target &&
      this.foreground
    )
      this.confirm(this.snapshot.target);
  }
  suspendForBackground(): void {
    this.foreground = false;
    this.generation += 1;
    this.activeRead = undefined;
    const target = this.snapshot.target;
    if (target && this.protected())
      this.publish({ phase: "uncertain", target });
    else this.clear();
  }
  resumeAfterAuthorityValidation(): Promise<void> {
    this.foreground = true;
    return this.snapshot.phase === "uncertain"
      ? this.checkServerState()
      : Promise.resolve();
  }
  clear(): void {
    this.generation += 1;
    this.activeRead = undefined;
    // An outstanding POST keeps its single-flight slot until it settles.
    this.publish({ phase: "idle", target: null });
  }
  private currentTarget(target: Target, generation: number) {
    return (
      this.foreground &&
      generation === this.generation &&
      this.snapshot.target === target &&
      this.options.isCurrent(target)
    );
  }
  private success(
    target: Target,
    generation: number,
    result: CancelBeforeParkingResponse,
  ): void {
    if (!this.currentTarget(target, generation)) return;
    if (
      result.sessionId !== target.sessionId ||
      result.taskId !== target.taskId ||
      result.sessionVersion <= target.expectedSessionVersion ||
      result.taskVersion <= target.expectedTaskVersion
    )
      throw new EmployeeApiError({
        code: "PARKING_CANCELLATION_RESPONSE_MISMATCH",
        message: "The cancellation result did not match the target.",
        status: 502,
      });
    this.publish({ phase: "cancelled", target: null });
    this.generation += 1;
    this.options.onCancelled(result);
  }
  private async post(target: Target, generation: number): Promise<void> {
    try {
      this.success(
        target,
        generation,
        await this.options.transport.cancel(target),
      );
    } catch (error) {
      if (!this.currentTarget(target, generation)) return;
      if (isAmbiguousMutationFailure(error)) {
        this.publish({ phase: "uncertain", target });
        await this.checkServerState();
      } else if (
        error instanceof EmployeeApiError &&
        [401, 403, 404].includes(error.status)
      )
        this.clear();
      else {
        this.publish({ phase: "error", target });
        await this.checkServerState();
      }
    }
  }
  private async read(target: Target, generation: number): Promise<void> {
    try {
      const result = await this.options.transport.status(target);
      if (!this.currentTarget(target, generation)) return;
      if (
        result.sessionId !== target.sessionId ||
        result.taskId !== target.taskId
      )
        throw new EmployeeApiError({
          code: "PARKING_CANCELLATION_RESPONSE_MISMATCH",
          message: "The status result did not match the target.",
          status: 502,
        });
      if (result.outcome === "CANCELLED")
        this.success(target, generation, result);
      else if (result.classification === "PRE_CUSTODY")
        this.publish({
          phase: "retry",
          target: {
            ...target,
            expectedSessionVersion: result.sessionVersion,
            expectedTaskVersion: result.taskVersion,
          },
        });
      else this.publish({ phase: "conflict", target });
    } catch (error) {
      if (!this.currentTarget(target, generation)) return;
      if (
        error instanceof EmployeeApiError &&
        [401, 403, 404].includes(error.status)
      )
        this.clear();
      else this.publish({ phase: "uncertain", target });
    }
  }
  private publish(value: EmployeeParkingCancellationSnapshot): void {
    this.snapshot = value;
    for (const subscriber of this.subscribers) subscriber(value);
  }
}
