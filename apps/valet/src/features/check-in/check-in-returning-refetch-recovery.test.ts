import { describe, expect, it, vi } from "vitest";

import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { CheckInController } from "./check-in-controller";

const locationId = "22222222-2222-4222-8222-222222222222";
const sessionId = "11111111-1111-4111-8111-111111111111";
const vehicleId = "44444444-4444-4444-8444-444444444444";
const customerId = "77777777-7777-4777-8777-777777777777";
const recognizedAt = "2026-08-29T10:00:00.000Z";
const refreshedAt = "2026-08-29T10:02:00.000Z";
const correctedAt = "2026-08-29T10:03:00.000Z";

const vehicle = {
  color: "Black",
  make: "BMW",
  model: "X5",
  plateCountry: "JO",
  plateNumberRaw: "12-54353",
  temporaryDescriptor: null,
};

const recognized = {
  color: vehicle.color,
  make: vehicle.make,
  model: vehicle.model,
  plateCountry: vehicle.plateCountry,
  plateNumberRaw: vehicle.plateNumberRaw,
  plateNumberNormalized: "1254353",
  returningCustomer: {
    customerId,
    displayName: "Ahmad",
    phoneSuffix: "1234",
  },
  vehicleId,
  vehicleUpdatedAt: recognizedAt,
};

const intake = {
  createdAt: recognizedAt,
  color: vehicle.color,
  customerId,
  make: vehicle.make,
  model: vehicle.model,
  state: "CHECKING_IN",
  valetSessionId: sessionId,
  vehicleId,
  vehicleUpdatedAt: recognizedAt,
  version: 1,
};

const conflict = new EmployeeApiError({
  code: "VEHICLE_DETAILS_VERSION_CONFLICT",
  message: "stale",
  status: 409,
});

function currentSessionDetail() {
  return {
    checkIn: { conditionCompletedAt: null },
    guestAccess: {
      expiresAt: null,
      revokedAt: null,
      status: "NOT_ISSUED",
    },
    handoff: { pendingAt: null, verification: null },
    keySlot: null,
    locationId,
    parking: {
      parkedAt: null,
      parkingSpotCode: null,
      parkingStartedAt: null,
      parkingZoneCode: null,
    },
    sessionId,
    state: "CHECKING_IN",
    vehicle: {
      ...vehicle,
      color: "Navy",
      vehicleId,
      vehicleUpdatedAt: refreshedAt,
    },
    version: 1,
  };
}

function clientWith(
  handler: (path: string, options?: { body?: unknown }) => unknown,
) {
  const request = vi.fn(handler);
  return { client: { request } as unknown as EmployeeApiClient, request };
}

function callsEndingWith(request: ReturnType<typeof vi.fn>, suffix: string) {
  return request.mock.calls.filter(([path]) => String(path).endsWith(suffix));
}

describe("returning Check-In correction refetch recovery", () => {
  it("retries failed conflict rehydrate by GET only, then requires a fresh user correction", async () => {
    let getFailures = 2;
    let correctionCalls = 0;
    const mock = clientWith((path) => {
      if (path.endsWith("vehicle-recognition")) return { vehicle: recognized };
      if (path.endsWith("intakes")) return intake;
      if (path.endsWith("vehicle-details")) {
        correctionCalls += 1;
        if (correctionCalls === 1) throw conflict;
        return {
          color: "Green",
          make: "BMW",
          model: "X5",
          mutationKind: "UPDATED",
          valetSessionId: sessionId,
          vehicleId,
          vehicleUpdatedAt: correctedAt,
        };
      }
      if (path.includes("/v1/staff/valet-sessions/")) {
        if (getFailures-- > 0) throw new Error("offline");
        return currentSessionDetail();
      }
      throw new Error(`Unexpected ${path}`);
    });
    const controller = new CheckInController(mock.client, vi.fn());
    await controller.confirmPlate(locationId, vehicle);
    controller.setPendingCorrection({
      color: "Blue",
      make: "BMW",
      model: "X5",
    });

    await expect(
      controller.useSavedCustomer(locationId),
    ).resolves.toBeUndefined();
    expect(controller.getState()).toMatchObject({
      activeSession: { sessionId },
      customerResolved: true,
      correctionConflict: false,
      isSubmitting: false,
      pendingCorrectionExpectedAt: null,
      recognizedVehicle: { color: null, make: null, model: null },
      step: "returning-vehicle",
    });
    expect(controller.getState().error).toBeTruthy();

    controller.setStep("plate-confirm");
    expect(controller.getState().step).toBe("plate-confirm");
    controller.setStep("returning-vehicle");
    controller.setPendingCorrection({
      color: "Red",
      make: "BMW",
      model: "X6",
    });
    expect(controller.getState().pendingCorrection).toMatchObject({
      color: "Red",
    });
    await expect(
      controller.continueAfterCustomerResolution(),
    ).resolves.toBeUndefined();
    expect(controller.getState()).toMatchObject({
      isSubmitting: false,
      pendingCorrectionExpectedAt: null,
      step: "returning-vehicle",
    });
    expect(callsEndingWith(mock.request, "vehicle-details")).toHaveLength(1);
    expect(callsEndingWith(mock.request, "intakes")).toHaveLength(1);

    await controller.continueAfterCustomerResolution();
    expect(controller.getState()).toMatchObject({
      correctionConflict: true,
      error: null,
      isSubmitting: false,
      pendingCorrection: null,
      pendingCorrectionExpectedAt: refreshedAt,
      recognizedVehicle: { color: "Navy", vehicleUpdatedAt: refreshedAt },
      step: "returning-vehicle",
    });
    expect(callsEndingWith(mock.request, "vehicle-details")).toHaveLength(1);

    controller.setPendingCorrection({
      color: "Green",
      make: "BMW",
      model: "X5",
    });
    await controller.continueAfterCustomerResolution();
    const puts = callsEndingWith(mock.request, "vehicle-details");
    expect(puts).toHaveLength(2);
    expect(
      (puts[0]?.[1] as { body: { expectedVehicleUpdatedAt: string } }).body
        .expectedVehicleUpdatedAt,
    ).toBe(recognizedAt);
    expect(
      (puts[1]?.[1] as { body: { expectedVehicleUpdatedAt: string } }).body
        .expectedVehicleUpdatedAt,
    ).toBe(refreshedAt);
    expect(callsEndingWith(mock.request, "intakes")).toHaveLength(1);
    expect(controller.getState()).toMatchObject({
      activeSession: {
        vehicle: { color: "Green" },
        vehicleUpdatedAt: correctedAt,
      },
      isSubmitting: false,
      step: "vehicle-condition",
    });
  });

  it("does not strand the direct Continue route after a new 409 and failed GET", async () => {
    let correctionCalls = 0;
    const mock = clientWith((path) => {
      if (path.endsWith("vehicle-recognition")) return { vehicle: recognized };
      if (path.endsWith("intakes")) return intake;
      if (path.endsWith("vehicle-details")) {
        correctionCalls += 1;
        if (correctionCalls === 1)
          throw new Error("temporary correction error");
        throw conflict;
      }
      if (path.includes("/v1/staff/valet-sessions/"))
        throw new Error("offline");
      throw new Error(`Unexpected ${path}`);
    });
    const controller = new CheckInController(mock.client, vi.fn());
    await controller.confirmPlate(locationId, vehicle);
    controller.setPendingCorrection({
      color: "Blue",
      make: "BMW",
      model: "X5",
    });
    await controller.useSavedCustomer(locationId);
    expect(controller.getState()).toMatchObject({
      customerResolved: true,
      isSubmitting: false,
      step: "returning-vehicle",
    });

    await expect(
      controller.continueAfterCustomerResolution(),
    ).resolves.toBeUndefined();
    expect(controller.getState()).toMatchObject({
      error: "offline",
      isSubmitting: false,
      pendingCorrectionExpectedAt: null,
      step: "returning-vehicle",
    });
    expect(callsEndingWith(mock.request, "intakes")).toHaveLength(1);
    await controller.continueAfterCustomerResolution();
    expect(callsEndingWith(mock.request, "vehicle-details")).toHaveLength(2);
    expect(controller.getState().isSubmitting).toBe(false);
  });
});
