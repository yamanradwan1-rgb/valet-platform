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
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { AnalyticsPeriod } from "../dashboard/analytics-period";
import { composeCompanyAnalyticsSources } from "./company-analytics-source";
import { queryCompanyDailyActivity } from "./company-report-daily-activity-query";
import { authorizeCompanyAdminManagement } from "./management-authorization";

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
    return inPostgresTransaction(this.pool, async (transaction) => {
      await transaction.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const scope = await authorizeCompanyAdminManagement(transaction, context, {
        capability: "REPORTS_READ",
        organizationId,
      });
      const report = await composeCompanyReportSnapshot(transaction, {
        kind,
        organizationId: scope.organizationId,
        period,
      });
      await recordAdminActivityInTransaction(transaction, context);
      return report;
    });
  }
}
