import type { SessionOverviewEntry } from "@valet/contracts";
import { describe, expect, it } from "vitest";

import {
  formatOperationsTime,
  operationsAssignmentLabel,
  operationsSessionStateLabel,
  operationsTaskStatusLabel,
  operationsTaskTypeLabel,
  operationsVehicleLabel,
} from "./operations-presentation";

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
    temporaryDescriptor: "Blue SUV near gate",
  },
};

describe("operations presentation", () => {
  it("prefers plate, then descriptor, and never falls back to vehicle UUID", () => {
    expect(operationsVehicleLabel(session)).toBe("12-34567");
    expect(operationsVehicleLabel({
      ...session,
      vehicle: { ...session.vehicle, plateNumberNormalized: null },
    })).toBe("Blue SUV near gate");
    expect(operationsVehicleLabel({
      ...session,
      vehicle: {
        ...session.vehicle,
        plateNumberNormalized: null,
        temporaryDescriptor: null,
      },
    })).toBeNull();
    expect(operationsVehicleLabel({
      ...session,
      vehicle: {
        ...session.vehicle,
        plateNumberNormalized: " ",
        temporaryDescriptor: " ",
      },
    })).toBeNull();
  });

  it("humanizes canonical session states in English and Arabic", () => {
    expect(operationsSessionStateLabel("CHECKING_IN", "en")).toBe("Checking In");
    expect(operationsSessionStateLabel("REQUESTED", "en")).toBe("Retrieval Requested");
    expect(operationsSessionStateLabel("HANDOFF_PENDING", "ar")).toBe("بانتظار التسليم");
    expect(operationsSessionStateLabel("PARKING", "ar")).toBe("جارٍ الاصطفاف");
  });

  it("keeps unknown future session states explicit instead of misclassifying them", () => {
    expect(operationsSessionStateLabel("FUTURE_STATE", "en")).toBe("State: FUTURE STATE");
    expect(operationsSessionStateLabel("FUTURE_STATE", "ar")).toBe("حالة: FUTURE STATE");
  });

  it("localizes only the two canonical task types", () => {
    expect(operationsTaskTypeLabel("PARKING", "en")).toBe("Parking");
    expect(operationsTaskTypeLabel("RETRIEVAL", "en")).toBe("Retrieval");
    expect(operationsTaskTypeLabel("PARKING", "ar")).toBe("اصطفاف");
    expect(operationsTaskTypeLabel("RETRIEVAL", "ar")).toBe("استرجاع");
  });

  it("preserves every canonical task status with localized manager copy", () => {
    expect(operationsTaskStatusLabel("QUEUED", "en")).toBe("Queued");
    expect(operationsTaskStatusLabel("ASSIGNED", "en")).toBe("Assigned");
    expect(operationsTaskStatusLabel("ACCEPTED", "en")).toBe("Accepted");
    expect(operationsTaskStatusLabel("IN_PROGRESS", "en")).toBe("In Progress");
    expect(operationsTaskStatusLabel("COMPLETED", "en")).toBe("Completed");
    expect(operationsTaskStatusLabel("CANCELLED", "en")).toBe("Cancelled");
    expect(operationsTaskStatusLabel("IN_PROGRESS", "ar")).toBe("قيد التنفيذ");
    expect(operationsTaskStatusLabel("CANCELLED", "ar")).toBe("ملغاة");
  });

  it("presents assignment truth without exposing membership identity", () => {
    expect(operationsAssignmentLabel(session.currentAssigneeMembershipId, "en")).toBe("Assigned");
    expect(operationsAssignmentLabel(null, "en")).toBe("Unassigned");
    expect(operationsAssignmentLabel(session.currentAssigneeMembershipId, "ar")).toBe("مسندة");
    expect(operationsAssignmentLabel(null, "ar")).toBe("غير مسندة");
  });

  it("formats valid timestamps in the supplied Location timezone", () => {
    const en = formatOperationsTime("2026-09-21T12:00:00.000Z", "Asia/Amman", "en");
    const ar = formatOperationsTime("2026-09-21T12:00:00.000Z", "Asia/Amman", "ar");
    expect(en).toContain("3:00");
    expect(en).not.toContain("12:00");
    expect(ar).not.toBe(en);
    expect(ar).toMatch(/[٠-٩]/u);
  });

  it("uses a truthful localized fallback for invalid time input", () => {
    expect(formatOperationsTime("not-a-date", "Asia/Amman", "en")).toBe("Time unavailable");
    expect(formatOperationsTime("not-a-date", "Asia/Amman", "ar")).toBe("الوقت غير متاح");
    expect(formatOperationsTime("2026-09-21T12:00:00.000Z", "Invalid/Zone", "en"))
      .toBe("Time unavailable");
  });
});
