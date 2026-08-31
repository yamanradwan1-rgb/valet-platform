import type { StaffAuthStatus } from "../../lib/auth/staff-auth-types";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { fetchTaskQueue } from "./task-queue-api";
import { handleTaskQueuePollError } from "./task-queue-controller-helpers";
import { TaskQueueTimer } from "./task-queue-timer";
import type {
  TaskQueueControllerOptions,
  TaskQueueState,
} from "./task-queue-types";
import { createEmptyTaskQueueState } from "./task-queue-types";

export type { TaskQueueControllerOptions, TaskQueueState };

export class TaskQueueController {
  private apiClient: EmployeeApiClient;
  private onAuthorizationLoss?: (() => void) | undefined;
  private onStateChange?: ((state: TaskQueueState) => void) | undefined;
  private timer: TaskQueueTimer;

  private status: StaffAuthStatus = "unauthenticated";
  private sessionGeneration = 0;
  private locationId: string | null = null;

  private sequenceNumber = 0;
  private latestCompletedSeq = 0;
  private activeRequestId: number | null = null;
  private activeAbortController: AbortController | null = null;
  private activeAbortRequestId: number | null = null;
  private isDestroyed = false;

  private state: TaskQueueState = createEmptyTaskQueueState();

  constructor(options: TaskQueueControllerOptions) {
    this.apiClient = options.apiClient;
    this.onAuthorizationLoss = options.onAuthorizationLoss;
    this.onStateChange = options.onStateChange;
    this.timer = new TaskQueueTimer(options.pollingIntervalMs ?? 5000, () =>
      this.handleTimerTick(),
    );
  }

  public getState(): TaskQueueState {
    return this.state;
  }

  public activate(onStateChange: (state: TaskQueueState) => void): void {
    this.isDestroyed = false;
    this.onStateChange = onStateChange;
  }

  public setApiClient(apiClient: EmployeeApiClient): void {
    this.apiClient = apiClient;
  }

  public setOnAuthorizationLoss(callback: (() => void) | undefined): void {
    this.onAuthorizationLoss = callback;
  }

  public setScope(
    status: StaffAuthStatus,
    sessionGeneration: number,
    locationId: string | null,
  ): void {
    if (this.isDestroyed) return;

    const prevStatus = this.status;
    const prevGen = this.sessionGeneration;
    const prevLoc = this.locationId;

    this.status = status;
    this.sessionGeneration = sessionGeneration;
    this.locationId = locationId;

    if (status !== "authenticated" || !locationId) {
      this.timer.stop();
      this.clearActiveRequest();
      this.sequenceNumber++;
      this.updateState({
        successfulSnapshotCount: 0,
        sessionGeneration: null,
        scopeLocationId: null,
        tasks: [],
        isLoading: false,
        isRefreshing: false,
        isHardStopped: false,
        error: null,
      });
      return;
    }

    if (
      prevStatus !== "authenticated" ||
      prevGen !== sessionGeneration ||
      prevLoc !== locationId
    ) {
      this.timer.stop();
      this.clearActiveRequest();
      this.sequenceNumber++;
      this.updateState({
        successfulSnapshotCount: this.state.successfulSnapshotCount ?? 0,
        sessionGeneration,
        scopeLocationId: locationId,
        tasks: [],
        isLoading: true,
        isRefreshing: false,
        isHardStopped: false,
        error: null,
      });
      void this.executePoll(true, sessionGeneration, locationId);
      this.timer.start();
    }
  }

  public handleVisibilityChange(visible: boolean): void {
    if (
      !this.isDestroyed &&
      visible &&
      !this.state.isHardStopped &&
      this.isActiveScope()
    ) {
      void this.executePoll(false, this.sessionGeneration, this.locationId!);
      this.timer.start();
    } else {
      this.timer.stop();
    }
  }

  public handleOnline(): void {
    if (
      !this.isDestroyed &&
      !this.state.isHardStopped &&
      this.isActiveScope()
    ) {
      void this.executePoll(false, this.sessionGeneration, this.locationId!);
      this.timer.start();
    }
  }

  public handleOffline(): void {
    this.timer.stop();
  }

  public async refresh(): Promise<void> {
    if (!this.isActiveScope()) return;
    await this.executePoll(false, this.sessionGeneration, this.locationId!);
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.timer.stop();
    this.clearActiveRequest();
    this.sequenceNumber++;
    this.status = "unauthenticated";
    this.sessionGeneration = 0;
    this.locationId = null;
    this.onStateChange = undefined;
    this.state = createEmptyTaskQueueState();
  }

  private isActiveScope(): boolean {
    return this.status === "authenticated" && this.locationId !== null;
  }

  private handleTimerTick(): void {
    if (this.isDestroyed || this.state.isHardStopped || !this.isActiveScope()) {
      this.timer.stop();
      return;
    }
    void this.executePoll(false, this.sessionGeneration, this.locationId!);
  }

  private clearActiveRequest(): void {
    this.activeRequestId = null;
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
      this.activeAbortRequestId = null;
    }
  }

  public async executePoll(
    isInitial: boolean,
    targetGen: number,
    targetLoc: string,
  ): Promise<void> {
    if (
      this.isDestroyed ||
      this.activeRequestId !== null ||
      this.state.isHardStopped ||
      !this.isActiveScope()
    ) {
      return;
    }

    const requestId = ++this.sequenceNumber;
    this.activeRequestId = requestId;

    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }
    const abortController = new AbortController();
    this.activeAbortController = abortController;
    this.activeAbortRequestId = requestId;

    this.updateState({
      ...this.state,
      sessionGeneration: targetGen,
      scopeLocationId: targetLoc,
      isLoading: isInitial && this.state.tasks.length === 0,
      isRefreshing: !isInitial || this.state.tasks.length > 0,
      error: null,
    });

    try {
      const response = await fetchTaskQueue(this.apiClient, targetLoc, {
        signal: abortController.signal,
      });

      if (
        this.isCurrentRequest(requestId, abortController, targetGen, targetLoc)
      ) {
        this.latestCompletedSeq = requestId;
        this.updateState({
          successfulSnapshotCount:
            (this.state.successfulSnapshotCount ?? 0) + 1,
          sessionGeneration: targetGen,
          scopeLocationId: targetLoc,
          tasks: response.tasks,
          isLoading: false,
          isRefreshing: false,
          isHardStopped: false,
          error: null,
        });
      }
    } catch (err: unknown) {
      if (
        this.isCurrentRequest(requestId, abortController, targetGen, targetLoc)
      ) {
        const { nextState, shouldStopTimer } = handleTaskQueuePollError(
          err,
          requestId,
          this.latestCompletedSeq,
          targetGen,
          this.state,
          this.onAuthorizationLoss,
        );
        if (shouldStopTimer) this.timer.stop();
        this.updateState(nextState);
      }
    } finally {
      if (this.activeRequestId === requestId) this.activeRequestId = null;
      if (this.activeAbortRequestId === requestId) {
        this.activeAbortController = null;
        this.activeAbortRequestId = null;
      }
      if (
        !this.isDestroyed &&
        !abortController.signal.aborted &&
        requestId === this.sequenceNumber &&
        this.locationId === targetLoc &&
        this.status === "authenticated" &&
        (this.state.isLoading || this.state.isRefreshing)
      ) {
        this.updateState({
          ...this.state,
          isLoading: false,
          isRefreshing: false,
        });
      }
    }
  }

  private isCurrentRequest(
    reqId: number,
    ctrl: AbortController,
    gen: number,
    loc: string,
  ): boolean {
    return (
      !this.isDestroyed &&
      !ctrl.signal.aborted &&
      reqId === this.sequenceNumber &&
      this.sessionGeneration === gen &&
      this.locationId === loc
    );
  }

  private updateState(nextState: TaskQueueState): void {
    if (this.isDestroyed) return;
    this.state = nextState;
    this.onStateChange?.(this.state);
  }
}
