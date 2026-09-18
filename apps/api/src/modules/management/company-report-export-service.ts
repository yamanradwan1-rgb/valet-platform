import { createHash, randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type {
  CompanyReportExportRequest,
  CompanyReportResponse,
} from "@valet/contracts";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { appendOrganizationAuditEvent } from "../audit/organization-audit-writer";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import { DashboardOverviewError } from "../dashboard/dashboard-overview-error";
import {
  resolveDailyPeriod,
  resolveMonthlyPeriod,
  resolveWeeklyPeriod,
} from "../dashboard/report-period";
import type { RenderedArtifact } from "../reporting/report-render-hardening";
import { renderCompanyReportCsv } from "./company-report-csv-renderer";
import { renderCompanyReportPdf } from "./company-report-pdf-renderer";
import { composeCompanyReportSnapshot } from "./company-report-read-service";
import { authorizeCompanyAdminManagement } from "./management-authorization";

const maximumGroupRows = 500;
const auditMetadataKeys = [
  "contentLength",
  "contentSha256",
  "format",
  "periodFrom",
  "periodTo",
  "reportKind",
] as const;

function derivePeriod(request: CompanyReportExportRequest) {
  switch (request.kind) {
    case "DAILY":
      return resolveDailyPeriod(request.date);
    case "WEEKLY":
      return resolveWeeklyPeriod(request.weekStart);
    case "MONTHLY":
      return resolveMonthlyPeriod(request.month);
  }
}

function assertCompanyExportGroups(report: CompanyReportResponse): void {
  const summary = report.summary;
  const dailyGroups =
    report.kind === "DAILY"
      ? report.dailyActivity.dispatchEventCounts.length <= 16 &&
        report.dailyActivity.keyCustodyEventCounts.length <= 5
      : true;
  if (
    summary.coverage.timezoneBoundaries.length > maximumGroupRows ||
    summary.financial.currencies.length > maximumGroupRows ||
    summary.financial.cashReconciliation.length > maximumGroupRows ||
    summary.incidents.typeCounts.length > maximumGroupRows ||
    !dailyGroups
  ) {
    throw new DashboardOverviewError("REPORT_EXPORT_TOO_LARGE");
  }
}

export async function finalizeCompanyReportExport(
  transaction: PostgresTransaction,
  input: {
    readonly artifact: RenderedArtifact;
    readonly context: StaffSessionContext;
    readonly organizationId: string;
    readonly renderedPeriodFrom: string;
    readonly renderedPeriodTo: string;
    readonly request: CompanyReportExportRequest;
  },
): Promise<void> {
  const freshScope = await authorizeCompanyAdminManagement(transaction, input.context, {
    capability: "REPORT_EXPORT",
    organizationId: input.organizationId,
  });
  const freshPeriod = derivePeriod(input.request);
  if (
    freshPeriod.from !== input.renderedPeriodFrom ||
    freshPeriod.to !== input.renderedPeriodTo
  ) {
    throw new DashboardOverviewError("AUTHORIZATION_DENIED");
  }
  const contentSha256 = createHash("sha256").update(input.artifact.bytes).digest("hex");
  const clock = await transaction.query<{ readonly now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  const occurredAt = clock.rows[0]?.now;
  if (occurredAt === undefined) throw new Error("Company export audit clock is missing.");
  await appendOrganizationAuditEvent(transaction, {
    actor: { type: "MEMBERSHIP", membershipId: freshScope.membershipId },
    allowedMetadataKeys: auditMetadataKeys,
    entityId: freshScope.organizationId,
    entityType: "Organization",
    eventId: randomUUID(),
    eventType: "DASHBOARD_REPORT_EXPORT_GENERATED",
    metadata: {
      contentLength: input.artifact.bytes.byteLength,
      contentSha256,
      format: input.request.format,
      periodFrom: freshPeriod.from,
      periodTo: freshPeriod.to,
      reportKind: input.request.kind,
    },
    occurredAt,
    organizationId: freshScope.organizationId,
  });
  await recordAdminActivityInTransaction(transaction, input.context);
}

@Injectable()
export class ManagementCompanyReportExportService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  async generate(
    context: StaffSessionContext,
    organizationId: string,
    request: CompanyReportExportRequest,
  ): Promise<RenderedArtifact> {
    const period = derivePeriod(request);
    const report = await inPostgresTransaction(this.pool, async (transaction) => {
      await transaction.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const scope = await authorizeCompanyAdminManagement(transaction, context, {
        capability: "REPORT_EXPORT",
        organizationId,
      });
      const snapshot = await composeCompanyReportSnapshot(transaction, {
        kind: request.kind,
        organizationId: scope.organizationId,
        period,
      });
      assertCompanyExportGroups(snapshot);
      return snapshot;
    });

    const artifact =
      request.format === "CSV"
        ? renderCompanyReportCsv(report, request.kind, period.from)
        : await renderCompanyReportPdf(report, request.kind, period.from, period.to);

    await inPostgresTransaction(this.pool, async (transaction) =>
      finalizeCompanyReportExport(transaction, {
        artifact,
        context,
        organizationId,
        renderedPeriodFrom: period.from,
        renderedPeriodTo: period.to,
        request,
      }),
    );
    return artifact;
  }
}
