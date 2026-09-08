import type {
  EndShiftResponse,
  StaffOperationalContextResponse,
} from "@valet/contracts";

import type { EmployeeShiftEndTransport } from "./employee-shift-end-types";

export const shiftEndIds = {
  location: "11111111-1111-4111-8111-111111111111",
  membership: "22222222-2222-4222-8222-222222222222",
  organization: "33333333-3333-4333-8333-333333333333",
  shift: "44444444-4444-4444-8444-444444444444",
};

export const shiftEndStartedAt = "2026-09-08T08:00:00.000Z";
export const shiftEndEndedAt = "2026-09-08T16:00:00.000Z";

export function shiftEndContext(
  overrides: {
    readonly locationId?: string;
    readonly membershipId?: string;
    readonly organizationId?: string;
    readonly shiftId?: string;
  } = {},
): StaffOperationalContextResponse {
  const locationId = overrides.locationId ?? shiftEndIds.location;
  return {
    contexts: [
      {
        activeShift: {
          locationId,
          shiftId: overrides.shiftId ?? shiftEndIds.shift,
          startedAt: shiftEndStartedAt,
          status: "ACTIVE",
        },
        currentLocation: {
          code: "AMM-1",
          currency: "JOD",
          locationId,
          name: "Amman Hotel",
        },
        eligibleLocations: [],
        membershipId: overrides.membershipId ?? shiftEndIds.membership,
        organization: {
          name: "VAYLET Operator",
          organizationId: overrides.organizationId ?? shiftEndIds.organization,
        },
        role: "VALET_EMPLOYEE",
      },
    ],
  };
}

export function endedShift(
  cashReported = "10.000",
  overrides: Partial<EndShiftResponse> = {},
): EndShiftResponse {
  return {
    cashReconciliation: {
      cashExpected: "9.000",
      cashReported,
      cashVariance: "1.000",
      currency: "JOD",
      reportedAt: shiftEndEndedAt,
    },
    endedAt: shiftEndEndedAt,
    locationId: shiftEndIds.location,
    shiftId: shiftEndIds.shift,
    startedAt: shiftEndStartedAt,
    status: "ENDED",
    ...overrides,
  };
}

export function deferredShiftEnd<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

export class StubShiftEndTransport implements EmployeeShiftEndTransport {
  readonly calls: Array<{ cashReported: string; shiftId: string }> = [];
  results: Array<Promise<EndShiftResponse>> = [];

  endShift(shiftId: string, cashReported: string): Promise<EndShiftResponse> {
    this.calls.push({ cashReported, shiftId });
    return (
      this.results.shift() ??
      Promise.reject(new Error("Unexpected End Shift call"))
    );
  }
}
