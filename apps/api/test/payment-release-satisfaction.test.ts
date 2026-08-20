import { describe, expect, it } from "vitest";

import { isPaymentReleaseSatisfied } from "../src/modules/payments/payment-release-satisfaction";

const zeroDue = {
  amountDue: "0.000",
  amountPaid: "0.000",
  collectionMethod: "NONE" as const,
  paidAt: null,
  provider: null,
  providerReference: null,
  status: "NOT_REQUIRED" as const,
};

const cashPaid = {
  amountDue: "10.000",
  amountPaid: "10.000",
  collectionMethod: "CASH" as const,
  paidAt: new Date("2026-08-20T00:00:00Z"),
  provider: null,
  providerReference: null,
  status: "PAID" as const,
};

describe("VAL-008G financial release predicate", () => {
  it("passes any financial state when current policy does not require payment", () => {
    expect(isPaymentReleaseSatisfied(false, null)).toBe(true);
    expect(
      isPaymentReleaseSatisfied(false, {
        ...cashPaid,
        amountPaid: "0.000",
        status: "FAILED",
      }),
    ).toBe(true);
  });

  it("requires a Payment when current policy requires payment", () => {
    expect(isPaymentReleaseSatisfied(true, null)).toBe(false);
  });

  it("accepts only the exact zero-due NOT_REQUIRED projection", () => {
    expect(isPaymentReleaseSatisfied(true, zeroDue)).toBe(true);
    for (const payment of [
      { ...zeroDue, amountDue: "0.001" },
      { ...zeroDue, amountPaid: "0.001" },
      { ...zeroDue, collectionMethod: "CASH" as const },
      { ...zeroDue, paidAt: new Date() },
      { ...zeroDue, provider: "safe-provider" },
      { ...zeroDue, providerReference: "reference" },
      { ...zeroDue, status: "UNPAID" as const },
    ]) {
      expect(isPaymentReleaseSatisfied(true, payment)).toBe(false);
    }
  });

  it("accepts exact collected CASH and DIGITAL projections", () => {
    expect(isPaymentReleaseSatisfied(true, cashPaid)).toBe(true);
    expect(
      isPaymentReleaseSatisfied(true, {
        ...cashPaid,
        collectionMethod: "DIGITAL",
        provider: "safe-provider",
        providerReference: "reference",
      }),
    ).toBe(true);
  });

  it("fails closed for every other paid or incoherent projection", () => {
    for (const payment of [
      { ...cashPaid, amountDue: "0.000", amountPaid: "0.000" },
      { ...cashPaid, amountPaid: "9.999" },
      { ...cashPaid, paidAt: null },
      { ...cashPaid, provider: "unexpected" },
      { ...cashPaid, providerReference: "unexpected" },
      { ...cashPaid, collectionMethod: "NONE" as const },
      {
        ...cashPaid,
        collectionMethod: "DIGITAL" as const,
        provider: null,
        providerReference: "reference",
      },
      {
        ...cashPaid,
        collectionMethod: "DIGITAL" as const,
        provider: "safe-provider",
        providerReference: null,
      },
      { ...cashPaid, amountDue: "not-money" },
      { ...cashPaid, status: "PENDING" as const },
    ]) {
      expect(isPaymentReleaseSatisfied(true, payment)).toBe(false);
    }
  });
});
