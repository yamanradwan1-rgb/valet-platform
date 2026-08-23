import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { financialAnalytics } from "../src/modules/dashboard/analytics-financial-query";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";
import {
  analyticsSeedPayment,
  analyticsSeedRefund,
  analyticsSeedSession,
  analyticsSeedValidationPair,
} from "./dashboard-analytics-seed";

const context = new DashboardOverviewTestContext("analytics-cohorts");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

const manager = () => context.managerFixture();
const PERIOD = { from: "2026-07-10", to: "2026-07-11" };

async function callFinancial() {
  const fixture = await manager();
  return financialAnalytics(context.runtimePool, {
    authenticatedUserId: fixture.userId,
    locationId: fixture.locationId,
    period: PERIOD,
  });
}

beforeAll(async () => {
  await manager();
  // Validation-only currency: completed in-period session whose canonical
  // Payment never reaches PAID/paid_at inside the period.
  const eurSession = await analyticsSeedSession(context, {
    state: "COMPLETED",
    completedAtIso: "2026-07-10T09:00:00Z",
  });
  const eurPayment = await analyticsSeedPayment(context, {
    currency: "EUR",
    sessionId: eurSession,
    status: "UNPAID",
  });
  await analyticsSeedValidationPair(context, { paymentId: eurPayment });

  // Refund-only currency: no paid-at-in-period row for the currency, but a
  // SUCCEEDED Refund completed inside the period.
  const gbpSession = await analyticsSeedSession(context, {
    state: "PARKED",
  });
  const gbpPayment = await analyticsSeedPayment(context, {
    currency: "GBP",
    sessionId: gbpSession,
    status: "UNPAID",
  });
  await analyticsSeedRefund(context, {
    amount: "2.750",
    completedAtIso: "2026-07-11T08:00:00Z",
    paymentId: gbpPayment,
    status: "SUCCEEDED",
  });

  // Paid-cohort control currency with real collected money.
  const jodSession = await analyticsSeedSession(context, {
    state: "COMPLETED",
    completedAtIso: "2026-07-10T12:00:00Z",
  });
  await analyticsSeedPayment(context, {
    currency: "JOD",
    method: "CASH",
    paidAtIso: "2026-07-10T13:00:00Z",
    sessionId: jodSession,
  });
}, 120_000);

describe("VAL-009D financial currency cohort union", () => {
  it("covers exactly the union of independent cohort currency keys", async () => {
    const response = await callFinancial();
    expect(response.currencies.map((group) => group.currency)).toEqual([
      "EUR",
      "GBP",
      "JOD",
    ]);
  });

  it("preserves real validation facts without any paid-cohort row", async () => {
    const response = await callFinancial();
    const eur = response.currencies.find((g) => g.currency === "EUR")!;
    expect(eur).toEqual({
      collectedAmountTotal: "0.000",
      currency: "EUR",
      currentValidationAmountTotal: "4.000",
      digitalPaymentRate: {
        denominator: 0,
        numerator: 0,
        percentage: null,
      },
      paidPaymentCount: 0,
      succeededRefundAmountTotal: "0.000",
      tipAmountTotal: "0.000",
      validationRate: {
        denominator: 1,
        numerator: 1,
        percentage: "100.00",
      },
    });
  });

  it("preserves refund-only currencies with defaulted paid metrics", async () => {
    const response = await callFinancial();
    const gbp = response.currencies.find((g) => g.currency === "GBP")!;
    expect(gbp).toEqual({
      collectedAmountTotal: "0.000",
      currency: "GBP",
      currentValidationAmountTotal: "0.000",
      digitalPaymentRate: {
        denominator: 0,
        numerator: 0,
        percentage: null,
      },
      paidPaymentCount: 0,
      succeededRefundAmountTotal: "2.750",
      tipAmountTotal: "0.000",
      validationRate: {
        denominator: 0,
        numerator: 0,
        percentage: null,
      },
    });
  });

  it("keeps the paid-control currency intact beside unioned keys", async () => {
    const response = await callFinancial();
    const jod = response.currencies.find((g) => g.currency === "JOD")!;
    expect(jod).toMatchObject({
      collectedAmountTotal: "11.000",
      currentValidationAmountTotal: "0.000",
      paidPaymentCount: 1,
      succeededRefundAmountTotal: "0.000",
      tipAmountTotal: "1.000",
    });
    expect(jod.digitalPaymentRate).toEqual({
      denominator: 1,
      numerator: 0,
      percentage: "0.00",
    });
  });
});
