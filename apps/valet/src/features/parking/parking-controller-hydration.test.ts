import { describe, expect, it, vi } from "vitest";
import type { StaffValetSessionDetailResponse } from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { ParkingController } from "./parking-controller";

describe("ParkingController hydration", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const taskId = "22222222-2222-4222-8222-222222222222";
  const locationId = "33333333-3333-4333-8333-333333333333";

  function detailPayload(
    overrides: Partial<StaffValetSessionDetailResponse>,
  ): StaffValetSessionDetailResponse {
    return {
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
      ...overrides,
    };
  }

  it("hydrates active parking session from A1 session detail", async () => {
    const mockClient = {
      request: vi.fn().mockResolvedValue(detailPayload({})),
    } as unknown as EmployeeApiClient;

    const controller = new ParkingController(mockClient, vi.fn());
    await controller.hydrateSession(sessionId, taskId, 3);

    const state = controller.getState();
    expect(state.step).toBe("in-progress");
    expect(state.activeSession?.sessionId).toBe(sessionId);
    expect(state.activeSession?.keySlotCode).toBe("B-214");
    expect(state.activeSession?.parkingZoneCode).toBe("Zone B");
    expect(state.activeSession?.parkingStartedAt).toBe(
      "2026-08-21T18:05:00.000Z",
    );
  });

  it("resumes a PARKING session with a NULL key slot as completable (DEC-068 §6)", async () => {
    const mockClient = {
      request: vi
        .fn()
        .mockResolvedValue(detailPayload({ keySlot: null, version: 3 })),
    } as unknown as EmployeeApiClient;

    const controller = new ParkingController(mockClient, vi.fn());
    await controller.hydrateSession(sessionId, taskId, 2);

    const state = controller.getState();
    // hydrateSession only requires state PARKING + parkingStartedAt; a NULL
    // key_slot_id is valid new-path parking in progress.
    expect(state.error).toBeNull();
    expect(state.step).toBe("in-progress");
    expect(state.activeSession).not.toBeNull();
    expect(state.activeSession?.keySlotCode).toBeNull();
    expect(state.activeSession?.parkingStartedAt).toBe(
      "2026-08-21T18:05:00.000Z",
    );
  });
});
