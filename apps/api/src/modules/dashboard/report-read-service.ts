import type {
  DailyReportResponse,
  PeriodicReportResponse,
  ReportKind,
} from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { financialAnalytics } from "./analytics-financial-query";
import { incidentAnalytics } from "./analytics-incidents-query";
import { operationalAnalytics } from "./analytics-operations-query";
import type { AnalyticsPeriod } from "./analytics-period";
import { authorizeDashboardReadLocation } from "./dashboard-read-authorization";
import { assertAuthorized } from "./dashboard-overview-error";
import { dailyReportActivity } from "./report-daily-activity-query";

export interface ComposedReport {
  readonly dailyActivity: Awaited<
    ReturnType<typeof dailyReportActivity>
  > | null;
  readonly summary: DailyReportResponse["summary"];
  readonly timezone: string;
}

export async function composeReport(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    staffSessionContext?: StaffSessionContext;
    includeDailyActivity: boolean;
    locationId: string;
    recordManagementActivity?: boolean;
    period: AnalyticsPeriod;
  },
): Promise<ComposedReport> {
  const scope = await inTransactionScope(pool, input);
  const operational = await operationalAnalytics(pool, {
    authenticatedUserId: input.authenticatedUserId,
    recordManagementActivity: false,
    ...(input.staffSessionContext === undefined
      ? {}
      : { staffSessionContext: input.staffSessionContext }),
    locationId: input.locationId,
    period: input.period,
  });
  const [financial, incidents] = await Promise.all([
    financialAnalytics(pool, {
      authenticatedUserId: input.authenticatedUserId,
      recordManagementActivity: false,
      ...(input.staffSessionContext === undefined
        ? {}
        : { staffSessionContext: input.staffSessionContext }),
      locationId: input.locationId,
      period: input.period,
    }),
    incidentAnalytics(pool, {
      authenticatedUserId: input.authenticatedUserId,
      recordManagementActivity: false,
      ...(input.staffSessionContext === undefined
        ? {}
        : { staffSessionContext: input.staffSessionContext }),
      locationId: input.locationId,
      period: input.period,
    }),
  ]);
  const dailyActivity = input.includeDailyActivity
    ? await dailyReportActivity(
        pool,
        { locationId: scope.locationId, organizationId: scope.organizationId },
        input.period,
        operational.timezone,
      )
    : null;
  if (input.recordManagementActivity !== false) {
    await requireAuthorizedScope(
      pool,
      input.authenticatedUserId,
      input.locationId,
      input.staffSessionContext,
      "REPORTS_READ",
      true,
    );
  }
  return {
    dailyActivity,
    summary: {
      carsHandledPerDay: operational.carsHandledPerDay,
      cashReconciliation: financial.cashReconciliation,
      currencies: financial.currencies,
      incidents: {
        incidentCount: incidents.incidentCount,
        incidentsPer1000: incidents.incidentsPer1000,
        severityCounts: incidents.severityCounts,
        typeCounts: incidents.typeCounts,
      },
      metrics: operational.metrics,
    },
    timezone: operational.timezone,
  };
}

export async function requireAuthorizedScope(
  pool: PostgresPool,
  authenticatedUserId: string,
  locationId: string,
  staffSessionContext?: StaffSessionContext,
  capability: "REPORT_EXPORT" | "REPORTS_READ" = "REPORTS_READ",
  recordActivity = true,
): Promise<{
  locationId: string;
  membershipId: string;
  organizationId: string;
}> {
  return inPostgresTransaction(pool, async (transaction) => {
    const scope = await authorizeDashboardReadLocation(transaction, {
      authenticatedUserId,
      capability,
      recordActivity,
      ...(staffSessionContext === undefined ? {} : { staffSessionContext }),
      targetLocationId: locationId,
    });
    assertAuthorized(scope);
    return {
      locationId: scope.locationId,
      membershipId: scope.membershipId,
      organizationId: scope.organizationId,
    };
  });
}

async function inTransactionScope(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    staffSessionContext?: StaffSessionContext;
    locationId: string;
  },
): Promise<{
  locationId: string;
  membershipId: string;
  organizationId: string;
}> {
  return requireAuthorizedScope(
    pool,
    input.authenticatedUserId,
    input.locationId,
    input.staffSessionContext,
    "REPORTS_READ",
    false,
  );
}

export async function dailyAnalyticsReport(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    staffSessionContext?: StaffSessionContext;
    date: string;
    locationId: string;
  },
): Promise<DailyReportResponse> {
  const period: AnalyticsPeriod = { from: input.date, to: input.date };
  const composed = await composeReport(pool, {
    authenticatedUserId: input.authenticatedUserId,
    ...(input.staffSessionContext === undefined
      ? {}
      : { staffSessionContext: input.staffSessionContext }),
    includeDailyActivity: true,
    locationId: input.locationId,
    period,
  });
  return {
    dailyActivity: composed.dailyActivity!,
    kind: "DAILY",
    locationId: input.locationId,
    periodFrom: period.from,
    periodTo: period.to,
    summary: composed.summary,
    timezone: composed.timezone,
  };
}

export async function weeklyAnalyticsReport(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    staffSessionContext?: StaffSessionContext;
    locationId: string;
    weekStart: string;
  },
): Promise<PeriodicReportResponse> {
  const parts = input.weekStart.split("-").map(Number);
  const startMillis = Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!);
  return periodicAnalyticsReport(pool, {
    authenticatedUserId: input.authenticatedUserId,
    ...(input.staffSessionContext === undefined
      ? {}
      : { staffSessionContext: input.staffSessionContext }),
    kind: "WEEKLY",
    locationId: input.locationId,
    period: {
      from: input.weekStart,
      to: new Date(startMillis + 6 * 86_400_000).toISOString().slice(0, 10),
    },
  });
}

export async function monthlyAnalyticsReport(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    staffSessionContext?: StaffSessionContext;
    locationId: string;
    month: string;
  },
): Promise<PeriodicReportResponse> {
  const parts = input.month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(parts[0]!, parts[1]!, 0)).getUTCDate();
  return periodicAnalyticsReport(pool, {
    authenticatedUserId: input.authenticatedUserId,
    ...(input.staffSessionContext === undefined
      ? {}
      : { staffSessionContext: input.staffSessionContext }),
    kind: "MONTHLY",
    locationId: input.locationId,
    period: {
      from: `${input.month}-01`,
      to: `${input.month}-${String(lastDay).padStart(2, "0")}`,
    },
  });
}

export async function periodicAnalyticsReport(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    staffSessionContext?: StaffSessionContext;
    kind: Extract<ReportKind, "MONTHLY" | "WEEKLY">;
    locationId: string;
    period: AnalyticsPeriod;
  },
): Promise<PeriodicReportResponse> {
  const composed = await composeReport(pool, {
    authenticatedUserId: input.authenticatedUserId,
    ...(input.staffSessionContext === undefined
      ? {}
      : { staffSessionContext: input.staffSessionContext }),
    includeDailyActivity: false,
    locationId: input.locationId,
    period: input.period,
  });
  return {
    kind: input.kind,
    locationId: input.locationId,
    periodFrom: input.period.from,
    periodTo: input.period.to,
    summary: composed.summary,
    timezone: composed.timezone,
  };
}
