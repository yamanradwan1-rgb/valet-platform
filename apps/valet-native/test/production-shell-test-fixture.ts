import type {
  EmployeeOperationalScope,
  EmployeeOperationalSnapshot,
  NativeAuthPhase,
  NativeAuthSnapshot,
} from "@valet/employee-client";

export const scope: EmployeeOperationalScope = {
  locationCode: "AMM-1",
  locationId: "11111111-1111-4111-8111-111111111111",
  locationName: "Amman Hotel",
  membershipId: "22222222-2222-4222-8222-222222222222",
  organizationId: "33333333-3333-4333-8333-333333333333",
  organizationName: "VAYLET Operator",
  role: "VALET_EMPLOYEE",
  shiftId: "44444444-4444-4444-8444-444444444444",
  shiftStartedAt: "2026-09-05T08:00:00.000Z",
};

export function auth(
  phase: NativeAuthPhase,
  authGeneration = 1,
): NativeAuthSnapshot {
  return { authGeneration, phase };
}

export function operations(
  phase: EmployeeOperationalSnapshot["phase"],
  options: {
    readonly generation?: number | null;
    readonly retainedScope?: EmployeeOperationalScope | null;
    readonly failureCode?: string;
  } = {},
): EmployeeOperationalSnapshot {
  return {
    contextFailure: options.failureCode
      ? { code: options.failureCode, message: "Safe failure" }
      : null,
    identityGeneration:
      options.generation === undefined ? 1 : options.generation,
    mutation: { phase: "idle" },
    phase,
    queueFailure: null,
    queueLoading: false,
    scope:
      options.retainedScope === undefined
        ? phase === "ready"
          ? scope
          : null
        : options.retainedScope,
    tasks: [],
  };
}
