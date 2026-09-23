import {
  reportExportRequestSchema,
  type ReportExportRequest,
} from "@valet/contracts";

import type {
  DashboardApiClient,
  DashboardBinaryResponse,
} from "../../lib/api/dashboard-api-client";
import type { IntelligenceScope } from "./intelligence-scope";
import type { ReportSelector } from "./reports-presentation";

export function reportExportRequest(
  selector: ReportSelector,
  format: ReportExportRequest["format"],
): ReportExportRequest {
  if (selector.kind === "DAILY") return { kind: "DAILY", format, date: selector.date };
  if (selector.kind === "WEEKLY") {
    return { kind: "WEEKLY", format, weekStart: selector.weekStart };
  }
  return { kind: "MONTHLY", format, month: selector.month };
}

export function exportReportArtifact(
  api: DashboardApiClient,
  scope: IntelligenceScope,
  request: ReportExportRequest,
  signal?: AbortSignal,
): Promise<DashboardBinaryResponse> {
  const body = reportExportRequestSchema.parse(request);
  const expectedContentType = body.format === "CSV"
    ? "text/csv; charset=utf-8"
    : "application/pdf";
  const path = scope.kind === "COMPANY"
    ? `/v1/staff/management/organizations/${encodeURIComponent(scope.organizationId)}/reports/exports`
    : `/v1/staff/dashboard/locations/${encodeURIComponent(scope.locationId)}/reports/exports`;
  return api.requestBinary(path, { body, expectedContentType, signal });
}
