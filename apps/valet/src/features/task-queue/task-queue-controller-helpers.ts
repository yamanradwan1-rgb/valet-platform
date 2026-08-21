import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import type { TaskQueueState } from "./task-queue-types";

export function handleTaskQueuePollError(
  err: unknown,
  requestId: number,
  latestCompletedSeq: number,
  targetGeneration: number,
  currentState: TaskQueueState,
  onAuthLoss?: (() => void) | undefined,
): { nextState: TaskQueueState; shouldStopTimer: boolean } {
  if (
    err instanceof EmployeeApiError &&
    (err.status === 401 || err.status === 403 || err.status === 404)
  ) {
    onAuthLoss?.();
    return {
      nextState: {
        sessionGeneration: targetGeneration,
        scopeLocationId: null,
        tasks: [],
        isLoading: false,
        isRefreshing: false,
        isHardStopped: true,
        error: err,
      },
      shouldStopTimer: true,
    };
  }

  if (requestId > latestCompletedSeq) {
    return {
      nextState: {
        ...currentState,
        isLoading: false,
        isRefreshing: false,
        error: err instanceof Error ? err : new Error(String(err)),
      },
      shouldStopTimer: false,
    };
  }

  return { nextState: currentState, shouldStopTimer: false };
}
