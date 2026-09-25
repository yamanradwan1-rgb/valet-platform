import type { SessionOverviewEntry, SessionStateCountsResponse } from "@valet/contracts";
import { describe, expect, it } from "vitest";

import {
  filterLiveSessions,
  formatLiveOperationsTime,
  liveAssignmentLabel,
  liveOperationsKpis,
  liveSessionStateLabel,
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
  vehicle: {
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

  it("groups only loaded-page canonical states", () => {
    const items = [
      { ...session, state: "CHECKING_IN" as const },
      { ...session, sessionId: "77777777-7777-4777-8777-777777777711", state: "AWAITING_PARKING" as const },
      { ...session, sessionId: "77777777-7777-4777-8777-777777777712", state: "PARKING" as const },
      { ...session, sessionId: "77777777-7777-4777-8777-777777777713", state: "RETRIEVING" as const },
      { ...session, sessionId: "77777777-7777-4777-8777-777777777714", state: "READY" as const },
      { ...session, sessionId: "77777777-7777-4777-8777-777777777715", state: "HANDOFF_PENDING" as const },
    ];
    expect(filterLiveSessions(items, "CHECK_IN").map((item) => item.state))
      .toEqual(["CHECKING_IN", "AWAITING_PARKING"]);
    expect(filterLiveSessions(items, "IN_TRANSIT").map((item) => item.state))
      .toEqual(["PARKING", "RETRIEVING"]);
    expect(filterLiveSessions(items, "READY_HANDOFF").map((item) => item.state))
      .toEqual(["READY", "HANDOFF_PENDING"]);
  });

  it("humanizes known session states in English and Arabic", () => {
    expect(liveSessionStateLabel("REQUESTED", "en")).toBe("Retrieval Requested");
    expect(liveSessionStateLabel("REQUESTED", "ar")).toBe("تم طلب الاسترجاع");
    expect(liveSessionStateLabel("HANDOFF_PENDING", "ar")).toBe("بانتظار التسليم");
  });

  it("keeps an unknown future state truthful instead of misclassifying it", () => {
    expect(liveSessionStateLabel("FUTURE_STATE", "en")).toBe("State: FUTURE STATE");
    expect(liveSessionStateLabel("FUTURE_STATE", "ar")).toBe("حالة: FUTURE STATE");
  });

  it("presents assignment presence without exposing membership identity", () => {
    expect(liveAssignmentLabel(session.currentAssigneeMembershipId, "en")).toBe("Assigned");
    expect(liveAssignmentLabel(null, "en")).toBe("Unassigned");
    expect(liveAssignmentLabel(session.currentAssigneeMembershipId, "ar")).toBe("مسندة");
  });

  it("uses plate, descriptor, then null vehicle identity fallback", () => {
    expect(liveVehicleLabel(session)).toBe("12-34567");
    expect(liveVehicleLabel({
      ...session,
      vehicle: {
        ...session.vehicle,
        plateNumberNormalized: null,
        temporaryDescriptor: "Blue SUV near gate",
      },
    })).toBe("Blue SUV near gate");
    expect(liveVehicleLabel({
      ...session,
      vehicle: {
        ...session.vehicle,
        plateNumberNormalized: null,
        temporaryDescriptor: null,
      },
    })).toBeNull();
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
