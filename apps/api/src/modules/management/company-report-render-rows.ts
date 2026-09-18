import type { CompanyReportResponse } from "@valet/contracts";

export type CompanyReportRow = readonly [
  section: string,
  key: string,
  subkey: string,
  currency: string,
  value: string | null,
];

function durationRows(report: CompanyReportResponse): CompanyReportRow[] {
  const metrics = report.summary.operational.metrics;
  const entries = [
    ["CheckInTime", metrics.checkInTime],
    ["ParkingTime", metrics.parkingTime],
    ["RetrievalWait", metrics.retrievalWait],
    ["RetrievalStartLatencyAuxiliary", metrics.retrievalStartLatencyAuxiliary],
    ["HandoffTime", metrics.handoffTime],
  ] as const;
  return entries.flatMap(([key, metric]): CompanyReportRow[] => [
    ["DURATION", key, "sampleCount", "", String(metric.sampleCount)],
    ["DURATION", key, "averageSeconds", "", metric.averageSeconds ?? ""],
    [
      "DURATION",
      key,
      "contributingLocationCount",
      "",
      String(metric.contributingLocationCount),
    ],
  ]);
}

function coverageRows(report: CompanyReportResponse): CompanyReportRow[] {
  const coverage = report.summary.coverage;
  const rows: CompanyReportRow[] = [
    ["COVERAGE", "locations", "total", "", String(coverage.totalLocationCount)],
    ["COVERAGE", "locations", "active", "", String(coverage.activeLocationCount)],
    ["COVERAGE", "locations", "inactive", "", String(coverage.inactiveLocationCount)],
  ];
  for (const boundary of coverage.timezoneBoundaries) {
    rows.push(
      ["COVERAGE_TIMEZONE", boundary.timezone, "locationCount", "", String(boundary.locationCount)],
      ["COVERAGE_TIMEZONE", boundary.timezone, "activeLocationCount", "", String(boundary.activeLocationCount)],
      ["COVERAGE_TIMEZONE", boundary.timezone, "inactiveLocationCount", "", String(boundary.inactiveLocationCount)],
      ["COVERAGE_TIMEZONE", boundary.timezone, "periodStartUtc", "", boundary.periodStartUtc],
      ["COVERAGE_TIMEZONE", boundary.timezone, "periodEndUtc", "", boundary.periodEndUtc],
    );
  }
  return rows;
}

function financialRows(report: CompanyReportResponse): CompanyReportRow[] {
  const rows: CompanyReportRow[] = [];
  for (const group of report.summary.financial.currencies) {
    const currency = group.currency;
    rows.push(
      ["FINANCIAL_CURRENCY", currency, "paidPaymentCount", currency, String(group.paidPaymentCount)],
      ["FINANCIAL_CURRENCY", currency, "collectedAmountTotal", currency, group.collectedAmountTotal],
      ["FINANCIAL_CURRENCY", currency, "tipAmountTotal", currency, group.tipAmountTotal],
      ["FINANCIAL_CURRENCY", currency, "digitalPaymentRateNumerator", currency, String(group.digitalPaymentRate.numerator)],
      ["FINANCIAL_CURRENCY", currency, "digitalPaymentRateDenominator", currency, String(group.digitalPaymentRate.denominator)],
      ["FINANCIAL_CURRENCY", currency, "digitalPaymentRatePercentage", currency, group.digitalPaymentRate.percentage ?? ""],
      ["FINANCIAL_CURRENCY", currency, "succeededRefundAmountTotal", currency, group.succeededRefundAmountTotal],
      ["FINANCIAL_CURRENCY", currency, "validationRateNumerator", currency, String(group.validationRate.numerator)],
      ["FINANCIAL_CURRENCY", currency, "validationRateDenominator", currency, String(group.validationRate.denominator)],
      ["FINANCIAL_CURRENCY", currency, "validationRatePercentage", currency, group.validationRate.percentage ?? ""],
      ["FINANCIAL_CURRENCY", currency, "currentValidationAmountTotal", currency, group.currentValidationAmountTotal],
    );
  }
  for (const entry of report.summary.financial.cashReconciliation) {
    rows.push(
      ["CASH_RECONCILIATION", entry.currency, "cashExpectedTotal", entry.currency, entry.cashExpectedTotal],
      ["CASH_RECONCILIATION", entry.currency, "cashReportedTotal", entry.currency, entry.cashReportedTotal],
      ["CASH_RECONCILIATION", entry.currency, "cashVarianceTotal", entry.currency, entry.cashVarianceTotal],
    );
  }
  return rows;
}

function incidentRows(report: CompanyReportResponse): CompanyReportRow[] {
  const incidents = report.summary.incidents;
  const rows: CompanyReportRow[] = [
    ["INCIDENTS", "count", "", "", String(incidents.incidentCount)],
  ];
  for (const severity of incidents.severityCounts) {
    rows.push(["INCIDENTS_SEVERITY", severity.severity, "", "", String(severity.count)]);
  }
  for (const type of incidents.typeCounts) {
    rows.push(["INCIDENTS_TYPE", type.type, "", "", String(type.count)]);
  }
  rows.push(
    ["INCIDENTS", "per1000Numerator", "", "", String(incidents.incidentsPer1000.numerator)],
    ["INCIDENTS", "per1000Denominator", "", "", String(incidents.incidentsPer1000.denominator)],
    ["INCIDENTS", "per1000Value", "", "", incidents.incidentsPer1000.value ?? ""],
  );
  return rows;
}

function kpiRows(report: CompanyReportResponse): CompanyReportRow[] {
  const kpis = report.summary.kpis;
  const sla = kpis.slaCompliance;
  const workforce = kpis.carsPerActiveEmployee;
  const handoff = kpis.carsHandedOff;
  const rows: CompanyReportRow[] = [
    ["KPI_SLA", "requestCount", "", "", String(sla.requestCount)],
    ["KPI_SLA", "numerator", "", "", String(sla.numerator)],
    ["KPI_SLA", "denominator", "", "", String(sla.denominator)],
    ["KPI_SLA", "percentage", "", "", sla.percentage ?? ""],
    ["KPI_SLA", "missingTargetCount", "", "", String(sla.missingTargetCount)],
    ["KPI_SLA", "invalidOrMissingIntervalCount", "", "", String(sla.invalidOrMissingIntervalCount)],
    ["KPI_SLA", "contributingLocationCount", "", "", String(sla.contributingLocationCount)],
    ["KPI_CARS_PER_ACTIVE_EMPLOYEE", "numerator", "", "", String(workforce.numerator)],
    ["KPI_CARS_PER_ACTIVE_EMPLOYEE", "denominator", "", "", String(workforce.denominator)],
    ["KPI_CARS_PER_ACTIVE_EMPLOYEE", "value", "", "", workforce.value ?? ""],
    ["KPI_CARS_PER_ACTIVE_EMPLOYEE", "evidenceLocationCount", "", "", String(workforce.evidenceLocationCount)],
    ["KPI_CARS_HANDED_OFF", "attributedCount", "", "", String(handoff.attributedCount)],
    ["KPI_CARS_HANDED_OFF", "missingAttributionCount", "", "", String(handoff.missingAttributionCount)],
    ["KPI_CARS_HANDED_OFF", "distinctAttributedEmployeeCount", "", "", String(handoff.distinctAttributedEmployeeCount)],
    ["KPI_KEY_EXCEPTIONS", "count", "", "", String(kpis.keyExceptions.count)],
  ];
  for (const entry of kpis.keyExceptions.byType) {
    rows.push(["KPI_KEY_EXCEPTIONS", entry.type, "", "", String(entry.count)]);
  }
  return rows;
}

function dailyRows(report: CompanyReportResponse): CompanyReportRow[] {
  if (report.kind !== "DAILY") return [];
  const rows: CompanyReportRow[] = [
    ["DAILY_ACTIVITY", "retrievalRequestedCount", "", "", String(report.dailyActivity.retrievalRequestedCount)],
  ];
  for (const dispatch of report.dailyActivity.dispatchEventCounts) {
    rows.push(["DAILY_ACTIVITY", `dispatch:${dispatch.taskType}:${dispatch.eventType}`, "", "", String(dispatch.count)]);
  }
  for (const custody of report.dailyActivity.keyCustodyEventCounts) {
    rows.push(["DAILY_ACTIVITY", `custody:${custody.eventType}`, "", "", String(custody.count)]);
  }
  return rows;
}

export function companyReportRows(report: CompanyReportResponse): CompanyReportRow[] {
  const rows = [...coverageRows(report), ...durationRows(report)];
  for (const day of report.summary.operational.carsHandledPerDay) {
    rows.push(["CARS_PER_DAY", day.date, "", "", String(day.handledCount)]);
  }
  rows.push(...financialRows(report), ...incidentRows(report), ...kpiRows(report), ...dailyRows(report));
  return rows;
}
