import { createHash } from "node:crypto";

import type { ReportExportRequest, ReportKind } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { AnalyticsPeriod } from "./analytics-period";
import { assertExportWithinBounds } from "./dashboard-overview-error";
import {
  renderReportCsv,
  type RenderedArtifact,
} from "./report-csv-renderer";
import { renderReportPdf } from "./report-pdf-renderer";
import { appendReportExportAuditEvent } from "./report-audit-writer";
import {
  composeReport,
  requireAuthorizedScope,
} from "./report-read-service";
import {
  resolveDailyPeriod,
  resolveMonthlyPeriod,
  resolveWeeklyPeriod,
} from "./report-period";

export interface ReportExportResult extends RenderedArtifact {
  readonly kind: ReportKind;
  readonly periodFrom: string;
  readonly periodTo: string;
}

const maximumGroupRows = 500;

function derivePeriod(request: ReportExportRequest): AnalyticsPeriod {
  switch (request.kind) {
    case "DAILY":
      return resolveDailyPeriod(request.date);
    case "WEEKLY":
      return resolveWeeklyPeriod(request.weekStart);
    case "MONTHLY":
      return resolveMonthlyPeriod(request.month);
  }
}

export async function generateReportExport(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    locationId: string;
    request: ReportExportRequest;
  },
): Promise<ReportExportResult> {
  const scope = await requireAuthorizedScope(
    pool,
    input.authenticatedUserId,
    input.locationId,
  );
  const period = derivePeriod(input.request);
  const report = await composeReport(pool, {
    authenticatedUserId: input.authenticatedUserId,
    includeDailyActivity: input.request.kind === "DAILY",
    locationId: input.locationId,
    period,
  });
  assertExportWithinBounds(
    report.summary.incidents.typeCounts.length <= maximumGroupRows &&
      report.summary.currencies.length <= maximumGroupRows,
  );
  const artifact =
    input.request.format === "CSV"
      ? renderReportCsv(
          report,
          input.request.kind,
          "CSV",
          period.from,
          period.to,
        )
      : await renderReportPdf(
          report,
          input.request.kind,
          period.from,
          period.to,
        );
  const contentSha256 = createHash("sha256")
    .update(artifact.bytes)
    .digest("hex");
  await inPostgresTransaction(pool, async (transaction) => {
    await appendReportExportAuditEvent(transaction, {
      contentLength: artifact.bytes.byteLength,
      contentSha256,
      format: input.request.format,
      kind: input.request.kind,
      locationId: scope.locationId,
      membershipId: scope.membershipId,
      organizationId: scope.organizationId,
      periodFrom: period.from,
      periodTo: period.to,
    });
  });
  return {
    bytes: artifact.bytes,
    contentType: artifact.contentType,
    filename: artifact.filename,
    kind: input.request.kind,
    periodFrom: period.from,
    periodTo: period.to,
  };
}
