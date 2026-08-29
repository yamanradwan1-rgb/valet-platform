import { describe, expect, it, vi } from "vitest";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  correctSessionVehicleDetails,
  recognizeReturningVehicle,
} from "./check-in-api";

describe("returning Check-In API boundary", () => {
  const locationId = "22222222-2222-4222-8222-222222222222";
  const sessionId = "11111111-1111-4111-8111-111111111111";

  it("validates and sends exact confirmed-plate recognition", async () => {
    const request = vi.fn().mockResolvedValue({ vehicle: null });
    const client = { request } as unknown as EmployeeApiClient;
    await recognizeReturningVehicle(client, {
      targetLocationId: locationId,
      vehicleIdentity: {
        confirmedByHuman: true,
        mode: "CONFIRMED_PLATE",
        plateCountry: "JO",
        plateNumberRaw: "12-54353",
      },
    });
    expect(request).toHaveBeenCalledWith(
      "/v1/staff/check-in/vehicle-recognition",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({ targetLocationId: locationId }),
      }),
    );
  });

  it("validates and sends vehicle correction through the session endpoint", async () => {
    const response = {
      color: "Black",
      make: "BMW",
      model: "X5",
      mutationKind: "NO_CHANGE",
      valetSessionId: sessionId,
      vehicleId: "44444444-4444-4444-8444-444444444444",
      vehicleUpdatedAt: "2026-08-29T10:00:00.000Z",
    };
    const request = vi.fn().mockResolvedValue(response);
    const client = { request } as unknown as EmployeeApiClient;
    await expect(
      correctSessionVehicleDetails(client, sessionId, {
        color: "Black",
        expectedVehicleUpdatedAt: "2026-08-29T10:00:00.000Z",
        make: "BMW",
        model: "X5",
      }),
    ).resolves.toEqual(response);
    expect(request).toHaveBeenCalledWith(
      `/v1/staff/check-in/sessions/${sessionId}/vehicle-details`,
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
