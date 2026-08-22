import { PDFDocument, StandardFonts } from "pdf-lib";

import type { ReportKind } from "@valet/contracts";

import { DashboardOverviewError } from "./dashboard-overview-error";
import type { ComposedReport } from "./report-read-service";
import type { RenderedArtifact } from "./report-csv-renderer";

const maximumArtifactBytes = 5 * 1024 * 1024;

function line(
  document: Awaited<ReturnType<typeof PDFDocument.create>>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  page: ReturnType<(typeof document)["addPage"]>,
  text: string,
  y: number,
): number {
  // StandardFonts use WinAnsi encoding: strip C0 controls and anything
  // outside printable ASCII deterministically so bounded summary text is
  // always encodable.
  const safe = text.replace(/[^\x20-\x7E]/g, "");
  page.drawText(safe, { font, size: 10, x: 40, y });
  return y - 14;
}

export async function renderReportPdf(
  report: ComposedReport,
  kind: ReportKind,
  periodFrom: string,
  periodTo: string,
): Promise<RenderedArtifact> {
  const document = await PDFDocument.create();
  // Explicitly pin dynamic metadata so identical reports render identical
  // bytes (logical byte-determinism) instead of embedding render timestamps.
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
    y = line(document, font, page, text, y);
  };
  write(`VAYLET ${kind} REPORT`);
  write(`Period: ${periodFrom} .. ${periodTo}`);
  write("");
  const metrics: Array<[string, string]> = [
    ["CheckInTime samples", String(report.summary.metrics.checkInTime.sampleCount)],
    ["CheckInTime avgSeconds", report.summary.metrics.checkInTime.averageSeconds ?? ""],
    ["ParkingTime samples", String(report.summary.metrics.parkingTime.sampleCount)],
    ["ParkingTime avgSeconds", report.summary.metrics.parkingTime.averageSeconds ?? ""],
    ["RetrievalWait samples", String(report.summary.metrics.retrievalWait.sampleCount)],
    ["RetrievalWait avgSeconds", report.summary.metrics.retrievalWait.averageSeconds ?? ""],
    ["RetrievalStartLatencyAuxiliary samples", String(report.summary.metrics.retrievalStartLatencyAuxiliary.sampleCount)],
    ["RetrievalStartLatencyAuxiliary avgSeconds", report.summary.metrics.retrievalStartLatencyAuxiliary.averageSeconds ?? ""],
    ["HandoffTime samples", String(report.summary.metrics.handoffTime.sampleCount)],
    ["HandoffTime avgSeconds", report.summary.metrics.handoffTime.averageSeconds ?? ""],
  ];
  write("DURATIONS");
  for (const [label, value] of metrics) write(`  ${label}: ${value}`);
  write("CARS_PER_DAY");
  for (const day of report.summary.carsHandledPerDay) {
    write(`  ${day.date}: ${day.handledCount}`);
  }
  write("FINANCIAL_CURRENCY");
  for (const group of report.summary.currencies) {
    write(`  ${group.currency}:`);
    write(`    paidPaymentCount: ${group.paidPaymentCount}`);
    write(`    collectedAmountTotal: ${group.collectedAmountTotal}`);
    write(`    tipAmountTotal: ${group.tipAmountTotal}`);
    write(`    digitalPaymentRate: ${group.digitalPaymentRate.numerator}/${group.digitalPaymentRate.denominator} = ${group.digitalPaymentRate.percentage ?? ""}`);
    write(`    succeededRefundAmountTotal: ${group.succeededRefundAmountTotal}`);
    write(`    validationRate: ${group.validationRate.numerator}/${group.validationRate.denominator} = ${group.validationRate.percentage ?? ""}`);
    write(`    currentValidationAmountTotal: ${group.currentValidationAmountTotal}`);
  }
  write("CASH_RECONCILIATION");
  for (const entry of report.summary.cashReconciliation) {
    write(`  ${entry.currency}: expected=${entry.cashExpectedTotal} reported=${entry.cashReportedTotal} variance=${entry.cashVarianceTotal}`);
  }
  write("INCIDENTS");
  write(`  count: ${report.summary.incidents.incidentCount}`);
  for (const severity of report.summary.incidents.severityCounts) {
    write(`  severity:${severity.severity}: ${severity.count}`);
  }
  for (const type of report.summary.incidents.typeCounts) {
    write(`  type:${type.type}: ${type.count}`);
  }
  write(`  per1000Numerator: ${report.summary.incidents.incidentsPer1000.numerator}`);
  write(`  per1000Denominator: ${report.summary.incidents.incidentsPer1000.denominator}`);
  write(`  per1000Value: ${report.summary.incidents.incidentsPer1000.value ?? ""}`);
  if (report.dailyActivity !== null) {
    write("DAILY_ACTIVITY");
    write(`  retrievalRequestedCount: ${report.dailyActivity.retrievalRequestedCount}`);
    for (const dispatch of report.dailyActivity.dispatchEventCounts) {
      write(`  dispatch:${dispatch.taskType}:${dispatch.eventType}: ${dispatch.count}`);
    }
    for (const custody of report.dailyActivity.keyCustodyEventCounts) {
      write(`  custody:${custody.eventType}: ${custody.count}`);
    }
  }
  const bytes = await document.save();
  if (bytes.byteLength > maximumArtifactBytes) {
    throw new DashboardOverviewError("REPORT_EXPORT_TOO_LARGE");
  }
  return {
    bytes,
    contentType: "application/pdf",
    filename: `report-${kind.toLowerCase()}-${periodFrom}.pdf`,
  };
}
