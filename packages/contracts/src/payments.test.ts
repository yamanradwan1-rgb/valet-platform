import { describe, expect, it } from "vitest";

import {
  paymentMutationResponseSchema,
  paymentPayerCorrectionRequestSchema,
  paymentServiceAmountCorrectionRequestSchema,
  paymentTipMutationRequestSchema,
  validationMutationRequestSchema,
} from "./payments.js";

describe("VAL-008B Payment mutation contracts", () => {
  it("accepts only exact Validation mode shapes", () => {
    expect(
      validationMutationRequestSchema.safeParse({ mode: "FULL" }).success,
    ).toBe(true);
    expect(
      validationMutationRequestSchema.safeParse({
        amount: "1.250",
        mode: "PARTIAL",
      }).success,
    ).toBe(true);
    expect(
      validationMutationRequestSchema.safeParse({ mode: "NONE" }).success,
    ).toBe(true);
    expect(
      validationMutationRequestSchema.safeParse({ amount: "1", mode: "FULL" })
        .success,
    ).toBe(false);
  });

  it.each(["-1", "1.0001", "1e2", "100000000000.000", 1])(
    "rejects non-numeric(14,3) money input %s",
    (value) => {
      expect(
        paymentTipMutationRequestSchema.safeParse({ tipAmount: value }).success,
      ).toBe(false);
    },
  );

  it("rejects unknown financial authority fields", () => {
    expect(
      paymentTipMutationRequestSchema.safeParse({
        currency: "USD",
        payer: "VENUE",
        provider: "fake",
        status: "PAID",
        tipAmount: "1.000",
      }).success,
    ).toBe(false);
  });

  it("keeps payer and service corrections separate and strict", () => {
    expect(
      paymentPayerCorrectionRequestSchema.safeParse({ servicePayer: "VENUE" })
        .success,
    ).toBe(true);
    expect(
      paymentServiceAmountCorrectionRequestSchema.safeParse({
        serviceAmount: "2.000",
      }).success,
    ).toBe(true);
    expect(
      paymentPayerCorrectionRequestSchema.safeParse({
        serviceAmount: "2.000",
        servicePayer: "VENUE",
      }).success,
    ).toBe(false);
  });

  it("returns a safe projection without tenant or provider fields", () => {
    const response = paymentMutationResponseSchema.parse({
      amountDue: "7.000",
      collectionMethod: "CASH",
      currency: "JOD",
      currentValidation: null,
      serviceAmount: "5.000",
      servicePayer: "CUSTOMER",
      status: "UNPAID",
      tipAmount: "2.000",
      updatedAt: "2026-08-15T00:00:00.000Z",
      valetSessionId: "00000000-0000-4000-8000-000000000001",
    });
    expect(response).not.toHaveProperty("organizationId");
    expect(response).not.toHaveProperty("provider");
  });
});
