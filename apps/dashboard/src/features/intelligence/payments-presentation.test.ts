import type {
  CompanyAnalyticsResponse,
  FinancialAnalyticsResponse,
  FinancialOverviewResponse,
} from "@valet/contracts";
import { describe, expect, it } from "vitest";

import { paymentsCopy } from "./payments-copy";
import {
  companyPaymentsPeriodPresentation,
  currentPaymentsPresentation,
  locationPaymentsPeriodPresentation,
} from "./payments-presentation";
import { explicitAnalyticsPeriod } from "./use-explicit-analytics-period";

const locationId = "11111111-1111-4111-8111-111111111111";

const periodFinancial: FinancialAnalyticsResponse = {
  locationId,
  timezone: "Asia/Amman",
  from: "2026-09-01",
  to: "2026-09-02",
  currencies: [
    {
      currency: "JOD",
      paidPaymentCount: 7,
      collectedAmountTotal: "12345678901234567890.123",
      tipAmountTotal: "7.777",
      digitalPaymentRate: { numerator: 3, denominator: 7, percentage: "42.86" },
      succeededRefundAmountTotal: "1.111",
      validationRate: { numerator: 2, denominator: 7, percentage: null },
      currentValidationAmountTotal: "4.444",
    },
    {
      currency: "USD",
      paidPaymentCount: 2,
      collectedAmountTotal: "20.456",
      tipAmountTotal: "0.000",
      digitalPaymentRate: { numerator: 0, denominator: 2, percentage: "0.00" },
      succeededRefundAmountTotal: "0.000",
      validationRate: { numerator: 0, denominator: 0, percentage: null },
      currentValidationAmountTotal: "0.000",
    },
  ],
  cashReconciliation: [
    {
      currency: "JOD",
      cashExpectedTotal: "5.000",
      cashReportedTotal: "4.000",
      cashVarianceTotal: "-1.000",
    },
  ],
};

const currentFinancial: FinancialOverviewResponse = {
  currencies: [{
    currency: "JOD",
    paymentCount: 3,
    amountDueTotal: "9.999",
    amountPaidTotal: "8.888",
    tipAmountTotal: "1.111",
    succeededRefundAmountTotal: "2.222",
    currentValidationAmountTotal: "3.333",
    collectionMethodCounts: [
      { method: "NONE", count: 0 },
      { method: "CASH", count: 1 },
      { method: "DIGITAL", count: 2 },
    ],
    statusCounts: [
      { status: "NOT_REQUIRED", count: 0 },
      { status: "UNPAID", count: 1 },
      { status: "PENDING", count: 0 },
      { status: "PAID", count: 2 },
      { status: "FAILED", count: 0 },
    ],
  }],
};

function companyResponse(): CompanyAnalyticsResponse {
  return {
    organizationId: "22222222-2222-4222-8222-222222222222",
    from: periodFinancial.from,
    to: periodFinancial.to,
    summary: {
      coverage: {
        totalLocationCount: 2,
        activeLocationCount: 1,
        inactiveLocationCount: 1,
        timezoneBoundaries: [],
      },
      operational: {
        metrics: Object.fromEntries([
          "checkInTime", "parkingTime", "retrievalWait",
          "retrievalStartLatencyAuxiliary", "handoffTime",
        ].map((name) => [name, {
          sampleCount: 0,
          averageSeconds: null,
          contributingLocationCount: 0,
        }])) as CompanyAnalyticsResponse["summary"]["operational"]["metrics"],
        carsHandledPerDay: [],
      },
      financial: {
        currencies: periodFinancial.currencies,
        cashReconciliation: periodFinancial.cashReconciliation,
      },
      incidents: {
        incidentCount: 0,
        severityCounts: [],
        typeCounts: [],
        incidentsPer1000: { numerator: 0, denominator: 0, value: null },
      },
      kpis: {
        slaCompliance: {
          numerator: 0, denominator: 0, percentage: null, missingTargetCount: 0,
          invalidOrMissingIntervalCount: 0, contributingLocationCount: 0, requestCount: 0,
        },
        carsPerActiveEmployee: {
          numerator: 0, denominator: 0, value: null, evidenceLocationCount: 0,
        },
        carsHandedOff: {
          attributedCount: 0, missingAttributionCount: 0, distinctAttributedEmployeeCount: 0,
        },
        keyExceptions: {
          count: 0,
          byType: [
            { type: "KEY_MISSING", count: 0 },
            { type: "WRONG_KEY", count: 0 },
            { type: "KEY_DAMAGED", count: 0 },
            { type: "KEY_LOCKED_INSIDE", count: 0 },
          ],
        },
      },
    },
  };
}

describe("MD-05B Payments presentation", () => {
  it("keeps Location current projection separate from period analytics", () => {
    const current = currentPaymentsPresentation(currentFinancial);
    const period = locationPaymentsPeriodPresentation(periodFinancial);
    expect(current.currencies[0]?.amountPaidTotal).toBe("8.888");
    expect(period.currencies[0]?.collectedAmountTotal).toBe("12345678901234567890.123");
    expect(current).not.toHaveProperty("cashReconciliation");
  });

  it("preserves exact 3-decimal strings and distinct currencies without FX", () => {
    const result = locationPaymentsPeriodPresentation(periodFinancial);
    expect(result.currencies.map(({ currency }) => currency)).toEqual(["JOD", "USD"]);
    expect(result.currencies[0]?.collectedAmountTotal).toBe("12345678901234567890.123");
    expect(result.currencies[1]?.collectedAmountTotal).toBe("20.456");
    expect(result).not.toHaveProperty("total");
    expect(result).not.toHaveProperty("grandTotal");
  });

  it("preserves null rates as unavailable evidence while keeping real zero rates", () => {
    const result = locationPaymentsPeriodPresentation(periodFinancial);
    expect(result.currencies[0]?.validationRate.percentage).toBeNull();
    expect(result.currencies[1]?.validationRate.percentage).toBeNull();
    expect(result.currencies[1]?.digitalPaymentRate.percentage).toBe("0.00");
  });

  it("keeps cash reconciliation as its own signed cohort", () => {
    const result = locationPaymentsPeriodPresentation(periodFinancial);
    expect(result.cashReconciliation).toEqual(periodFinancial.cashReconciliation);
    expect(result.cashReconciliation[0]?.cashVarianceTotal).toBe("-1.000");
  });

  it("uses Company summary.financial verbatim with Company coverage", () => {
    const source = companyResponse();
    const result = companyPaymentsPeriodPresentation(source);
    expect(result.currencies).toBe(source.summary.financial.currencies);
    expect(result.cashReconciliation).toBe(source.summary.financial.cashReconciliation);
    expect(result.companyCoverage).toBe(source.summary.coverage);
  });

  it("exposes validation aggregates only and no derived Average Payment concept", () => {
    const result = locationPaymentsPeriodPresentation(periodFinancial);
    expect(result.currencies[0]?.validationRate).toEqual({
      numerator: 2,
      denominator: 7,
      percentage: null,
    });
    expect(result.currencies[0]?.currentValidationAmountTotal).toBe("4.444");
    expect(result).not.toHaveProperty("validations");
    expect(paymentsCopy("en")).not.toHaveProperty("averagePayment");
  });

  it("accepts only explicit canonical ordered period input", () => {
    expect(explicitAnalyticsPeriod("2026-09-01", "2026-09-23"))
      .toEqual({ from: "2026-09-01", to: "2026-09-23" });
    expect(explicitAnalyticsPeriod("09/01/2026", "2026-09-23")).toBeNull();
    expect(explicitAnalyticsPeriod("2026-09-23", "2026-09-01")).toBeNull();
    expect(explicitAnalyticsPeriod("", "")).toBeNull();
  });

  it("provides EN/AR labels for all four approved cards", () => {
    for (const locale of ["en", "ar"] as const) {
      const copy = paymentsCopy(locale);
      expect([copy.collected, copy.paidPayments, copy.digitalRate, copy.validationRate])
        .toHaveLength(4);
      expect(copy.validationRate.length).toBeGreaterThan(0);
    }
  });
});
