import { describe, expect, it } from "vitest";

import {
  guestPaymentProjectionResponseSchema,
  staffPaymentProjectionResponseSchema,
} from "./payments.js";

const payment = {
  amountDue: "10.000",
  amountPaid: "10.000",
  collectionMethod: "CASH" as const,
  currency: "JOD",
  currentValidation: { amount: "2.000", mode: "PARTIAL" as const },
  paidAt: "2026-08-20T10:00:00.000Z",
  serviceAmount: "12.000",
  servicePayer: "CUSTOMER" as const,
  status: "PAID" as const,
  tipAmount: "0.000",
};
const refund = {
  amount: "1.000",
  completedAt: null,
  requestedAt: "2026-08-20T11:00:00.000Z",
  status: "PENDING" as const,
};

describe("VAL-008G Payment projection contracts", () => {
  it("accepts the exact Guest-safe nullable projection", () => {
    expect(
      guestPaymentProjectionResponseSchema.parse({
        payment,
        refunds: [refund],
        releaseRequiresPayment: true,
        releaseSatisfied: true,
      }),
    ).toEqual({
      payment,
      refunds: [refund],
      releaseRequiresPayment: true,
      releaseSatisfied: true,
    });
    expect(
      guestPaymentProjectionResponseSchema.safeParse({
        payment: null,
        refunds: [],
        releaseRequiresPayment: false,
        releaseSatisfied: true,
      }).success,
    ).toBe(true);
  });

  it("rejects internal identifiers and provider/correlation fields for Guest", () => {
    for (const field of [
      "paymentId",
      "provider",
      "providerReference",
      "organizationId",
      "locationId",
      "creationIdempotencyKey",
      "updatedAt",
    ]) {
      expect(
        guestPaymentProjectionResponseSchema.safeParse({
          payment: { ...payment, [field]: "forbidden" },
          refunds: [],
          releaseRequiresPayment: true,
          releaseSatisfied: true,
        }).success,
      ).toBe(false);
    }
    expect(
      guestPaymentProjectionResponseSchema.safeParse({
        payment,
        refunds: [
          {
            ...refund,
            refundId: "00000000-0000-4000-8000-000000000001",
          },
        ],
        releaseRequiresPayment: true,
        releaseSatisfied: true,
      }).success,
    ).toBe(false);
  });

  it("adds only Payment id, Refund id, and Payment updatedAt for staff", () => {
    const response = staffPaymentProjectionResponseSchema.parse({
      payment: {
        ...payment,
        paymentId: "00000000-0000-4000-8000-000000000001",
        updatedAt: "2026-08-20T10:01:00.000Z",
      },
      refunds: [
        {
          ...refund,
          refundId: "00000000-0000-4000-8000-000000000002",
        },
      ],
      releaseRequiresPayment: true,
      releaseSatisfied: true,
    });
    expect(response.payment).toHaveProperty("paymentId");
    expect(response.refunds[0]).toHaveProperty("refundId");
    expect(response.payment).not.toHaveProperty("provider");
    expect(response.refunds[0]).not.toHaveProperty("reason");
    expect(
      staffPaymentProjectionResponseSchema.safeParse({
        ...response,
        payment: { ...response.payment, provider: "forbidden" },
      }).success,
    ).toBe(false);
    expect(
      staffPaymentProjectionResponseSchema.safeParse({
        ...response,
        refunds: [{ ...response.refunds[0], reason: "forbidden" }],
      }).success,
    ).toBe(false);
  });
});
