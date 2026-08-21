import type { StaffTaskQueueItem } from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import { fetchTaskQueue } from "./task-queue-api";

export interface TaskQueueState {
  readonly scopeLocationId: string | null;
  readonly tasks: StaffTaskQueueItem[];
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly isHardStopped: boolean;
  readonly error: Error | null;
}

export interface TaskQueueControllerOptions {
  readonly apiClient: EmployeeApiClient;
  readonly pollingIntervalMs?: number | undefined;
  readonly onAuthorizationLoss?: (() => void) | undefined;
  readonly onStateChange?: ((state: TaskQueueState) => void) | undefined;
}

export class TaskQueueController {
  private apiClient: EmployeeApiClient;
  private pollingIntervalMs: number;
  private onAuthorizationLoss?: (() => void) | undefined;
  private onStateChange?: ((state: TaskQueueState) => void) | undefined;

  private status: "authenticated" | "unauthenticated" | "initializing" =
    "unauthenticated";
  private locationId: string | null = null;

  private inFlight = false;
  private sequenceNumber = 0;
  private latestCompletedSeq = 0;
  private activeAbortController: AbortController | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  private state: TaskQueueState = {
    scopeLocationId: null,
    tasks: [],
    isLoading: false,
    isRefreshing: false,
    isHardStopped: false,
    error: null,
  };

  constructor(options: TaskQueueControllerOptions) {
    this.apiClient = options.apiClient;
    this.pollingIntervalMs = options.pollingIntervalMs ?? 5000;
    this.onAuthorizationLoss = options.onAuthorizationLoss;
    this.onStateChange = options.onStateChange;
  }

  public getState(): TaskQueueState {
    return this.state;
  }

  public setApiClient(apiClient: EmployeeApiClient): void {
    this.apiClient = apiClient;
  }

  public setOnAuthorizationLoss(callback: (() => void) | undefined): void {
    this.onAuthorizationLoss = callback;
  }

  public setScope(
    status: "authenticated" | "unauthenticated" | "initializing",
    locationId: string | null,
  ): void {
    const prevStatus = this.status;
    const prevLocationId = this.locationId;

    this.status = status;
    this.locationId = locationId;

    if (status !== "authenticated" || !locationId) {
      this.stopTimer();
      if (this.activeAbortController) {
        this.activeAbortController.abort();
        this.activeAbortController = null;
      }
      this.inFlight = false;
      this.sequenceNumber++;
      this.updateState({
        scopeLocationId: null,
        tasks: [],
        isLoading: false,
        isRefreshing: false,
        isHardStopped: false,
        error: null,
      });
      return;
    }

    if (prevStatus !== "authenticated" || prevLocationId !== locationId) {
      this.stopTimer();
      if (this.activeAbortController) {
        this.activeAbortController.abort();
        this.activeAbortController = null;
      }
      this.inFlight = false;
      this.sequenceNumber++;
      this.updateState({
        scopeLocationId: locationId,
        tasks: [],
        isLoading: true,
        isRefreshing: false,
        isHardStopped: false,
        error: null,
      });
      void this.executePoll(true);
      this.startTimer();
    }
  }

  public handleVisibilityChange(visible: boolean): void {
    if (
      visible &&
      !this.state.isHardStopped &&
      this.status === "authenticated" &&
      this.locationId
    ) {
      void this.executePoll(false);
      this.startTimer();
    } else {
      this.stopTimer();
    }
  }

  public handleOnline(): void {
    if (
      !this.state.isHardStopped &&
      this.status === "authenticated" &&
      this.locationId
    ) {
      void this.executePoll(false);
      this.startTimer();
    }
  }

  public handleOffline(): void {
    this.stopTimer();
  }

  public destroy(): void {
    this.stopTimer();
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    this.inFlight = false;
    this.sequenceNumber++;
    this.onStateChange = undefined;
    this.updateState({
      scopeLocationId: null,
      tasks: [],
      isLoading: false,
      isRefreshing: false,
      isHardStopped: false,
      error: null,
    });
  }

  public async executePoll(isInitial: boolean): Promise<void> {
    if (
      this.inFlight ||
      this.state.isHardStopped ||
      this.status !== "authenticated" ||
      !this.locationId
    ) {
      return;
    }

    this.inFlight = true;
    const currentSeq = ++this.sequenceNumber;
    const targetLocationId = this.locationId;

    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }
    const abortController = new AbortController();
    this.activeAbortController = abortController;

    this.updateState({
      ...this.state,
      isLoading: isInitial && this.state.tasks.length === 0,
      isRefreshing: !isInitial || this.state.tasks.length > 0,
      error: null,
    });

    try {
      const response = await fetchTaskQueue(this.apiClient, targetLocationId, {
        signal: abortController.signal,
      });

      if (
        !abortController.signal.aborted &&
        currentSeq > this.latestCompletedSeq &&
        this.status === "authenticated" &&
        this.locationId === targetLocationId
      ) {
        this.latestCompletedSeq = currentSeq;
        this.updateState({
          scopeLocationId: targetLocationId,
          tasks: response.tasks,
          isLoading: false,
          isRefreshing: false,
          isHardStopped: false,
          error: null,
        });
      }
    } catch (err: unknown) {
      if (
        !abortController.signal.aborted &&
        this.status === "authenticated" &&
        this.locationId === targetLocationId
      ) {
        if (
          err instanceof EmployeeApiError &&
          (err.status === 401 || err.status === 403 || err.status === 404)
        ) {
          this.stopTimer();
          this.updateState({
            scopeLocationId: null,
            tasks: [],
            isLoading: false,
            isRefreshing: false,
            isHardStopped: true,
            error: err,
          });
          this.onAuthorizationLoss?.();
        } else if (currentSeq > this.latestCompletedSeq) {
          this.updateState({
            ...this.state,
            isLoading: false,
            isRefreshing: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      }
    } finally {
      this.inFlight = false;
      if (
        !abortController.signal.aborted &&
        this.locationId === targetLocationId &&
        this.status === "authenticated"
      ) {
        if (this.state.isLoading || this.state.isRefreshing) {
          this.updateState({
            ...this.state,
            isLoading: false,
            isRefreshing: false,
          });
        }
      }
    }
  }

  private startTimer(): void {
    this.stopTimer();
    if (
      this.state.isHardStopped ||
      this.status !== "authenticated" ||
      !this.locationId
    ) {
      return;
    }
    this.pollTimer = setInterval(() => {
      if (
        this.state.isHardStopped ||
        this.status !== "authenticated" ||
        !this.locationId
      ) {
        this.stopTimer();
        return;
      }
      void this.executePoll(false);
    }, this.pollingIntervalMs);
  }

  private stopTimer(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private updateState(nextState: TaskQueueState): void {
    this.state = nextState;
    this.onStateChange?.(this.state);
  }
}
