import { PDFDocument, StandardFonts } from "pdf-lib";

import type { CompanyReportResponse, ReportKind } from "@valet/contracts";

import {
  pdfSafeText,
  reportArtifactWithinLimit,
  type RenderedArtifact,
} from "../reporting/report-render-hardening";
import { DashboardOverviewError } from "../dashboard/dashboard-overview-error";
import { companyReportRows } from "./company-report-render-rows";

export async function renderCompanyReportPdf(
  report: CompanyReportResponse,
  kind: ReportKind,
  periodFrom: string,
  periodTo: string,
): Promise<RenderedArtifact> {
  const document = await PDFDocument.create();
  const fixedMetadataDate = new Date(0);
  document.setCreationDate(fixedMetadataDate);
  document.setModificationDate(fixedMetadataDate);
  document.setProducer("VAYLET Dashboard");
  document.setCreator("VAYLET Dashboard");
  const font = await document.embedFont(StandardFonts.Helvetica);
  let page = document.addPage([595, 842]);
  let y = 800;
  const write = (text: string) => {
    if (y < 40) {
      page = document.addPage([595, 842]);
      y = 800;
    }
    page.drawText(pdfSafeText(text), { font, size: 10, x: 40, y });
    y -= 14;
  };
  write(`VAYLET COMPANY ${kind} REPORT`);
  write(`Period: ${periodFrom} .. ${periodTo}`);
  write("");
  write("section | key | subkey | currency | value");
  for (const row of companyReportRows(report)) {
    write(row.map((cell) => cell ?? "").join(" | "));
  }
  const bytes = await document.save();
  if (!reportArtifactWithinLimit(bytes)) {
    throw new DashboardOverviewError("REPORT_EXPORT_TOO_LARGE");
  }
  return {
    bytes,
    contentType: "application/pdf",
    filename: `company-report-${kind.toLowerCase()}-${periodFrom}.pdf`,
  };
}
