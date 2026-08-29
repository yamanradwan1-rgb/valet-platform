import { describe, expect, it, vi } from "vitest";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import type { VehicleIdentityResponse } from "./check-in-api";
import { CheckInController } from "./check-in-controller";

describe("CheckInController resumed identity", () => {
  it("updates with expectedVehicleUpdatedAt without running recognition", async () => {
    const locationId = "22222222-2222-4222-8222-222222222222";
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const detail = {
      checkIn: { conditionCompletedAt: null },
      handoff: { pendingAt: null, verification: null },
      guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
      keySlot: null,
      locationId,
      parking: {
        parkedAt: null,
        parkingSpotCode: null,
        parkingStartedAt: null,
        parkingZoneCode: null,
      },
      sessionId,
      state: "CHECKING_IN" as const,
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
      version: 1,
    };
    const update: VehicleIdentityResponse = {
      identityMode: "CONFIRMED_PLATE",
      plateCountry: "JO",
      plateNumberNormalized: "9988888",
      plateNumberRaw: "99-88888",
      temporaryDescriptor: null,
      valetSessionId: sessionId,
      vehicleId: detail.vehicle.vehicleId,
      vehicleUpdatedAt: "2026-08-21T18:02:00.000Z",
    };
    const request = vi
      .fn()
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce(update);
    const controller = new CheckInController(
      { request } as unknown as EmployeeApiClient,
      vi.fn(),
    );
    await controller.hydrateFromDraft(locationId, {
      conditionCompletedAt: null,
      createdAt: "2026-08-21T18:00:00.000Z",
      sessionId,
      vehicle: detail.vehicle,
    });
    await controller.confirmPlate({
      color: "Black",
      make: "BMW",
      model: "X5",
      plateCountry: "JO",
      plateNumberRaw: "99-88888",
      temporaryDescriptor: null,
    });
    expect(request).toHaveBeenLastCalledWith(
      `/v1/staff/check-in/sessions/${sessionId}/vehicle-identity`,
      expect.objectContaining({
        body: expect.objectContaining({
          expectedVehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
        }),
      }),
    );
    expect(
      request.mock.calls.some(([path]) =>
        String(path).endsWith("vehicle-recognition"),
      ),
    ).toBe(false);
  });
});
