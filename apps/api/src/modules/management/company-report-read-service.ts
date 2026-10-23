import { Inject, Injectable } from "@nestjs/common";
import {
  companyDailyReportResponseSchema,
  companyPeriodicReportResponseSchema,
  type CompanyReportResponse,
  type ReportKind,
} from "@valet/contracts";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { StaffSessionContext } from "../auth/staff-session-context";
import type { AnalyticsPeriod } from "../dashboard/analytics-period";
import { inFencedCompanyAdminRrSnapshot } from "./company-admin-rr-snapshot";
import { composeCompanyAnalyticsSources } from "./company-analytics-source";
import { queryCompanyDailyActivity } from "./company-report-daily-activity-query";

const maximumDispatchGroups = 16;
const maximumCustodyGroups = 5;

export async function composeCompanyReportSnapshot(
  transaction: PostgresTransaction,
  input: {
    readonly kind: ReportKind;
    readonly organizationId: string;
    readonly period: AnalyticsPeriod;
  },
): Promise<CompanyReportResponse> {
  const summary = await composeCompanyAnalyticsSources(transaction, {
    from: input.period.from,
    organizationId: input.organizationId,
    to: input.period.to,
  });
  if (input.kind === "DAILY") {
    const activity = await queryCompanyDailyActivity(transaction, {
      from: input.period.from,
      organizationId: input.organizationId,
      to: input.period.to,
    });
    if (
      activity.dispatchGroupCount > maximumDispatchGroups ||
      activity.custodyGroupCount > maximumCustodyGroups
    ) {
      throw new Error("Company daily activity exceeds the controlled catalog bound.");
    }
    return companyDailyReportResponseSchema.parse({
      dailyActivity: activity.data,
      kind: input.kind,
      organizationId: input.organizationId,
      periodFrom: input.period.from,
      periodTo: input.period.to,
      summary,
    });
  }
  return companyPeriodicReportResponseSchema.parse({
    kind: input.kind,
    organizationId: input.organizationId,
    periodFrom: input.period.from,
    periodTo: input.period.to,
    summary,
  });
}

@Injectable()
export class ManagementCompanyReportService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  read(
    context: StaffSessionContext,
    organizationId: string,
    kind: ReportKind,
    period: AnalyticsPeriod,
  ): Promise<CompanyReportResponse> {
    return inFencedCompanyAdminRrSnapshot(this.pool, context, organizationId,
      "REPORTS_READ", async (transaction, authorizedOrgId) => {
      const report = await composeCompanyReportSnapshot(transaction, {
        kind,
        organizationId: authorizedOrgId,
        period,
      });
      return report;
    });
  }
}
