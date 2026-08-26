import { describe, expect, it, vi } from "vitest";
import type { StaffValetSessionDetailResponse } from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { ParkingController } from "./parking-controller";
import type { ConfirmParkedResponse } from "./parking-api";

/**
 * DEC-068 review fix: after a successful NEW-path Confirm Parked the session
 * still carries keySlotCode null locally. The success screen must therefore
 * fall back to the successfully submitted normalized code immediately and
 * prefer the authoritative refreshed value whenever that refresh succeeds.
 */
describe("ParkingController post-confirm key slot fallback", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const taskId = "22222222-2222-4222-8222-222222222222";
  const locationId = "33333333-3333-4333-8333-333333333333";

  function parkedSession() {
    return {
      keySlotCode: null,
      locationId,
      parkedAt: null,
      parkingSpotCode: null,
      parkingStartedAt: "2026-08-21T18:05:00.000Z",
      parkingZoneCode: null,
      sessionId,
      sessionVersion: 3,
      taskId,
      taskVersion: 4,
      vehicle: {
        color: "Black",
        make: "BMW",
        model: "X5",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: null,
      },
    };
  }

  function confirmPayload(): ConfirmParkedResponse {
    return {
      parkedAt: "2026-08-21T18:10:00.000Z",
      parkingSpotCode: "P-101",
      parkingSpotId: "44444444-4444-4444-8444-444444444444",
      parkingZoneId: "55555555-5555-4555-8555-555555555555",
      sessionId,
      sessionVersion: 4,
      state: "PARKED",
      taskId,
      taskStatus: "COMPLETED",
      taskVersion: 5,
    };
  }

  function parkedDetail(
    keySlotCode: string | null,
  ): StaffValetSessionDetailResponse {
    return {
      checkIn: { conditionCompletedAt: "2026-08-21T18:00:00.000Z" },
      handoff: { pendingAt: null, verification: null },
      guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
      keySlot: keySlotCode === null ? null : { code: keySlotCode },
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
        vehicleId: "66666666-6666-4666-8666-666666666666",
        vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
      },
      version: 5,
    };
  }

  async function runConfirm(
    request: ReturnType<typeof vi.fn>,
    keySlotCode: string,
  ) {
    const controller = new ParkingController(
      { request } as unknown as EmployeeApiClient,
      vi.fn(),
    );
    controller.setActiveSession(parkedSession());
    await controller.confirmParked(" P-101 ", keySlotCode);
    return controller.getState();
  }

  it("falls back to the submitted normalized key slot when the refresh fails", async () => {
    const request = vi
      .fn()
      .mockImplementation((path: unknown) => {
        if (String(path).endsWith("/confirm-parked")) {
          return Promise.resolve(confirmPayload());
        }
        return Promise.reject(new Error("refresh offline"));
      });

    const state = await runConfirm(request, " K-07 ");

    expect(state.step).toBe("success");
    // Submitted evidence is the truthful immediate fallback even though the
    // authoritative re-read failed.
    expect(state.activeSession?.keySlotCode).toBe("K-07");
    expect(state.activeSession?.parkingSpotCode).toBe("P-101");
    expect(state.activeSession?.parkingZoneCode).toBeNull();
    expect(state.error).toBeNull();
  });

  it("prefers the authoritative refreshed slot over the submitted code", async () => {
    const request = vi
      .fn()
      .mockImplementation((path: unknown) => {
        if (String(path).endsWith("/confirm-parked")) {
          return Promise.resolve(confirmPayload());
        }
        return Promise.resolve(parkedDetail("K-99"));
      });

    const state = await runConfirm(request, " K-07 ");

    expect(state.step).toBe("success");
    expect(state.activeSession?.keySlotCode).toBe("K-99");
    expect(state.activeSession?.parkingZoneCode).toBe("North-A");
    expect(state.activeSession?.sessionVersion).toBe(4);
    expect(state.activeSession?.taskVersion).toBe(5);
  });
});
