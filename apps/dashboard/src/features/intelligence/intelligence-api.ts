import {
  analyticsPeriodQuerySchema,
  companyAnalyticsPeriodQuerySchema,
  companyAnalyticsResponseSchema,
  companyDailyReportQuerySchema,
  companyDailyReportResponseSchema,
  companyMonthlyReportQuerySchema,
  companyPeriodicReportResponseSchema,
  companyWeeklyReportQuerySchema,
  dailyReportQuerySchema,
  dailyReportResponseSchema,
  financialAnalyticsResponseSchema,
  financialOverviewResponseSchema,
  incidentAnalyticsResponseSchema,
  locationKpiAnalyticsResponseSchema,
  monthlyReportQuerySchema,
  operationalAnalyticsResponseSchema,
  periodicReportResponseSchema,
  queueSnapshotResponseSchema,
  sessionStateCountsResponseSchema,
  weeklyReportQuerySchema,
  type AnalyticsPeriodQuery,
  type CompanyPeriodicReportResponse,
  type DailyReportQuery,
  type MonthlyReportQuery,
  type PeriodicReportResponse,
  type WeeklyReportQuery,
} from "@valet/contracts";

import type {
  DashboardApiClient,
  RuntimeSchema,
} from "../../lib/api/dashboard-api-client";

function locationPath(locationId: string, suffix: string): string {
  return `/v1/staff/dashboard/locations/${encodeURIComponent(locationId)}${suffix}`;
}

function companyPath(organizationId: string, suffix: string): string {
  return `/v1/staff/management/organizations/${encodeURIComponent(organizationId)}${suffix}`;
}

function exactReportKindSchema<T extends { readonly kind: string }, K extends T["kind"]>(
  schema: RuntimeSchema<T>,
  expectedKind: K,
): RuntimeSchema<T & { readonly kind: K }> {
  return {
    safeParse(input: unknown) {
      const parsed = schema.safeParse(input);
      if (!parsed.success) return parsed;
      if (parsed.data.kind !== expectedKind) {
        return { success: false, error: new Error("Unexpected report kind.") };
      }
      return {
        success: true,
        data: parsed.data as T & { readonly kind: K },
      };
    },
  };
}

const locationWeeklyReportResponseSchema = exactReportKindSchema<
  PeriodicReportResponse,
  "WEEKLY"
>(periodicReportResponseSchema, "WEEKLY");
const locationMonthlyReportResponseSchema = exactReportKindSchema<
  PeriodicReportResponse,
  "MONTHLY"
>(periodicReportResponseSchema, "MONTHLY");
const companyWeeklyReportResponseSchema = exactReportKindSchema<
  CompanyPeriodicReportResponse,
  "WEEKLY"
>(companyPeriodicReportResponseSchema, "WEEKLY");
const companyMonthlyReportResponseSchema = exactReportKindSchema<
  CompanyPeriodicReportResponse,
  "MONTHLY"
>(companyPeriodicReportResponseSchema, "MONTHLY");

function locationPeriodRequest<T>(
  api: DashboardApiClient,
  locationId: string,
  suffix: string,
  responseSchema: RuntimeSchema<T>,
  period: AnalyticsPeriodQuery,
  signal?: AbortSignal,
) {
  const query = analyticsPeriodQuerySchema.parse(period);
  return api.request(locationPath(locationId, suffix), responseSchema, {
    query,
    signal,
  });
}

export function readLocationSessionStateCounts(
  api: DashboardApiClient,
  locationId: string,
  signal?: AbortSignal,
) {
  return api.request(
    locationPath(locationId, "/overview/session-state-counts"),
    sessionStateCountsResponseSchema,
    { signal },
  );
}

export function readLocationQueueAnalytics(
  api: DashboardApiClient,
  locationId: string,
  signal?: AbortSignal,
) {
  return api.request(
    locationPath(locationId, "/analytics/queue"),
    queueSnapshotResponseSchema,
    { signal },
  );
}

export function readLocationFinancialOverview(
  api: DashboardApiClient,
  locationId: string,
  signal?: AbortSignal,
) {
  return api.request(
    locationPath(locationId, "/overview/financial"),
    financialOverviewResponseSchema,
    { signal },
  );
}

export function readLocationOperationalAnalytics(
  api: DashboardApiClient,
  locationId: string,
  period: AnalyticsPeriodQuery,
  signal?: AbortSignal,
) {
  return locationPeriodRequest(
    api,
    locationId,
    "/analytics/operations",
    operationalAnalyticsResponseSchema,
    period,
    signal,
  );
}

export function readLocationFinancialAnalytics(
  api: DashboardApiClient,
  locationId: string,
  period: AnalyticsPeriodQuery,
  signal?: AbortSignal,
) {
  return locationPeriodRequest(
    api,
    locationId,
    "/analytics/financial",
    financialAnalyticsResponseSchema,
    period,
    signal,
  );
}

export function readLocationIncidentAnalytics(
  api: DashboardApiClient,
  locationId: string,
  period: AnalyticsPeriodQuery,
  signal?: AbortSignal,
) {
  return locationPeriodRequest(
    api,
    locationId,
    "/analytics/incidents",
    incidentAnalyticsResponseSchema,
    period,
    signal,
  );
}

export function readLocationKpiAnalytics(
  api: DashboardApiClient,
  locationId: string,
  period: AnalyticsPeriodQuery,
  signal?: AbortSignal,
) {
  return locationPeriodRequest(
    api,
    locationId,
    "/analytics/kpis",
    locationKpiAnalyticsResponseSchema,
    period,
    signal,
  );
}

export function readCompanyAnalytics(
  api: DashboardApiClient,
  organizationId: string,
  period: AnalyticsPeriodQuery,
  signal?: AbortSignal,
) {
  const query = companyAnalyticsPeriodQuerySchema.parse(period);
  return api.request(
    companyPath(organizationId, "/analytics/all-locations"),
    companyAnalyticsResponseSchema,
    { query, signal },
  );
}

export function readLocationDailyReport(
  api: DashboardApiClient,
  locationId: string,
  selector: DailyReportQuery,
  signal?: AbortSignal,
) {
  const query = dailyReportQuerySchema.parse(selector);
  return api.request(locationPath(locationId, "/reports/daily"), dailyReportResponseSchema, {
    query,
    signal,
  });
}

export function readLocationWeeklyReport(
  api: DashboardApiClient,
  locationId: string,
  selector: WeeklyReportQuery,
  signal?: AbortSignal,
) {
  const query = weeklyReportQuerySchema.parse(selector);
  return api.request(
    locationPath(locationId, "/reports/weekly"),
    locationWeeklyReportResponseSchema,
    { query, signal },
  );
}

export function readLocationMonthlyReport(
  api: DashboardApiClient,
  locationId: string,
  selector: MonthlyReportQuery,
  signal?: AbortSignal,
) {
  const query = monthlyReportQuerySchema.parse(selector);
  return api.request(
    locationPath(locationId, "/reports/monthly"),
    locationMonthlyReportResponseSchema,
    { query, signal },
  );
}

export function readCompanyDailyReport(
  api: DashboardApiClient,
  organizationId: string,
  selector: DailyReportQuery,
  signal?: AbortSignal,
) {
  const query = companyDailyReportQuerySchema.parse(selector);
  return api.request(
    companyPath(organizationId, "/reports/daily"),
    companyDailyReportResponseSchema,
    { query, signal },
  );
}

export function readCompanyWeeklyReport(
  api: DashboardApiClient,
  organizationId: string,
  selector: WeeklyReportQuery,
  signal?: AbortSignal,
) {
  const query = companyWeeklyReportQuerySchema.parse(selector);
  return api.request(
    companyPath(organizationId, "/reports/weekly"),
    companyWeeklyReportResponseSchema,
    { query, signal },
  );
}

export function readCompanyMonthlyReport(
  api: DashboardApiClient,
  organizationId: string,
  selector: MonthlyReportQuery,
  signal?: AbortSignal,
) {
  const query = companyMonthlyReportQuerySchema.parse(selector);
  return api.request(
    companyPath(organizationId, "/reports/monthly"),
    companyMonthlyReportResponseSchema,
    { query, signal },
  );
}
