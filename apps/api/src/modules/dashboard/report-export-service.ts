import { createHash } from "node:crypto";

import type { ReportExportRequest } from "@valet/contracts";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { AnalyticsPeriod } from "./analytics-period";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
  assertExportWithinBounds,
  DashboardOverviewError,
} from "./dashboard-overview-error";
import { authorizeDashboardReadLocation } from "./dashboard-read-authorization";
import { renderReportCsv, type RenderedArtifact } from "./report-csv-renderer";
import { renderReportPdf } from "./report-pdf-renderer";
import { appendReportExportAuditEvent } from "./report-audit-writer";
import { composeReport, requireAuthorizedScope } from "./report-read-service";
import {
  resolveDailyPeriod,
  resolveMonthlyPeriod,
  resolveWeeklyPeriod,
} from "./report-period";

export interface ReportExportResult extends RenderedArtifact {
  readonly kind: ReportExportRequest["kind"];
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
    staffSessionContext?: StaffSessionContext;
    locationId: string;
    renderedPeriodFrom: string;
    renderedPeriodTo: string;
    request: ReportExportRequest;
  },
): Promise<ReportExportResult> {
  const freshScope = await authorizeDashboardReadLocation(transaction, {
    authenticatedUserId: input.authenticatedUserId,
    capability: "REPORT_EXPORT",
    ...(input.staffSessionContext === undefined
      ? {}
      : { staffSessionContext: input.staffSessionContext }),
    targetLocationId: input.locationId,
  });
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
    kind: input.request.kind,
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
    filename: `report-${input.request.kind.toLowerCase()}-${input.renderedPeriodFrom}.${input.artifact.format.toLowerCase()}`,
    kind: input.request.kind,
    periodFrom: input.renderedPeriodFrom,
    periodTo: input.renderedPeriodTo,
  };
}

export async function generateReportExport(
  pool: PostgresPool,
  input: {
    authenticatedUserId: string;
    staffSessionContext?: StaffSessionContext;
    locationId: string;
    request: ReportExportRequest;
  },
): Promise<ReportExportResult> {
  // Fail-fast pre-render authorization/composition boundary.
  const scope = await requireAuthorizedScope(
    pool,
    input.authenticatedUserId,
    input.locationId,
    input.staffSessionContext,
    "REPORT_EXPORT",
    false,
  );
  const period = derivePeriod(input.request);
  const report = await composeReport(pool, {
    authenticatedUserId: input.authenticatedUserId,
    ...(input.staffSessionContext === undefined
      ? {}
      : { staffSessionContext: input.staffSessionContext }),
    includeDailyActivity: input.request.kind === "DAILY",
    locationId: input.locationId,
    recordManagementActivity: false,
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
      ...(input.staffSessionContext === undefined
        ? {}
        : { staffSessionContext: input.staffSessionContext }),
      locationId: input.locationId,
      renderedPeriodFrom: period.from,
      renderedPeriodTo: period.to,
      request: input.request,
    }),
  );
}
