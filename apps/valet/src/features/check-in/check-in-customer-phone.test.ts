import { describe, expect, it, vi } from "vitest";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { CheckInController } from "./check-in-controller";
import { normalizeJordanCustomerPhone } from "./check-in-customer-phone";

const locationId = "22222222-2222-4222-8222-222222222222";
const sessionId = "11111111-1111-4111-8111-111111111111";
const vehicleId = "44444444-4444-4444-8444-444444444444";
const observedAt = "2026-08-29T10:00:00.000Z";
const noPlateVehicle = {
  color: "Silver",
  make: "Toyota",
  model: null,
  plateCountry: "JO",
  plateNumberRaw: "",
  temporaryDescriptor: "Silver Toyota SUV",
};
const intake = {
  createdAt: observedAt,
  color: "Silver",
  customerId: null,
  make: "Toyota",
  model: null,
  state: "CHECKING_IN",
  valetSessionId: sessionId,
  vehicleId,
  vehicleUpdatedAt: observedAt,
  version: 1,
};

function intakeClient() {
  const request = vi.fn((path: string) => {
    if (path.endsWith("intakes")) return intake;
    throw new Error(`Unexpected ${path}`);
  });
  return {
    client: { request } as unknown as EmployeeApiClient,
    request,
  };
}

function requestBody(call: unknown[] | undefined): Record<string, unknown> {
  const options = call?.[1] as { body?: Record<string, unknown> } | undefined;
  expect(options?.body).toBeDefined();
  return options!.body!;
}

describe("Jordan customer phone normalization", () => {
  it.each([
    ["778301672", "+962778301672"],
    ["0778301672", "+962778301672"],
    ["77 830 1672", "+962778301672"],
    ["077-830-1672", "+962778301672"],
    ["(077) 830-1672", "+962778301672"],
    ["+962778301672", "+962778301672"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeJordanCustomerPhone(input)).toBe(expected);
  });

  it("preserves blank input and does not manufacture E.164 from malformed input", () => {
    expect(normalizeJordanCustomerPhone("   ")).toBe("");
    expect(normalizeJordanCustomerPhone("12345")).toBe("12345");
  });

  it("submits a normalized DIFFERENT_CUSTOMER phone", async () => {
    const mock = intakeClient();
    const controller = new CheckInController(mock.client, vi.fn());
    await controller.confirmPlate(locationId, noPlateVehicle);

    await controller.submitCustomerPhone(locationId, "077 830 1672");

    expect(requestBody(mock.request.mock.calls.at(-1)).customer).toEqual({
      intent: "DIFFERENT_CUSTOMER",
      phone: "+962778301672",
    });
  });

  it("preserves the no-phone intake path for blank input", async () => {
    const mock = intakeClient();
    const controller = new CheckInController(mock.client, vi.fn());
    await controller.confirmPlate(locationId, noPlateVehicle);

    await controller.submitCustomerPhone(locationId, "  ");

    expect(requestBody(mock.request.mock.calls.at(-1))).not.toHaveProperty(
      "customer",
    );
  });
});
