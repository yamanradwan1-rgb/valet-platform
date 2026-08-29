import { describe, expect, it, vi } from "vitest";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { CheckInController } from "./check-in-controller";

const locationId = "22222222-2222-4222-8222-222222222222";
const sessionId = "11111111-1111-4111-8111-111111111111";
const vehicleId = "44444444-4444-4444-8444-444444444444";
const customerId = "77777777-7777-4777-8777-777777777777";
const observedAt = "2026-08-29T10:00:00.000Z";
const vehicleA = {
  color: "Black",
  make: "BMW",
  model: "X5",
  plateCountry: "JO",
  plateNumberRaw: "12-54353",
  temporaryDescriptor: null,
};
const vehicleB = {
  ...vehicleA,
  color: null,
  make: null,
  model: null,
  plateNumberRaw: "98-76543",
};
const recognizedA = {
  color: "Black",
  make: "BMW",
  model: "X5",
  plateCountry: "JO",
  plateNumberNormalized: "1254353",
  plateNumberRaw: vehicleA.plateNumberRaw,
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
  color: null,
  customerId: null,
  make: null,
  model: null,
  state: "CHECKING_IN",
  valetSessionId: sessionId,
  vehicleId,
  vehicleUpdatedAt: observedAt,
  version: 1,
};

function clientWith(handler: (path: string) => unknown) {
  const request = vi.fn(handler);
  return {
    client: { request } as unknown as EmployeeApiClient,
    request,
  };
}

function correctionCalls(request: ReturnType<typeof vi.fn>): unknown[][] {
  return request.mock.calls.filter(([path]) =>
    String(path).endsWith("vehicle-details"),
  );
}

describe("returning Check-In candidate isolation", () => {
  it("does not apply Vehicle A correction after Vehicle B is unknown", async () => {
    let recognitionCalls = 0;
    const mock = clientWith((path) => {
      if (path.endsWith("vehicle-recognition")) {
        recognitionCalls += 1;
        return { vehicle: recognitionCalls === 1 ? recognizedA : null };
      }
      if (path.endsWith("intakes")) return intake;
      throw new Error(`Unexpected ${path}`);
    });
    const controller = new CheckInController(mock.client, vi.fn());
    await controller.confirmPlate(locationId, vehicleA);
    controller.setPendingCorrection({
      color: "Blue",
      make: "BMW",
      model: "X5",
    });
    controller.setStep("plate-confirm");

    await controller.confirmPlate(locationId, vehicleB);
    controller.setVehicleDetails({ color: null, make: null, model: null });
    await controller.submitCustomerPhone(locationId, "");

    expect(correctionCalls(mock.request)).toHaveLength(0);
    expect(controller.getState().pendingCorrection).toBeNull();
  });

  it("does not apply Vehicle A correction after Vehicle B recognition fails", async () => {
    let recognitionCalls = 0;
    const mock = clientWith((path) => {
      if (path.endsWith("vehicle-recognition")) {
        recognitionCalls += 1;
        if (recognitionCalls === 1) return { vehicle: recognizedA };
        throw new Error("offline");
      }
      if (path.endsWith("intakes")) return intake;
      throw new Error(`Unexpected ${path}`);
    });
    const controller = new CheckInController(mock.client, vi.fn());
    await controller.confirmPlate(locationId, vehicleA);
    controller.setPendingCorrection({
      color: "Blue",
      make: "BMW",
      model: "X5",
    });
    controller.setStep("plate-confirm");

    await controller.confirmPlate(locationId, vehicleB);
    controller.continueWithoutRecognition();
    await controller.submitCustomerPhone(locationId, "");

    expect(correctionCalls(mock.request)).toHaveLength(0);
    expect(controller.getState().pendingCorrection).toBeNull();
  });

  it("clears returning-customer and resolved-customer state for Vehicle B", async () => {
    let recognitionCalls = 0;
    const mock = clientWith(() => {
      recognitionCalls += 1;
      return { vehicle: recognitionCalls === 1 ? recognizedA : null };
    });
    const controller = new CheckInController(mock.client, vi.fn());
    await controller.confirmPlate(locationId, vehicleA);
    Object.assign(controller.getState(), { customerResolved: true });

    await controller.confirmPlate(locationId, vehicleB);

    expect(controller.getState()).toMatchObject({
      customerOrigin: "vehicle-details",
      customerResolved: false,
      recognizedVehicle: null,
    });
  });

  it.each(["UPDATED", "NO_CHANGE"] as const)(
    "uses the authoritative %s correction response for active vehicle state",
    async (mutationKind) => {
      const mock = clientWith((path) => {
        if (path.endsWith("vehicle-recognition"))
          return { vehicle: recognizedA };
        if (path.endsWith("intakes")) return { ...intake, customerId };
        if (path.endsWith("vehicle-details")) {
          return {
            color: "Navy",
            make: "BMW AG",
            model: null,
            mutationKind,
            valetSessionId: sessionId,
            vehicleId,
            vehicleUpdatedAt: "2026-08-29T10:02:00.000Z",
          };
        }
        throw new Error(`Unexpected ${path}`);
      });
      const controller = new CheckInController(mock.client, vi.fn());
      await controller.confirmPlate(locationId, vehicleA);
      controller.setPendingCorrection({
        color: "Blue",
        make: "BMW",
        model: "X6",
      });

      await controller.useSavedCustomer(locationId);

      expect(controller.getState().activeSession).toMatchObject({
        vehicle: { color: "Navy", make: "BMW AG", model: null },
        vehicleUpdatedAt: "2026-08-29T10:02:00.000Z",
      });
    },
  );

  it("preserves a no-plate descriptor when returning from Customer Contact", async () => {
    const controller = new CheckInController({} as EmployeeApiClient, vi.fn());
    await controller.confirmPlate(locationId, {
      ...vehicleB,
      plateNumberRaw: "",
      temporaryDescriptor: "",
    });
    controller.setVehicleDetails(
      { color: "Silver", make: "Toyota", model: null },
      "Silver Toyota SUV",
    );

    controller.setStep(controller.getState().customerOrigin);

    expect(controller.getState()).toMatchObject({
      pendingVehicle: { temporaryDescriptor: "Silver Toyota SUV" },
      step: "vehicle-details",
    });
  });
});
