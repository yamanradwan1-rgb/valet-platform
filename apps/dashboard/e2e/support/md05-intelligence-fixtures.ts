import type { Request } from "@playwright/test";

import type { FixtureReply } from "./dashboard-api-fixture";
import { LOCATION_A, ORG_A } from "./dashboard-api-fixture";
import type { Location } from "./fixture-data";

export const PERIOD_A = { from: "2026-09-01", to: "2026-09-07" } as const;
export const PERIOD_B = { from: "2026-09-08", to: "2026-09-14" } as const;

export const companyAnalyticsPath =
  `/v1/staff/management/organizations/${ORG_A.organizationId}/analytics/all-locations`;
export const companyContextPath =
  `/v1/staff/management/organizations/${ORG_A.organizationId}/context`;

export function locationPathsFor(locationId: string) {
  return {
    stateCounts: `/v1/staff/dashboard/locations/${locationId}/overview/session-state-counts`,
    queue: `/v1/staff/dashboard/locations/${locationId}/analytics/queue`,
    financialOverview: `/v1/staff/dashboard/locations/${locationId}/overview/financial`,
    operations: `/v1/staff/dashboard/locations/${locationId}/analytics/operations`,
    financial: `/v1/staff/dashboard/locations/${locationId}/analytics/financial`,
    incidents: `/v1/staff/dashboard/locations/${locationId}/analytics/incidents`,
    kpis: `/v1/staff/dashboard/locations/${locationId}/analytics/kpis`,
  } as const;
}

export const locationPaths = locationPathsFor(LOCATION_A.locationId);

const states = [
  "AWAITING_PARKING",
  "CHECKING_IN",
  "COMPLETED",
  "HANDOFF_PENDING",
  "PARKED",
  "PARKING",
  "READY",
  "REQUESTED",
  "RETRIEVING",
] as const;

const keyTypes = [
  "KEY_MISSING",
  "WRONG_KEY",
  "KEY_DAMAGED",
  "KEY_LOCKED_INSIDE",
] as const;

export function requestPeriod(request: Request) {
  const query = new URL(request.url()).searchParams;
  return {
    from: query.get("from") ?? PERIOD_A.from,
    to: query.get("to") ?? PERIOD_A.to,
  };
}

export function staleInactiveExactLocationContext() {
  let exactContextReads = 0;
  return (path: string, request: Request): FixtureReply | undefined => {
    const url = new URL(request.url());
    if (
      path !== companyContextPath ||
      url.searchParams.get("scopeKind") !== "LOCATION" ||
      url.searchParams.get("locationId") !== LOCATION_A.locationId
    ) return undefined;
    exactContextReads += 1;
    return {
      body: {
        organization: ORG_A,
        scope: { kind: "LOCATION", locationId: LOCATION_A.locationId },
        selectedLocation: {
          ...LOCATION_A,
          status: exactContextReads === 1 ? "ACTIVE" : "INACTIVE",
        },
        capabilities: ["LOCATION_DASHBOARD_READ"],
      },
    };
  };
}

function duration(sampleCount = 2, averageSeconds: string | null = "12.500") {
  return { sampleCount, averageSeconds };
}

function companyDuration() {
  return { ...duration(), contributingLocationCount: 2 };
}

function rate(numerator: number, denominator: number, percentage: string | null) {
  return { numerator, denominator, percentage };
}

export function financialCurrency(
  currency: "JOD" | "USD",
  collectedAmountTotal: string,
  options: { readonly nullRates?: boolean } = {},
) {
  const nullRate = options.nullRates === true;
  return {
    currency,
    paidPaymentCount: currency === "JOD" ? 2 : 3,
    collectedAmountTotal,
    tipAmountTotal: currency === "JOD" ? "1.250" : "2.500",
    digitalPaymentRate: nullRate ? rate(0, 0, null) : rate(1, 2, "50.00"),
    succeededRefundAmountTotal: "0.000",
    validationRate: nullRate ? rate(0, 0, null) : rate(1, 4, "25.00"),
    currentValidationAmountTotal: currency === "JOD" ? "3.000" : "4.000",
  };
}

export function currentFinancialOverview(amountPaidTotal = "12.000") {
  return {
    currencies: [{
      currency: "JOD",
      paymentCount: 2,
      amountDueTotal: "15.000",
      amountPaidTotal,
      tipAmountTotal: "1.000",
      succeededRefundAmountTotal: "0.000",
      currentValidationAmountTotal: "3.000",
      collectionMethodCounts: [{ method: "CASH", count: 2 }],
      statusCounts: [{ status: "PAID", count: 2 }],
    }],
  };
}

export function companyAnalytics(
  request: Request,
  carsHandled = 7,
  currencies = [financialCurrency("JOD", "12.345")],
) {
  const period = requestPeriod(request);
  return {
    organizationId: ORG_A.organizationId,
    ...period,
    summary: {
      coverage: {
        totalLocationCount: 2,
        activeLocationCount: 1,
        inactiveLocationCount: 1,
        timezoneBoundaries: [{
          timezone: "Asia/Amman",
          locationCount: 2,
          activeLocationCount: 1,
          inactiveLocationCount: 1,
          periodStartUtc: `${period.from}T00:00:00.000Z`,
          periodEndUtc: `${period.to}T23:59:59.000Z`,
        }],
      },
      operational: {
        metrics: {
          checkInTime: companyDuration(),
          parkingTime: companyDuration(),
          retrievalWait: companyDuration(),
          retrievalStartLatencyAuxiliary: companyDuration(),
          handoffTime: companyDuration(),
        },
        carsHandledPerDay: [{ date: period.from, handledCount: carsHandled }],
      },
      financial: { currencies, cashReconciliation: [] },
      incidents: {
        incidentCount: 1,
        severityCounts: [{ severity: "LOW", count: 1 }],
        typeCounts: [{ type: "TEST", count: 1 }],
        incidentsPer1000: { numerator: 1, denominator: carsHandled, value: "142.857" },
      },
      kpis: {
        slaCompliance: {
          numerator: 5,
          denominator: 6,
          percentage: "83.33",
          missingTargetCount: 0,
          invalidOrMissingIntervalCount: 0,
          contributingLocationCount: 2,
          requestCount: 6,
        },
        carsPerActiveEmployee: {
          numerator: carsHandled,
          denominator: 2,
          value: "3.500",
          evidenceLocationCount: 2,
        },
        carsHandedOff: {
          attributedCount: carsHandled,
          missingAttributionCount: 0,
          distinctAttributedEmployeeCount: 2,
        },
        keyExceptions: {
          count: 0,
          byType: keyTypes.map((type) => ({ type, count: 0 })),
        },
      },
    },
  };
}

function locationPeriodEnvelope(request: Request, location: Location) {
  return {
    locationId: location.locationId,
    timezone: location.timezone,
    ...requestPeriod(request),
  };
}

export function locationIntelligenceReply(
  path: string,
  request: Request,
  carsHandled = 4,
  location: Location = LOCATION_A,
): FixtureReply | undefined {
  const paths = locationPathsFor(location.locationId);
  if (path === paths.stateCounts) {
    return { body: { counts: states.map((state, index) => ({ state, count: index + 1 })) } };
  }
  if (path === paths.queue) return { body: { depth: 2, oldestAgeSeconds: "45.000" } };
  if (path === paths.financialOverview) {
    return { body: currentFinancialOverview() };
  }
  const envelope = locationPeriodEnvelope(request, location);
  if (path === paths.operations) {
    return {
      body: {
        ...envelope,
        metrics: {
          checkInTime: duration(),
          parkingTime: duration(),
          retrievalWait: duration(),
          retrievalStartLatencyAuxiliary: duration(),
          handoffTime: duration(),
        },
        carsHandledPerDay: [{ date: envelope.from, handledCount: carsHandled }],
      },
    };
  }
  if (path === paths.financial) {
    return {
      body: {
        ...envelope,
        currencies: [financialCurrency("JOD", `${carsHandled}.000`)],
        cashReconciliation: [],
      },
    };
  }
  if (path === paths.incidents) {
    return {
      body: {
        ...envelope,
        incidentCount: 1,
        severityCounts: [{ severity: "LOW", count: 1 }],
        typeCounts: [{ type: "TEST", count: 1 }],
        incidentsPer1000: { numerator: 1, denominator: carsHandled, value: "250.000" },
      },
    };
  }
  if (path === paths.kpis) {
    return {
      body: {
        ...envelope,
        slaCompliance: {
          denominator: 4,
          invalidOrMissingIntervalCount: 0,
          missingTargetCount: 0,
          numerator: 3,
          percentage: "75.00",
        },
        carsPerActiveEmployee: { denominator: 2, numerator: carsHandled, value: "2.000" },
        carsHandedOffByEmployee: {
          attributedCount: carsHandled,
          employeeCount: 0,
          missingAttributionCount: 0,
          truncated: false,
          byEmployee: [],
        },
        keyExceptions: { count: 0, byType: keyTypes.map((type) => ({ type, count: 0 })) },
      },
    };
  }
  return undefined;
}
