import {
  sessionOverviewFilterStates,
  type SessionOverviewEntry,
  type SessionStateCountsResponse,
} from "@valet/contracts";
import { describe, expect, it } from "vitest";
import { operationalStaffName } from "../operational-staff";

import {
  formatLiveOperationsTime,
  liveOperationsKpis,
  liveRequesterTypeLabel,
  liveRetrievalStatusLabel,
  liveSessionStateLabel,
  liveTaskStatusLabel,
  liveVehicleLabel,
} from "./live-operations-presentation";

const session: SessionOverviewEntry = {
  sessionId: "77777777-7777-4777-8777-777777777701",
  state: "PARKED",
  createdAt: "2026-09-21T10:00:00.000Z",
  updatedAt: "2026-09-21T12:00:00.000Z",
  keySlotId: null,
  parkingSpotId: null,
  currentAssigneeMembershipId: "55555555-5555-4555-8555-555555555555",
  activeTask: null,
  keySlot: null,
  parkingSpot: null,
  parkingZone: null,
  vehicle: {
    make: null,
    model: null,
    color: null,
    vehicleId: "77777777-7777-4777-8777-777777777702",
    plateCountry: "JO",
    plateNumberNormalized: "12-34567",
    temporaryDescriptor: null,
  },
};

const counts: SessionStateCountsResponse = {
  counts: [
    { state: "AWAITING_PARKING", count: 1 },
    { state: "CHECKING_IN", count: 2 },
    { state: "COMPLETED", count: 90 },
    { state: "HANDOFF_PENDING", count: 3 },
    { state: "PARKED", count: 4 },
    { state: "PARKING", count: 5 },
    { state: "READY", count: 6 },
    { state: "REQUESTED", count: 7 },
    { state: "RETRIEVING", count: 8 },
  ],
};

describe("Live Operations presentation", () => {
  it("derives source-backed KPIs and excludes COMPLETED from active", () => {
    expect(liveOperationsKpis(counts)).toEqual({
      active: 36,
      requested: 7,
      inTransit: 13,
      handoffPending: 3,
    });
  });

  it("uses canonical server state groups", () => {
    expect(sessionOverviewFilterStates.CHECK_IN).toEqual([
      "CHECKING_IN",
      "AWAITING_PARKING",
    ]);
    expect(sessionOverviewFilterStates.IN_TRANSIT).toEqual([
      "PARKING",
      "RETRIEVING",
    ]);
    expect(sessionOverviewFilterStates.READY_HANDOFF).toEqual([
      "READY",
      "HANDOFF_PENDING",
    ]);
  });

  it("humanizes known session states in English and Arabic", () => {
    expect(liveSessionStateLabel("REQUESTED", "en")).toBe(
      "Retrieval Requested",
    );
    expect(liveSessionStateLabel("REQUESTED", "ar")).toBe("تم طلب الاسترجاع");
    expect(liveSessionStateLabel("HANDOFF_PENDING", "ar")).toBe(
      "بانتظار التسليم",
    );
  });

  it("keeps an unknown future state truthful instead of misclassifying it", () => {
    expect(liveSessionStateLabel("FUTURE_STATE", "en")).toBe(
      "State: FUTURE STATE",
    );
    expect(liveSessionStateLabel("FUTURE_STATE", "ar")).toBe(
      "حالة: FUTURE STATE",
    );
  });

  it("presents scoped assignee names without exposing membership identifiers", () => {
    const english = operationalStaffName(
        {
          membershipId: session.currentAssigneeMembershipId!,
          identity: {
            firstName: "Lina",
            lastName: "Haddad",
            email: "lina@example.com",
          },
        },
        "en",
      );
    expect(english).toBe("Lina Haddad");
    expect(english).not.toContain(session.currentAssigneeMembershipId!);
    expect(operationalStaffName(null, "en")).toBe("Unassigned");
    const arabic = operationalStaffName(
        {
          membershipId: session.currentAssigneeMembershipId!,
          identity: {
            firstName: "Lina",
            lastName: "Haddad",
            email: "lina@example.com",
          },
        },
        "ar",
      );
    expect(arabic).toBe("Lina Haddad");
    expect(arabic).not.toContain(session.currentAssigneeMembershipId!);
  });

  it("humanizes retrieval queue facts without inventing identity", () => {
    expect(liveRequesterTypeLabel("CUSTOMER", "en")).toBe("Customer");
    expect(liveRequesterTypeLabel("STAFF", "ar")).toBe("الموظفون");
    expect(liveRetrievalStatusLabel("OPEN", "en")).toBe("Open");
    expect(liveRetrievalStatusLabel("ACCEPTED", "ar")).toBe("مقبول");
    expect(liveTaskStatusLabel("QUEUED", "en")).toBe("Queued");
    expect(liveTaskStatusLabel("IN_PROGRESS", "ar")).toBe("قيد التنفيذ");
  });

  it("uses plate, descriptor, then null vehicle identity fallback", () => {
    expect(liveVehicleLabel(session)).toBe("12-34567");
    expect(
      liveVehicleLabel({
        ...session,
        vehicle: {
          ...session.vehicle,
          plateNumberNormalized: null,
          temporaryDescriptor: "Blue SUV near gate",
        },
      }),
    ).toBe("Blue SUV near gate");
    expect(
      liveVehicleLabel({
        ...session,
        vehicle: {
          ...session.vehicle,
          plateNumberNormalized: null,
          temporaryDescriptor: null,
        },
      }),
    ).toBeNull();
  });

  it("formats timestamps in the authoritative Location timezone", () => {
    const en = formatLiveOperationsTime(
      "2026-09-21T12:00:00.000Z",
      "Asia/Amman",
      "en",
    );
    const ar = formatLiveOperationsTime(
      "2026-09-21T12:00:00.000Z",
      "Asia/Amman",
      "ar",
    );
    expect(en).toContain("3:00");
    expect(en).not.toContain("12:00");
    expect(ar).not.toBe(en);
    expect(ar).toMatch(/[٠-٩]/u);
  });
});
