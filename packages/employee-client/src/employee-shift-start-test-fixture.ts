import type {
  StaffOperationalContextResponse,
  StaffOperationalLocation,
  StartShiftResponse,
} from "@valet/contracts";

import type { EmployeeShiftStartTransport } from "./employee-shift-start-types";

export const shiftStartIds = {
  locationA: "11111111-1111-4111-8111-111111111111",
  locationB: "22222222-2222-4222-8222-222222222222",
  membership: "33333333-3333-4333-8333-333333333333",
  organization: "44444444-4444-4444-8444-444444444444",
  shift: "55555555-5555-4555-8555-555555555555",
};

export function shiftStartLocation(
  locationId = shiftStartIds.locationA,
  code = "AMM-1",
): StaffOperationalLocation {
  return { code, currency: "JOD", locationId, name: `Location ${code}` };
}

export function shiftStartContext(
  options: {
    readonly activeLocationId?: string | null;
    readonly locations?: readonly StaffOperationalLocation[];
    readonly membershipId?: string;
    readonly organizationId?: string;
  } = {},
): StaffOperationalContextResponse {
  const locations = options.locations ?? [shiftStartLocation()];
  const activeLocationId = options.activeLocationId ?? null;
  const activeLocation =
    locations.find(({ locationId }) => locationId === activeLocationId) ??
    (activeLocationId === null
      ? null
      : shiftStartLocation(activeLocationId, "ACTIVE"));
  return {
    contexts: [
      {
        activeShift:
          activeLocation === null
            ? null
            : {
                locationId: activeLocation.locationId,
                shiftId: shiftStartIds.shift,
                startedAt: "2026-09-06T08:00:00.000Z",
                status: "ACTIVE",
              },
        currentLocation: activeLocation,
        eligibleLocations: [...locations],
        membershipId: options.membershipId ?? shiftStartIds.membership,
        organization: {
          name: "VAYLET Operator",
          organizationId: options.organizationId ?? shiftStartIds.organization,
        },
        role: "VALET_EMPLOYEE",
      },
    ],
  };
}

export function activeShiftResponse(
  locationId = shiftStartIds.locationA,
): StartShiftResponse {
  return {
    endedAt: null,
    locationId,
    shiftId: shiftStartIds.shift,
    startedAt: "2026-09-06T08:00:00.000Z",
    status: "ACTIVE",
  };
}

export function deferredShiftStart<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

export class StubShiftStartTransport implements EmployeeShiftStartTransport {
  readonly calls: string[] = [];
  results: Array<Promise<StartShiftResponse>> = [];

  startShift(targetLocationId: string): Promise<StartShiftResponse> {
    this.calls.push(targetLocationId);
    const result = this.results.shift();
    return result ?? Promise.reject(new Error("Unexpected Start Shift call"));
  }
}
