import { describe, expect, it } from "vitest";
import type { StaffOperationalMembershipContext } from "@valet/contracts";

import type { StartShiftPhase } from "./start-shift-controller";
import { shouldReconcileUncertainStart } from "./start-shift-reconciliation";

const LOCATION_A = "11111111-1111-4111-8111-111111111111";
const LOCATION_B = "22222222-2222-4222-8222-222222222222";

function membershipContextAt(
  locationId: string,
): StaffOperationalMembershipContext {
  return {
    activeShift: {
      locationId,
      shiftId: "33333333-3333-4333-8333-333333333333",
      startedAt: "2026-08-26T08:00:00.000Z",
      status: "ACTIVE",
    },
    currentLocation: {
      code: locationId === LOCATION_A ? "AMM-01" : "DEM-01",
      currency: "JOD",
      locationId,
      name: "Location",
      timezone: "Asia/Amman",
    },
    eligibleLocations: [],
    membershipId: "44444444-4444-4444-8444-444444444444",
    organization: {
      name: "Apex Valet",
      organizationId: "55555555-5555-4555-8555-555555555555",
    },
    role: "VALET_EMPLOYEE",
  };
}

function resolvedAt(locationId: string) {
  return {
    kind: "RESOLVED" as const,
    scope: {
      activeContext: membershipContextAt(locationId),
      currency: "JOD",
      locationCode: "LOC-01",
      locationId,
      locationName: "Location",
      membershipId: "44444444-4444-4444-8444-444444444444",
      organizationId: "55555555-5555-4555-8555-555555555555",
      organizationName: "Apex Valet",
      role: "VALET_EMPLOYEE" as const,
      shiftId: "33333333-3333-4333-8333-333333333333",
      shiftStartedAt: "2026-08-26T08:00:00.000Z",
    },
  };
}

function uncertainAt(locationId: string): StartShiftPhase {
  return { kind: "uncertain", targetLocationId: locationId };
}

describe("VUI-011D uncertain Start Shift context reconciliation", () => {
  it("resolves the stale intent only when authoritative context proves an ACTIVE Shift at the SAME target Location", () => {
    expect(shouldReconcileUncertainStart(uncertainAt(LOCATION_A), resolvedAt(LOCATION_A))).toBe(true);
  });

  it("keeps the intent uncertain while authoritative context still reports NO_ACTIVE_SHIFT", () => {
    expect(
      shouldReconcileUncertainStart(uncertainAt(LOCATION_A), {
        kind: "NO_ACTIVE_SHIFT",
      }),
    ).toBe(false);
  });

  it("does not silently reclassify the retained intent for an ACTIVE Shift at an unrelated Location", () => {
    expect(
      shouldReconcileUncertainStart(uncertainAt(LOCATION_A), resolvedAt(LOCATION_B)),
    ).toBe(false);
  });

  it("does not reconcile against ambiguous multi-shift contexts", () => {
    expect(
      shouldReconcileUncertainStart(uncertainAt(LOCATION_A), {
        count: 2,
        kind: "AMBIGUOUS_ACTIVE_SHIFTS",
      }),
    ).toBe(false);
  });

  it("never reconciles non-uncertain phases", () => {
    const resolved = resolvedAt(LOCATION_A);
    const phases: StartShiftPhase[] = [
      { kind: "idle" },
      { kind: "submitting" },
      {
        code: "NETWORK_ERROR",
        kind: "error",
        locationConflict: false,
        message: "failed",
      },
      { kind: "started", result: {
        endedAt: null,
        locationId: LOCATION_A,
        shiftId: "33333333-3333-4333-8333-333333333333",
        startedAt: "2026-08-26T08:00:00.000Z",
        status: "ACTIVE",
      } },
    ];
    for (const phase of phases) {
      expect(shouldReconcileUncertainStart(phase, resolved)).toBe(false);
    }
  });
});
