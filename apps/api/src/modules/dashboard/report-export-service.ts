import { createHash } from "node:crypto";

import type {
  ReportExportRequest,
  ReportKind,
} from "@valet/contracts";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { AnalyticsPeriod } from "./analytics-period";
import {
  assertExportWithinBounds,
  DashboardOverviewError,
} from "./dashboard-overview-error";
import { authorizeDashboardLocation } from "./dashboard-location-authorization";
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

/**
 * Final authorized audit transaction boundary for a rendered artifact.
 * Runs on the caller-provided transaction client: re-derives exact-Location
 * authorization against THIS transaction so a revocation between pre-render
 * checks and audit fails closed with zero AuditEvents, re-derives the
 * accepted request period to prove it matches the rendered artifact, and
 * writes the single export AuditEvent using the fresh transaction-derived
 * scope.
 */
export async function finalizeAuditedExport(
  transaction: PostgresTransaction,
  input: {
    artifact: Pick<RenderedArtifact, "bytes"> & { format: "CSV" | "PDF" };
    authenticatedUserId: string;
    kind: ReportKind;
    locationId: string;
    renderedPeriodFrom: string;
    renderedPeriodTo: string;
    request: ReportExportRequest;
  },
): Promise<ReportExportResult> {
  const freshScope = await authorizeDashboardLocation(
    transaction,
    input.authenticatedUserId,
    input.locationId,
  );
  if (freshScope === null) {
    throw new DashboardOverviewError("AUTHORIZATION_DENIED");
  }
  const freshPeriod = derivePeriod(input.request);
  if (
    freshPeriod.from !== input.renderedPeriodFrom ||
    freshPeriod.to !== input.renderedPeriodTo
  ) {
    throw new DashboardOverviewError("AUTHORIZATION_DENIED");
  }
  const contentSha256 = createHash("sha256")
    .update(input.artifact.bytes)
    .digest("hex");
  await appendReportExportAuditEvent(transaction, {
    contentLength: input.artifact.bytes.byteLength,
    contentSha256,
    format: input.artifact.format,
    kind: input.kind,
    locationId: freshScope.locationId,
    membershipId: freshScope.membershipId,
    organizationId: freshScope.organizationId,
    periodFrom: freshPeriod.from,
    periodTo: freshPeriod.to,
  });
  return {
    bytes: input.artifact.bytes,
    contentType:
      input.artifact.format === "CSV"
        ? "text/csv; charset=utf-8"
        : "application/pdf",
    filename: `report-${input.kind.toLowerCase()}-${input.renderedPeriodFrom}.${
      input.artifact.format.toLowerCase()
    }`,
    kind: input.kind,
    periodFrom: input.renderedPeriodFrom,
    periodTo: input.renderedPeriodTo,
  };
}

export async function generateReportExport(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    locationId: string;
    request: ReportExportRequest;
  },
): Promise<ReportExportResult> {
  // Fail-fast pre-render authorization/composition boundary.
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
  void scope.membershipId;
  // Final audited transaction re-derives authorization and scope.
  return inPostgresTransaction(pool, async (transaction) =>
    finalizeAuditedExport(transaction, {
      artifact: { bytes: artifact.bytes, format: input.request.format },
      authenticatedUserId: input.authenticatedUserId,
      kind: input.request.kind,
      locationId: input.locationId,
      renderedPeriodFrom: period.from,
      renderedPeriodTo: period.to,
      request: input.request,
    }),
  );
}
