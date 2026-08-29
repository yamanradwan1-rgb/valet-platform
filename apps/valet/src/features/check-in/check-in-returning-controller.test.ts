import { describe, expect, it, vi } from "vitest";

import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { CheckInController } from "./check-in-controller";

const locationId = "22222222-2222-4222-8222-222222222222";
const sessionId = "11111111-1111-4111-8111-111111111111";
const vehicleId = "44444444-4444-4444-8444-444444444444";
const customerId = "77777777-7777-4777-8777-777777777777";
const observedAt = "2026-08-29T10:00:00.000Z";
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
  plateNumberNormalized: "1254353",
  plateNumberRaw: vehicle.plateNumberRaw,
  returningCustomer: {
    customerId,
    displayName: "Ahmad",
    phoneSuffix: "1234",
  },
  vehicleId,
  vehicleUpdatedAt: observedAt,
};
const intake = {
  createdAt: observedAt,
  color: "Black",
  customerId,
  make: "BMW",
  model: "X5",
  state: "CHECKING_IN",
  valetSessionId: sessionId,
  vehicleId,
  vehicleUpdatedAt: "2026-08-29T10:01:00.000Z",
  version: 1,
};

function clientWith(
  handler: (path: string, options?: { body?: unknown }) => unknown,
) {
  const request = vi.fn(handler);
  return {
    client: { request } as unknown as EmployeeApiClient,
    request,
  };
}

function bodyOf(call: unknown[] | undefined): Record<string, unknown> {
  expect(call).toBeDefined();
  const options = call?.[1] as { body?: Record<string, unknown> } | undefined;
  expect(options?.body).toBeDefined();
  return options!.body!;
}

describe("returning Check-In controller", () => {
  it("recognizes before intake and uses explicit saved customer without phone", async () => {
    const mock = clientWith((path) => {
      if (path.endsWith("vehicle-recognition")) return { vehicle: recognized };
      if (path.endsWith("intakes")) return intake;
      throw new Error(`Unexpected ${path}`);
    });
    const controller = new CheckInController(mock.client, vi.fn());
    await controller.confirmPlate(locationId, vehicle);
    expect(controller.getState().step).toBe("returning-vehicle");
    expect(mock.request.mock.calls[0]![0]).toContain("vehicle-recognition");

    await controller.useSavedCustomer(locationId);
    const intakeCall = mock.request.mock.calls.find(([path]) =>
      String(path).endsWith("intakes"),
    )!;
    expect(intakeCall[1]).toMatchObject({
      body: {
        customer: { customerId, intent: "USE_SAVED_CUSTOMER" },
      },
    });
    expect(bodyOf(intakeCall)).not.toHaveProperty("vehicleDetails");
    expect(controller.getState().step).toBe("vehicle-condition");
  });

  it("does not guess a customer and sends entered phone as DIFFERENT_CUSTOMER", async () => {
    const mock = clientWith((path) => {
      if (path.endsWith("vehicle-recognition")) {
        return { vehicle: { ...recognized, returningCustomer: null } };
      }
      if (path.endsWith("intakes")) return { ...intake, customerId };
      throw new Error(`Unexpected ${path}`);
    });
    const controller = new CheckInController(mock.client, vi.fn());
    await controller.confirmPlate(locationId, vehicle);
    expect(
      controller.getState().recognizedVehicle?.returningCustomer,
    ).toBeNull();
    controller.continueToCustomer("returning-vehicle");
    await controller.submitCustomerPhone(locationId, "+962790000000");
    const body = bodyOf(mock.request.mock.calls.at(-1));
    expect(body.customer).toEqual({
      intent: "DIFFERENT_CUSTOMER",
      phone: "+962790000000",
    });
  });

  it("treats only parsed vehicle:null as unknown and keeps failures on confirm", async () => {
    const failed = clientWith(() => {
      throw new Error("offline");
    });
    const controller = new CheckInController(failed.client, vi.fn());
    await controller.confirmPlate(locationId, vehicle);
    expect(controller.getState()).toMatchObject({
      recognitionFailed: true,
      step: "discovery",
    });
    controller.continueWithoutRecognition();
    expect(controller.getState().step).toBe("customer-phone");

    const unknown = clientWith(() => ({ vehicle: null }));
    const unknownController = new CheckInController(unknown.client, vi.fn());
    await unknownController.confirmPlate(locationId, vehicle);
    expect(unknownController.getState().step).toBe("vehicle-details");
  });

  it("bypasses recognition for no-plate and requires the UI draft before intake", async () => {
    const mock = clientWith((path) => {
      if (path.endsWith("intakes")) return { ...intake, customerId: null };
      throw new Error(`Unexpected ${path}`);
    });
    const controller = new CheckInController(mock.client, vi.fn());
    await controller.confirmPlate(locationId, {
      ...vehicle,
      plateNumberRaw: "",
      temporaryDescriptor: "",
    });
    expect(controller.getState().step).toBe("vehicle-details");
    expect(mock.request).not.toHaveBeenCalled();
    controller.setVehicleDetails(
      { color: "Silver", make: "Toyota", model: null },
      "Silver Toyota SUV",
    );
    await controller.submitCustomerPhone(locationId, "");
    const body = bodyOf(mock.request.mock.calls[0]);
    expect(body.vehicleIdentity).toEqual({
      mode: "TEMPORARY_DESCRIPTOR",
      temporaryDescriptor: "Silver Toyota SUV",
    });
    expect(body.vehicleDetails).toEqual({
      color: "Silver",
      make: "Toyota",
      model: null,
    });
  });

  it("keeps all new-vehicle details optional and preserves Customer Contact origin", async () => {
    const mock = clientWith((path) => {
      if (path.endsWith("vehicle-recognition")) return { vehicle: null };
      if (path.endsWith("intakes")) return { ...intake, customerId: null };
      throw new Error(`Unexpected ${path}`);
    });
    const controller = new CheckInController(mock.client, vi.fn());
    await controller.confirmPlate(locationId, vehicle);
    controller.setVehicleDetails({ color: null, make: null, model: null });
    expect(controller.getState().customerOrigin).toBe("vehicle-details");
    controller.setStep(controller.getState().customerOrigin);
    expect(controller.getState().step).toBe("vehicle-details");
    controller.continueToCustomer("vehicle-details");
    await controller.submitCustomerPhone(locationId, "");
    expect(bodyOf(mock.request.mock.calls.at(-1)).vehicleDetails).toEqual({
      color: null,
      make: null,
      model: null,
    });
  });

  it("treats NO_CHANGE correction as success after exactly one intake", async () => {
    let intakeCalls = 0;
    const mock = clientWith((path) => {
      if (path.endsWith("vehicle-recognition")) return { vehicle: recognized };
      if (path.endsWith("intakes")) {
        intakeCalls += 1;
        return intake;
      }
      if (path.endsWith("vehicle-details")) {
        return {
          color: "Black",
          make: "BMW",
          model: "X5",
          mutationKind: "NO_CHANGE",
          valetSessionId: sessionId,
          vehicleId,
          vehicleUpdatedAt: observedAt,
        };
      }
      throw new Error(`Unexpected ${path}`);
    });
    const controller = new CheckInController(mock.client, vi.fn());
    await controller.confirmPlate(locationId, vehicle);
    controller.setPendingCorrection({
      color: "Black",
      make: "BMW",
      model: "X5",
    });
    await controller.useSavedCustomer(locationId);
    expect(intakeCalls).toBe(1);
    expect(controller.getState()).toMatchObject({
      correctionConflict: false,
      pendingCorrection: null,
      step: "vehicle-condition",
    });
  });

  it("uses the recognition token, preserves one intake on stale correction, and rehydrates", async () => {
    let intakeCalls = 0;
    const conflict = new EmployeeApiError({
      code: "VEHICLE_DETAILS_VERSION_CONFLICT",
      message: "stale",
      status: 409,
    });
    const mock = clientWith((path) => {
      if (path.endsWith("vehicle-recognition")) return { vehicle: recognized };
      if (path.endsWith("intakes")) {
        intakeCalls += 1;
        return intake;
      }
      if (path.endsWith("vehicle-details")) throw conflict;
      if (path.includes("/v1/staff/valet-sessions/")) {
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
            vehicleId,
            vehicleUpdatedAt: "2026-08-29T10:02:00.000Z",
          },
          version: 1,
        };
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
    await controller.useSavedCustomer(locationId);
    const correction = mock.request.mock.calls.find(([path]) =>
      String(path).endsWith("vehicle-details"),
    )!;
    expect(bodyOf(correction).expectedVehicleUpdatedAt).toBe(observedAt);
    expect(intakeCalls).toBe(1);
    expect(controller.getState()).toMatchObject({
      activeSession: { sessionId },
      correctionConflict: true,
      step: "returning-vehicle",
    });
  });
});
