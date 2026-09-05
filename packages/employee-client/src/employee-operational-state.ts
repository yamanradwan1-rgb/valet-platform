import type {
  EmployeeOperationalPhase,
  EmployeeOperationalScope,
  EmployeeOperationalSnapshot,
  EmployeeTaskMutationState,
} from "./employee-operational-types";
import type { EmployeeQueueSnapshotEvent } from "./employee-task-queue-owner";

export function emptyEmployeeOperationalSnapshot(): EmployeeOperationalSnapshot {
  return {
    contextFailure: null,
    identityGeneration: null,
    mutation: { phase: "idle" },
    phase: "inactive",
    queueFailure: null,
    queueHardStopped: false,
    queueLoading: false,
    queueRefreshing: false,
    successfulQueueSnapshotCount: 0,
    scope: null,
    tasks: [],
  };
}

export function isEmployeeMutationUnresolved(
  mutation: EmployeeTaskMutationState,
): boolean {
  return (
    mutation.phase === "submitting" ||
    mutation.phase === "reconciling" ||
    mutation.phase === "recovery-unavailable"
  );
}

export function resetEmployeeOperationalContext(
  current: EmployeeOperationalSnapshot,
  identityGeneration: number,
  phase: EmployeeOperationalPhase,
): EmployeeOperationalSnapshot {
  const reset = emptyEmployeeOperationalSnapshot();
  return {
    ...reset,
    identityGeneration,
    mutation: isEmployeeMutationUnresolved(current.mutation)
      ? current.mutation
      : reset.mutation,
    phase,
  };
}

export function applyEmployeeQueueEvent(
  current: EmployeeOperationalSnapshot,
  event: EmployeeQueueSnapshotEvent,
  hasPendingAttempt: boolean,
): EmployeeOperationalSnapshot {
  const mutation = event.hardStopped
    ? ({ phase: "idle" } as const)
    : event.failure !== null &&
        hasPendingAttempt &&
        current.mutation.phase === "reconciling"
      ? {
          ...current.mutation,
          failure: event.failure,
          phase: "recovery-unavailable" as const,
        }
      : current.mutation;
  return {
    ...current,
    mutation,
    queueFailure: event.failure,
    queueHardStopped: event.hardStopped,
    queueLoading: event.loading && current.tasks.length === 0,
    queueRefreshing:
      event.refreshing || (event.loading && current.tasks.length > 0),
    successfulQueueSnapshotCount: event.successfulSnapshotCount,
    tasks: event.hardStopped ? [] : (event.tasks ?? current.tasks),
  };
}

export function applyEmployeeOperationalScope(
  current: EmployeeOperationalSnapshot,
  generation: number,
  scope: EmployeeOperationalScope,
  retained: boolean,
  foreground: boolean,
): EmployeeOperationalSnapshot {
  if (retained) {
    return {
      ...current,
      contextFailure: null,
      phase: "ready",
      scope,
    };
  }
  return {
    ...resetEmployeeOperationalContext(
      { ...current, mutation: { phase: "idle" } },
      generation,
      "ready",
    ),
    queueLoading: foreground,
    scope,
  };
}
