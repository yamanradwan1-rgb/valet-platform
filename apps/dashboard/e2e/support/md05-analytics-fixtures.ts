import type { Page, Request } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";
import {
  companyAnalytics,
  companyAnalyticsPath,
  financialCurrency,
  locationIntelligenceReply,
  locationPaths,
  PERIOD_A,
} from "./md05-intelligence-fixtures";

export const analyticsLocationFamilies = [
  locationPaths.operations,
  locationPaths.financial,
  locationPaths.incidents,
  locationPaths.kpis,
] as const;

export const nonAnalyticsLocationFamilies = [
  locationPaths.stateCounts,
  locationPaths.queue,
  locationPaths.financialOverview,
] as const;

export const ANALYTICS_PERIOD = PERIOD_A;
export const MIXED_TIMEZONE_EXPECTATIONS = [
  "America/New_York · Total Locations: 1 · Active Locations: 1 · Inactive Locations: 0 · "
    + "2026-09-01T04:00:00.000Z – 2026-09-08T04:00:00.000Z",
  "Asia/Amman · Total Locations: 1 · Active Locations: 1 · Inactive Locations: 0 · "
    + "2026-08-31T21:00:00.000Z – 2026-09-07T21:00:00.000Z",
] as const;

export function exactPeriodUrl(
  path: string,
  period = ANALYTICS_PERIOD,
): string {
  return `${path}?from=${period.from}&to=${period.to}`;
}

export function requestPathAndQuery(request: Request): string {
  const url = new URL(request.url());
  return `${url.pathname}${url.search}`;
}

export async function enterCompanyAnalytics(
  page: Page,
  path = "/analytics",
): Promise<void> {
  await page.goto(path);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
}

export async function enterCompanyLocationAnalytics(page: Page): Promise<void> {
  await page.goto("/analytics");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}

export async function enterManagerAnalytics(page: Page): Promise<void> {
  await page.goto("/analytics");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}

export async function applyAnalyticsPeriod(
  page: Page,
  from = ANALYTICS_PERIOD.from,
  to = ANALYTICS_PERIOD.to,
): Promise<void> {
  await page
    .getByTestId("analytics-header-selectors")
    .locator("button[aria-haspopup='dialog']")
    .click();
  const dialog = page.getByRole("dialog");
  const fromInput = dialog.getByLabel(/From|من/u);
  const toInput = dialog.getByLabel(/To|إلى/u);
  await fromInput.fill(from);
  await toInput.fill(to);
  await dialog.getByRole("button", { name: /Apply|تطبيق/u }).click();
}

export function standardCompanyFixture(
  override?: ConstructorParameters<typeof DashboardApiFixture>[0]["override"],
): DashboardApiFixture {
  return new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: override ?? ((path, request) =>
      path === companyAnalyticsPath
        ? { body: companyAnalytics(request) }
        : undefined),
  });
}

export function standardLocationFixture(
  manager: boolean,
  override?: ConstructorParameters<typeof DashboardApiFixture>[0]["override"],
): DashboardApiFixture {
  const organizations = manager
    ? { locationManagerOrganizations: [ORG_A], locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] } }
    : { companyOrganizations: [ORG_A], companyLocations: { [ORG_A.organizationId]: [LOCATION_A] } };
  return new DashboardApiFixture({
    ...organizations,
    override: override ?? ((path, request) => locationIntelligenceReply(path, request)),
  });
}

export function mixedEvidenceCompanyAnalytics(request: Request) {
  const currencies = [
    financialCurrency("JOD", "12.345", { nullRates: true }),
    financialCurrency("USD", "45.670", { nullRates: true }),
  ];
  const base = companyAnalytics(request, 7, currencies);
  const nullDuration = {
    sampleCount: 0,
    averageSeconds: null,
    contributingLocationCount: 0,
  };
  return {
    ...base,
    summary: {
      ...base.summary,
      coverage: {
        totalLocationCount: 2,
        activeLocationCount: 2,
        inactiveLocationCount: 0,
        timezoneBoundaries: [
          {
            timezone: "America/New_York",
            locationCount: 1,
            activeLocationCount: 1,
            inactiveLocationCount: 0,
            periodStartUtc: "2026-09-01T04:00:00.000Z",
            periodEndUtc: "2026-09-08T04:00:00.000Z",
          },
          {
            timezone: "Asia/Amman",
            locationCount: 1,
            activeLocationCount: 1,
            inactiveLocationCount: 0,
            periodStartUtc: "2026-08-31T21:00:00.000Z",
            periodEndUtc: "2026-09-07T21:00:00.000Z",
          },
        ],
      },
      operational: {
        ...base.summary.operational,
        metrics: {
          ...base.summary.operational.metrics,
          retrievalWait: nullDuration,
          handoffTime: nullDuration,
        },
      },
      financial: {
        currencies,
        cashReconciliation: [
          {
            currency: "JOD",
            cashExpectedTotal: "9.000",
            cashReportedTotal: "7.500",
            cashVarianceTotal: "-1.500",
          },
          {
            currency: "USD",
            cashExpectedTotal: "4.000",
            cashReportedTotal: "5.250",
            cashVarianceTotal: "1.250",
          },
        ],
      },
      incidents: {
        ...base.summary.incidents,
        incidentsPer1000: { numerator: 0, denominator: 0, value: null },
      },
      kpis: {
        ...base.summary.kpis,
        slaCompliance: {
          ...base.summary.kpis.slaCompliance,
          numerator: 0,
          denominator: 0,
          percentage: null,
          missingTargetCount: 2,
          invalidOrMissingIntervalCount: 3,
          requestCount: 5,
        },
        carsPerActiveEmployee: {
          ...base.summary.kpis.carsPerActiveEmployee,
          denominator: 0,
          value: null,
        },
        carsHandedOff: {
          attributedCount: 5,
          missingAttributionCount: 2,
          distinctAttributedEmployeeCount: 3,
        },
      },
    },
  };
}
