import { describe, expect, it } from "vitest";

import { intakeRequestSchema } from "./check-in";
import {
  returningVehicleRecognitionRequestSchema,
  returningVehicleRecognitionResponseSchema,
  vehicleDetailsCorrectionRequestSchema,
} from "./returning-check-in";

const locationId = "00000000-0000-4000-8000-000000000001";
const customerId = "00000000-0000-4000-8000-000000000002";
const vehicleId = "00000000-0000-4000-8000-000000000003";

const confirmedPlate = {
  confirmedByHuman: true,
  mode: "CONFIRMED_PLATE" as const,
  plateCountry: "JO",
  plateNumberRaw: "12-345",
};

describe("returning Check-In contracts", () => {
  it("accepts only confirmed-plate recognition without authority fields", () => {
    expect(
      returningVehicleRecognitionRequestSchema.parse({
        targetLocationId: locationId,
        vehicleIdentity: confirmedPlate,
      }),
    ).toBeDefined();
    expect(
      returningVehicleRecognitionRequestSchema.safeParse({
        organizationId: locationId,
        targetLocationId: locationId,
        vehicleIdentity: confirmedPlate,
      }).success,
    ).toBe(false);
    expect(
      returningVehicleRecognitionRequestSchema.safeParse({
        targetLocationId: locationId,
        vehicleIdentity: { ...confirmedPlate, confirmedByHuman: false },
      }).success,
    ).toBe(false);
    expect(
      returningVehicleRecognitionRequestSchema.safeParse({
        targetLocationId: locationId,
        vehicleIdentity: {
          mode: "TEMPORARY_DESCRIPTOR",
          temporaryDescriptor: "Black sedan",
        },
      }).success,
    ).toBe(false);
  });

  it("locks an unambiguous intake Customer intent", () => {
    const base = {
      intakeOperationId: "intake:00000001",
      targetLocationId: locationId,
      vehicleIdentity: confirmedPlate,
    };
    expect(
      intakeRequestSchema.parse({
        ...base,
        customer: { customerId, intent: "USE_SAVED_CUSTOMER" },
      }).customer,
    ).toEqual({ customerId, intent: "USE_SAVED_CUSTOMER" });
    expect(
      intakeRequestSchema.parse({
        ...base,
        customer: {
          displayName: "Guest",
          intent: "DIFFERENT_CUSTOMER",
          phone: "+962791234567",
        },
      }).customer,
    ).toMatchObject({ intent: "DIFFERENT_CUSTOMER" });
    expect(
      intakeRequestSchema.safeParse({
        ...base,
        customer: {
          customerId,
          intent: "USE_SAVED_CUSTOMER",
          phone: "+962791234567",
        },
      }).success,
    ).toBe(false);
  });

  it("normalizes bounded details and rejects blank detail text", () => {
    expect(
      vehicleDetailsCorrectionRequestSchema.parse({
        color: "  Ｂｌａｃｋ ",
        expectedVehicleUpdatedAt: "2026-08-29T10:00:00.000Z",
        make: "  ＢＭＷ ",
        model: null,
      }),
    ).toEqual({
      color: "Black",
      expectedVehicleUpdatedAt: "2026-08-29T10:00:00.000Z",
      make: "BMW",
      model: null,
    });
    expect(
      vehicleDetailsCorrectionRequestSchema.safeParse({
        color: " ",
        expectedVehicleUpdatedAt: "2026-08-29T10:00:00.000Z",
        make: null,
        model: null,
      }).success,
    ).toBe(false);
  });

  it("rejects full phone and historical fields from recognition", () => {
    const vehicle = {
      color: "Black",
      make: "BMW",
      model: "X5",
      plateCountry: "JO",
      plateNumberNormalized: "12345",
      plateNumberRaw: "12-345",
      returningCustomer: {
        customerId,
        displayName: "Ahmad",
        phoneSuffix: "1234",
      },
      vehicleId,
      vehicleUpdatedAt: "2026-08-29T10:00:00.000Z",
    };
    expect(
      returningVehicleRecognitionResponseSchema.parse({ vehicle }),
    ).toBeDefined();
    expect(
      returningVehicleRecognitionResponseSchema.safeParse({
        vehicle: {
          ...vehicle,
          returningCustomer: {
            ...vehicle.returningCustomer,
            phoneNormalized: "+962791234567",
          },
        },
      }).success,
    ).toBe(false);
    expect(
      returningVehicleRecognitionResponseSchema.safeParse({
        vehicle: { ...vehicle, previousLocationId: locationId },
      }).success,
    ).toBe(false);
  });
});
