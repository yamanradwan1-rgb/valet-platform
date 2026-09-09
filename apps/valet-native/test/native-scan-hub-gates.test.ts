import type {
  EmployeeOperationalScope,
  EmployeeParkingStartSnapshot,
  EmployeeRetrievalSnapshot,
} from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";

import {
  deriveNativeScanHubGates,
  keySlotGate,
  launchNativeScanHubTile,
  licensePlateGate,
  parkingSpotGate,
  pickupHandoffGate,
  scanHubLaunchTarget,
} from "../src/scan/native-scan-hub-gates";
import { getNativeScanHubCopy } from "../src/scan/native-scan-hub-copy";

const scope: EmployeeOperationalScope = {
  locationCode: "AMM",
  locationId: "11111111-1111-4111-8111-111111111111",
  locationName: "Amman Hotel",
  membershipId: "22222222-2222-4222-8222-222222222222",
  organizationId: "33333333-3333-4333-8333-333333333333",
  organizationName: "Operator",
  role: "VALET_EMPLOYEE",
  shiftId: "44444444-4444-4444-8444-444444444444",
  shiftStartedAt: "2026-09-09T08:00:00.000Z",
};
const parking = {
  failure: null,
  identityGeneration: 7,
  phase: "started",
  scope,
  session: {
    locationId: scope.locationId,
    sessionId: "55555555-5555-4555-8555-555555555555",
    state: "PARKING",
    version: 8,
  },
  task: {
    currentAssigneeMembershipId: scope.membershipId,
    sessionId: "55555555-5555-4555-8555-555555555555",
    status: "IN_PROGRESS",
    taskId: "66666666-6666-4666-8666-666666666666",
    taskType: "PARKING",
    valetSessionState: "PARKING",
    valetSessionVersion: 8,
    version: 4,
  },
} as EmployeeParkingStartSnapshot;
const retrieval = {
  failure: null,
  identityGeneration: 7,
  keyConfirmed: true,
  keySlotCandidate: "K-09",
  phase: "retrieving",
  readyAt: null,
  retrievalStartedAt: "2026-09-09T09:00:00.000Z",
  scope,
  session: {
    locationId: scope.locationId,
    sessionId: "77777777-7777-4777-8777-777777777777",
    state: "RETRIEVING",
    version: 10,
  },
  task: {
    currentAssigneeMembershipId: scope.membershipId,
    sessionId: "77777777-7777-4777-8777-777777777777",
    status: "IN_PROGRESS",
    taskId: "88888888-8888-4888-8888-888888888888",
    taskType: "RETRIEVAL",
    valetSessionState: "RETRIEVING",
    valetSessionVersion: 10,
    version: 6,
  },
} as EmployeeRetrievalSnapshot;
const inactiveParking = {
  failure: null,
  identityGeneration: null,
  phase: "inactive",
  scope: null,
  session: null,
  task: null,
} as EmployeeParkingStartSnapshot;
const inactiveRetrieval = {
  failure: null,
  identityGeneration: null,
  keyConfirmed: false,
  keySlotCandidate: "",
  phase: "inactive",
  readyAt: null,
  retrievalStartedAt: null,
  scope: null,
  session: null,
  task: null,
} as EmployeeRetrievalSnapshot;
const authority = { identityGeneration: 7, scope };

describe("Native Scan Hub authority gates", () => {
  it("keeps License Plate available with exact EN/AR copy and Check-In route", () => {
    expect(licensePlateGate()).toEqual({
      available: true,
      context: null,
      disabledReason: null,
    });
    expect(getNativeScanHubCopy("en").licensePlateSubtitle).toBe(
      "Check in a new vehicle",
    );
    expect(getNativeScanHubCopy("ar").licensePlateSubtitle).toBe(
      "تسجيل مركبة جديدة",
    );
    const gates = deriveNativeScanHubGates({
      identityGeneration: 7,
      parking: inactiveParking,
      retrieval: inactiveRetrieval,
      scope,
    });
    expect(scanHubLaunchTarget("licensePlate", gates)).toBe("check-in");
  });

  it("keeps Key Slot disabled with the exact reason and no route", () => {
    expect(keySlotGate()).toEqual({
      available: false,
      context: null,
      disabledReason: "keySlotDisabled",
    });
    expect(getNativeScanHubCopy("en").keySlotDisabled).toBe(
      "Open the vehicle workflow first.",
    );
    const navigate = vi.fn();
    const gates = deriveNativeScanHubGates({
      identityGeneration: 7,
      parking: inactiveParking,
      retrieval: inactiveRetrieval,
      scope,
    });
    expect(scanHubLaunchTarget("keySlot", gates)).toBeNull();
    expect(launchNativeScanHubTile("keySlot", gates, navigate)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("disables Parking without sufficient held authority", () => {
    const gate = parkingSpotGate(inactiveParking, authority);
    expect(gate).toEqual({
      available: false,
      context: null,
      disabledReason: "parkingDisabled",
    });
    expect(getNativeScanHubCopy("en").parkingDisabled).toBe(
      "Open an active parking task first.",
    );
    const gates = deriveNativeScanHubGates({
      identityGeneration: 7,
      parking: inactiveParking,
      retrieval: inactiveRetrieval,
      scope,
    });
    const navigate = vi.fn();
    expect(launchNativeScanHubTile("parkingSpot", gates, navigate)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("reuses unchanged authoritative Parking context without mutation", () => {
    const gate = parkingSpotGate(parking, authority);
    expect(gate.available).toBe(true);
    expect(gate.context).toBe(parking);
    expect(getNativeScanHubCopy("en").parkingResume).toBe(
      "Resume active parking",
    );
    expect(getNativeScanHubCopy("ar").parkingResume).toBe(
      "استئناف عملية الإيقاف الجارية",
    );
    const gates = deriveNativeScanHubGates({
      identityGeneration: 7,
      parking,
      retrieval: inactiveRetrieval,
      scope,
    });
    const navigate = vi.fn();
    expect(launchNativeScanHubTile("parkingSpot", gates, navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith("parking");
  });

  it("disables Pickup Handoff without sufficient held authority", () => {
    const gate = pickupHandoffGate(inactiveRetrieval, authority);
    expect(gate).toEqual({
      available: false,
      context: null,
      disabledReason: "retrievalDisabled",
    });
    expect(getNativeScanHubCopy("en").retrievalDisabled).toBe(
      "Open an active retrieval task first.",
    );
    const gates = deriveNativeScanHubGates({
      identityGeneration: 7,
      parking: inactiveParking,
      retrieval: inactiveRetrieval,
      scope,
    });
    const navigate = vi.fn();
    expect(launchNativeScanHubTile("pickupHandoff", gates, navigate)).toBe(
      false,
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("reuses unchanged authoritative Retrieval context without mutation", () => {
    const gate = pickupHandoffGate(retrieval, authority);
    expect(gate.available).toBe(true);
    expect(gate.context).toBe(retrieval);
    expect(getNativeScanHubCopy("en").retrievalResume).toBe(
      "Resume active retrieval",
    );
    expect(getNativeScanHubCopy("ar").retrievalResume).toBe(
      "استئناف عملية الاسترجاع الجارية",
    );
    const gates = deriveNativeScanHubGates({
      identityGeneration: 7,
      parking: inactiveParking,
      retrieval,
      scope,
    });
    const navigate = vi.fn();
    expect(launchNativeScanHubTile("pickupHandoff", gates, navigate)).toBe(
      true,
    );
    expect(navigate).toHaveBeenCalledExactlyOnceWith("retrieval");
  });

  it("fails closed for stale identity, scope, or mismatched projections", () => {
    expect(
      parkingSpotGate(parking, { ...authority, identityGeneration: 8 })
        .available,
    ).toBe(false);
    expect(
      pickupHandoffGate(retrieval, {
        ...authority,
        scope: { ...scope, locationId: "99999999-9999-4999-8999-999999999999" },
      }).available,
    ).toBe(false);
    expect(
      parkingSpotGate(
        {
          ...parking,
          task: { ...parking.task!, sessionId: "different-session" },
        },
        authority,
      ).available,
    ).toBe(false);
  });
});
