import { describe, expect, it, vi } from "vitest";
import type { StaffValetSessionDetailResponse } from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { ParkingController } from "./parking-controller";
import type { ConfirmParkedResponse } from "./parking-api";

describe("ParkingController", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const taskId = "22222222-2222-4222-8222-222222222222";
  const locationId = "33333333-3333-4333-8333-333333333333";

  it("hydrates active parking session from A1 session detail", async () => {
    const detailPayload: StaffValetSessionDetailResponse = {
      checkIn: { conditionCompletedAt: "2026-08-21T18:00:00.000Z" },
      handoff: { pendingAt: null, verification: null },
      guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
      keySlot: { code: "B-214" },
      locationId,
      parking: {
        parkedAt: null,
        parkingSpotCode: null,
        parkingStartedAt: "2026-08-21T18:05:00.000Z",
        parkingZoneCode: "Zone B",
      },
      sessionId,
      state: "PARKING",
      vehicle: {
        color: "Black",
        make: "BMW",
        model: "X5",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: null,
        vehicleId: "44444444-4444-4444-8444-444444444444",
        vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
      },
      version: 4,
    };

    const mockClient = {
      request: vi.fn().mockResolvedValue(detailPayload),
    } as unknown as EmployeeApiClient;

    const controller = new ParkingController(mockClient, vi.fn());
    await controller.hydrateSession(sessionId, taskId, 3);

    const state = controller.getState();
    expect(state.step).toBe("in-progress");
    expect(state.activeSession?.sessionId).toBe(sessionId);
    expect(state.activeSession?.keySlotCode).toBe("B-214");
    expect(state.activeSession?.parkingZoneCode).toBe("Zone B");
    expect(state.activeSession?.parkingStartedAt).toBe("2026-08-21T18:05:00.000Z");
  });

  it("fails closed when session detail is not in PARKING state or parkingStartedAt is null", async () => {
    const detailPayload: StaffValetSessionDetailResponse = {
      checkIn: { conditionCompletedAt: "2026-08-21T18:00:00.000Z" },
      handoff: { pendingAt: null, verification: null },
      guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
      keySlot: { code: "B-214" },
      locationId,
      parking: {
        parkedAt: null,
        parkingSpotCode: null,
        parkingStartedAt: null,
        parkingZoneCode: null,
      },
      sessionId,
      state: "AWAITING_PARKING",
      vehicle: {
        color: "Black",
        make: "BMW",
        model: "X5",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: null,
        vehicleId: "44444444-4444-4444-8444-444444444444",
        vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
      },
      version: 3,
    };

    const mockClient = {
      request: vi.fn().mockResolvedValue(detailPayload),
    } as unknown as EmployeeApiClient;

    const controller = new ParkingController(mockClient, vi.fn());
    await controller.hydrateSession(sessionId, taskId, 3);

    const state = controller.getState();
    expect(state.activeSession).toBeNull();
    expect(state.error).toBe("Session is not in active parking state.");
    expect(state.isHydrating).toBe(false);
  });

  it("confirms parked session, re-fetches authoritative detail and transitions to success", async () => {
    const confirmPayload: ConfirmParkedResponse = {
      parkedAt: "2026-08-21T18:10:00.000Z",
      parkingSpotCode: "P-101",
      parkingSpotId: "66666666-6666-4666-8666-666666666666",
      parkingZoneId: "77777777-7777-4777-8777-777777777777",
      sessionId,
      sessionVersion: 5,
      state: "PARKED",
      taskId,
      taskStatus: "COMPLETED",
      taskVersion: 4,
    };

    const updatedDetailPayload: StaffValetSessionDetailResponse = {
      checkIn: { conditionCompletedAt: "2026-08-21T18:00:00.000Z" },
      handoff: { pendingAt: null, verification: null },
      guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
      keySlot: { code: "B-214" },
      locationId,
      parking: {
        parkedAt: "2026-08-21T18:10:00.000Z",
        parkingSpotCode: "P-101",
        parkingStartedAt: "2026-08-21T18:05:00.000Z",
        parkingZoneCode: "North-A",
      },
      sessionId,
      state: "PARKED",
      vehicle: {
        color: "Black",
        make: "BMW",
        model: "X5",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: null,
        vehicleId: "44444444-4444-4444-8444-444444444444",
        vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
      },
      version: 5,
    };

    const mockClient = {
      request: vi
        .fn()
        .mockImplementation((path, init) => {
          if (String(path).endsWith("/confirm-parked")) {
            expect(init.body).toEqual({
              expectedSessionVersion: 4,
              expectedTaskVersion: 3,
              keySlotCode: "B-214",
              parkingSpotCode: "P-101",
            });
            return Promise.resolve(confirmPayload);
          }
          return Promise.resolve(updatedDetailPayload);
        }),
    } as unknown as EmployeeApiClient;

    const controller = new ParkingController(mockClient, vi.fn());
    controller.setActiveSession({
      keySlotCode: "B-214",
      locationId,
      parkedAt: null,
      parkingSpotCode: null,
      parkingStartedAt: "2026-08-21T18:05:00.000Z",
      parkingZoneCode: null,
      sessionId,
      sessionVersion: 4,
      taskId,
      taskVersion: 3,
      vehicle: {
        color: "Black",
        make: "BMW",
        model: "X5",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: null,
      },
    });

    await controller.confirmParked("P-101", "B-214");

    const state = controller.getState();
    expect(state.step).toBe("success");
    expect(state.activeSession?.parkingSpotCode).toBe("P-101");
    expect(state.activeSession?.parkingZoneCode).toBe("North-A");
    expect(state.activeSession?.sessionVersion).toBe(5);
    expect(state.activeSession?.taskVersion).toBe(4);
    expect(state.isSubmitting).toBe(false);
  });

  it("handles confirmParked error without advancing to success", async () => {
    const mockClient = {
      request: vi.fn().mockRejectedValue(new Error("Spot conflict.")),
    } as unknown as EmployeeApiClient;

    const controller = new ParkingController(mockClient, vi.fn());
    controller.setActiveSession({
      keySlotCode: "B-214",
      locationId,
      parkedAt: null,
      parkingSpotCode: null,
      parkingStartedAt: "2026-08-21T18:05:00.000Z",
      parkingZoneCode: "Zone B",
      sessionId,
      sessionVersion: 4,
      taskId,
      taskVersion: 3,
      vehicle: {
        color: "Black",
        make: "BMW",
        model: "X5",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: null,
      },
    });

    await controller.confirmParked("B-17", "B-214");

    const state = controller.getState();
    expect(state.step).toBe("in-progress");
    expect(state.error).toBe("Spot conflict.");
    expect(state.isSubmitting).toBe(false);
  });
});
