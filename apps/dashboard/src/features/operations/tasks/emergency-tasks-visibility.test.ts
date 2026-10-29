import { describe, expect, it } from "vitest";
import {
  canOfferEmergencyTakeover,
  supervisorEmergencyTaskVisible,
} from "./emergency-tasks-visibility";
import { selectedOperationsLocation } from "../operations-location";

describe("Supervisor emergency Tasks visibility", () => {
  const parking = { status: "IN_PROGRESS", taskType: "PARKING" } as const;
  const retrieval = { status: "IN_PROGRESS", taskType: "RETRIEVAL" } as const;

  it("shows only in-progress Parking and Retrieval tasks", () => {
    expect(supervisorEmergencyTaskVisible(parking)).toBe(true);
    expect(supervisorEmergencyTaskVisible(retrieval)).toBe(true);
    for (const status of ["QUEUED", "ASSIGNED", "ACCEPTED", "COMPLETED", "CANCELLED"] as const) {
      expect(supervisorEmergencyTaskVisible({ status, taskType: "PARKING" })).toBe(false);
      expect(supervisorEmergencyTaskVisible({ status, taskType: "RETRIEVAL" })).toBe(false);
    }
  });

  it("permits a takeover action to Supervisor or CA, never LM", () => {
    expect(canOfferEmergencyTakeover("SUPERVISOR", retrieval)).toBe(true);
    expect(canOfferEmergencyTakeover("COMPANY_ADMIN", parking)).toBe(true);
    expect(canOfferEmergencyTakeover("LOCATION_MANAGER", parking)).toBe(false);
    expect(canOfferEmergencyTakeover("SUPERVISOR", { ...retrieval, status: "COMPLETED" })).toBe(false);
  });

  it("uses the Shift's exact operational Location without inventing commercial scope", () => {
    const location = {
      locationId: "22222222-2222-4222-8222-222222222222",
      code: "MAIN", currency: "JOD", name: "Main", timezone: "Asia/Amman",
    };
    expect(selectedOperationsLocation({
      authority: "SUPERVISOR",
      context: {
        authority: "SUPERVISOR",
        membershipId: "33333333-3333-4333-8333-333333333333",
        organization: { organizationId: "11111111-1111-4111-8111-111111111111", name: "Org" },
        location,
        activeShift: {
          shiftId: "44444444-4444-4444-8444-444444444444",
          locationId: location.locationId,
          startedAt: "2026-10-29T06:00:00Z", status: "ACTIVE",
        },
      },
    })).toEqual({ ...location, status: "ACTIVE" });
  });
});
