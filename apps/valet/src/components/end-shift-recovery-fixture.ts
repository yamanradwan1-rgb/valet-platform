import type { StaffOperationalMembershipContext } from "@valet/contracts";

import type { OperationalScopeResolution } from "../features/staff-operational-context";

// Synthetic, non-authoritative test identities and cash amounts.
export const SHIFT_A = "55555555-5555-4555-8555-555555555555";
export const SHIFT_B = "66666666-6666-4666-8666-666666666666";
export const LOCATION = "11111111-1111-4111-8111-111111111111";
export const CASH = "12.500";
const MEMBERSHIP = "33333333-3333-4333-8333-333333333333";
const ORGANIZATION = "44444444-4444-4444-8444-444444444444";

export function activeResolution(shiftId: string): OperationalScopeResolution {
  const activeContext: StaffOperationalMembershipContext = {
    activeShift: {
      locationId: LOCATION,
      shiftId,
      startedAt: "2026-10-29T07:00:00.000Z",
      status: "ACTIVE",
    },
    currentLocation: {
      code: "AMM-01",
      currency: "JOD",
      locationId: LOCATION,
      name: "Amman Ridge Hotel",
      timezone: "Asia/Amman",
    },
    eligibleLocations: [],
    membershipId: MEMBERSHIP,
    organization: { name: "Apex Valet", organizationId: ORGANIZATION },
    role: "VALET_EMPLOYEE",
  };
  return {
    kind: "RESOLVED",
    scope: {
      activeContext,
      currency: "JOD",
      locationCode: "AMM-01",
      locationId: LOCATION,
      locationName: "Amman Ridge Hotel",
      membershipId: MEMBERSHIP,
      organizationId: ORGANIZATION,
      organizationName: "Apex Valet",
      role: "VALET_EMPLOYEE",
      shiftId,
      shiftStartedAt: activeContext.activeShift!.startedAt,
    },
  };
}

export function endedResponse(shiftId: string) {
  return {
    cashReconciliation: {
      cashExpected: CASH,
      cashReported: CASH,
      cashVariance: "0.000",
      currency: "JOD",
      reportedAt: "2026-10-29T08:00:00.000Z",
    },
    endedAt: "2026-10-29T08:00:00.000Z",
    locationId: LOCATION,
    shiftId,
    startedAt: "2026-10-29T07:00:00.000Z",
    status: "ENDED" as const,
  };
}
