import type {
  ExportFormat,
  ReportKind,
} from "@valet/contracts";

import {
  csvCell,
  reportArtifactWithinLimit,
  type RenderedArtifact,
} from "../reporting/report-render-hardening";
import { DashboardOverviewError } from "./dashboard-overview-error";
import type { ComposedReport } from "./report-read-service";

export type { RenderedArtifact } from "../reporting/report-render-hardening";

type Row = readonly [
  section: string,
  key: string,
  subkey: string,
  currency: string,
  value: string | null,
];

function durationRows(summary: ComposedReport["summary"]): Row[] {
  const entries: Array<[string, { averageSeconds: string | null; sampleCount: number }]> =
    [
      ["CheckInTime", summary.metrics.checkInTime],
      ["ParkingTime", summary.metrics.parkingTime],
      ["RetrievalWait", summary.metrics.retrievalWait],
      [
        "RetrievalStartLatencyAuxiliary",
        summary.metrics.retrievalStartLatencyAuxiliary,
      ],
      ["HandoffTime", summary.metrics.handoffTime],
    ];
  return entries.flatMap(([key, metric]): Row[] => [
    ["DURATION", key, "sampleCount", "", String(metric.sampleCount)],
    ["DURATION", key, "averageSeconds", "", metric.averageSeconds ?? ""],
  ]);
}

function reportRows(report: ComposedReport): Row[] {
  const rows: Row[] = [...durationRows(report.summary)];
  for (const day of report.summary.carsHandledPerDay) {
    rows.push(["CARS_PER_DAY", day.date, "", "", String(day.handledCount)]);
  }
  for (const group of report.summary.currencies) {
    rows.push(
      ["FINANCIAL_CURRENCY", group.currency, "paidPaymentCount", group.currency, String(group.paidPaymentCount)],
      ["FINANCIAL_CURRENCY", group.currency, "collectedAmountTotal", group.currency, group.collectedAmountTotal],
      ["FINANCIAL_CURRENCY", group.currency, "tipAmountTotal", group.currency, group.tipAmountTotal],
      ["FINANCIAL_CURRENCY", group.currency, "digitalPaymentRateNumerator", group.currency, String(group.digitalPaymentRate.numerator)],
      ["FINANCIAL_CURRENCY", group.currency, "digitalPaymentRateDenominator", group.currency, String(group.digitalPaymentRate.denominator)],
      ["FINANCIAL_CURRENCY", group.currency, "digitalPaymentRatePercentage", group.currency, group.digitalPaymentRate.percentage ?? ""],
      ["FINANCIAL_CURRENCY", group.currency, "succeededRefundAmountTotal", group.currency, group.succeededRefundAmountTotal],
      ["FINANCIAL_CURRENCY", group.currency, "validationRateNumerator", group.currency, String(group.validationRate.numerator)],
      ["FINANCIAL_CURRENCY", group.currency, "validationRateDenominator", group.currency, String(group.validationRate.denominator)],
      ["FINANCIAL_CURRENCY", group.currency, "validationRatePercentage", group.currency, group.validationRate.percentage ?? ""],
      ["FINANCIAL_CURRENCY", group.currency, "currentValidationAmountTotal", group.currency, group.currentValidationAmountTotal],
    );
  }
  for (const entry of report.summary.cashReconciliation) {
    rows.push(
      ["CASH_RECONCILIATION", entry.currency, "cashExpectedTotal", entry.currency, entry.cashExpectedTotal],
      ["CASH_RECONCILIATION", entry.currency, "cashReportedTotal", entry.currency, entry.cashReportedTotal],
      ["CASH_RECONCILIATION", entry.currency, "cashVarianceTotal", entry.currency, entry.cashVarianceTotal],
    );
  }
  rows.push(["INCIDENTS", "count", "", "", String(report.summary.incidents.incidentCount)]);
  for (const severity of report.summary.incidents.severityCounts) {
    rows.push(["INCIDENTS_SEVERITY", severity.severity, "", "", String(severity.count)]);
  }
  // Free-text persisted values lead their own cell so injection hardening
  // applies visibly at the cell boundary.
  for (const type of report.summary.incidents.typeCounts) {
    rows.push(["INCIDENTS_TYPE", type.type, "", "", String(type.count)]);
  }
  rows.push(
    ["INCIDENTS", "per1000Numerator", "", "", String(report.summary.incidents.incidentsPer1000.numerator)],
    ["INCIDENTS", "per1000Denominator", "", "", String(report.summary.incidents.incidentsPer1000.denominator)],
    ["INCIDENTS", "per1000Value", "", "", report.summary.incidents.incidentsPer1000.value ?? ""],
  );
  if (report.dailyActivity !== null) {
    rows.push([
      "DAILY_ACTIVITY",
      "retrievalRequestedCount",
      "",
      "",
      String(report.dailyActivity.retrievalRequestedCount),
    ]);
    for (const dispatch of report.dailyActivity.dispatchEventCounts) {
      rows.push([
        "DAILY_ACTIVITY",
        `dispatch:${dispatch.taskType}:${dispatch.eventType}`,
        "",
        "",
        String(dispatch.count),
      ]);
    }
    for (const custody of report.dailyActivity.keyCustodyEventCounts) {
      rows.push([
        "DAILY_ACTIVITY",
        `custody:${custody.eventType}`,
        "",
        "",
        String(custody.count),
      ]);
    }
  }
  return rows;
}

export function renderReportCsv(
  report: ComposedReport,
  kind: ReportKind,
  format: Extract<ExportFormat, "CSV">,
  periodFrom: string,
  _periodTo: string,
): RenderedArtifact {
  void format;
  void _periodTo;
  const lines = ["section,key,subkey,currency,value"];
  for (const row of reportRows(report)) {
    lines.push(row.map((cell) => csvCell(cell ?? "")).join(","));
  }
  const bytes = new TextEncoder().encode(`${lines.join("\r\n")}\r\n`);
  if (!reportArtifactWithinLimit(bytes)) {
    throw new DashboardOverviewError("REPORT_EXPORT_TOO_LARGE");
  }
  return {
    bytes,
    contentType: "text/csv; charset=utf-8",
    filename: `report-${kind.toLowerCase()}-${periodFrom}.csv`,
  };
}
