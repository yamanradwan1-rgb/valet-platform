import type {
  EmployeeOperationalPhase,
  EmployeeOperationalSnapshot,
  EmployeeTaskMutationState,
} from "./employee-operational-types";

export function emptyEmployeeOperationalSnapshot(): EmployeeOperationalSnapshot {
  return {
    contextFailure: null,
    identityGeneration: null,
    mutation: { phase: "idle" },
    phase: "inactive",
    queueFailure: null,
    queueLoading: false,
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
