import type { CompanyReportResponse, ReportKind } from "@valet/contracts";

import {
  csvCell,
  reportArtifactWithinLimit,
  type RenderedArtifact,
} from "../reporting/report-render-hardening";
import { DashboardOverviewError } from "../dashboard/dashboard-overview-error";
import { companyReportRows } from "./company-report-render-rows";

export function renderCompanyReportCsv(
  report: CompanyReportResponse,
  kind: ReportKind,
  periodFrom: string,
): RenderedArtifact {
  const lines = ["section,key,subkey,currency,value"];
  for (const row of companyReportRows(report)) {
    lines.push(row.map((cell) => csvCell(cell ?? "")).join(","));
  }
  const bytes = new TextEncoder().encode(`${lines.join("\r\n")}\r\n`);
  if (!reportArtifactWithinLimit(bytes)) {
    throw new DashboardOverviewError("REPORT_EXPORT_TOO_LARGE");
  }
  return {
    bytes,
    contentType: "text/csv; charset=utf-8",
    filename: `company-report-${kind.toLowerCase()}-${periodFrom}.csv`,
  };
}
