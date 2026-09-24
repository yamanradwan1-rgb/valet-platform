import type {
  CompanyDailyReportResponse,
  CompanyPeriodicReportResponse,
  DailyReportResponse,
  PeriodicReportResponse,
  ReportKind,
} from "@valet/contracts";

import type { DashboardLocale } from "../../lib/i18n/locale";
import { reportsCopy } from "./reports-copy";

export type ReportSelector =
  | { readonly kind: "DAILY"; readonly date: string }
  | { readonly kind: "WEEKLY"; readonly weekStart: string }
  | { readonly kind: "MONTHLY"; readonly month: string };

export type ReportResponse =
  | DailyReportResponse
  | PeriodicReportResponse
  | CompanyDailyReportResponse
  | CompanyPeriodicReportResponse;

type LocationReport = DailyReportResponse | PeriodicReportResponse;
type CompanyReport = CompanyDailyReportResponse | CompanyPeriodicReportResponse;

export type ReportSelectorValidation =
  | { readonly kind: "required" }
  | { readonly kind: "invalid" }
  | { readonly kind: "valid"; readonly selector: ReportSelector };

export interface ReportPresentationRow {
  readonly label: string;
  readonly labelBidi?: "code" | "number";
  readonly value: string | null;
  readonly bidi?: "code" | "number";
}

export interface ReportPresentationSection {
  readonly title: string;
  readonly rows: readonly ReportPresentationRow[];
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const monthPattern = /^\d{4}-\d{2}$/;
const monthOffsets = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334] as const;

function exactDay(value: string): number | null {
  if (!datePattern.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined || year < 100) return null;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  const priorYear = year - 1;
  const beforeYear = priorYear * 365 + Math.floor(priorYear / 4)
    - Math.floor(priorYear / 100) + Math.floor(priorYear / 400);
  return beforeYear + monthOffsets[month - 1]! + (month > 2 && leap(year) ? 1 : 0) + day;
}

function leap(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return leap(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function validateReportSelector(kind: ReportKind, value: string): ReportSelectorValidation {
  if (!value) return { kind: "required" };
  if (kind === "MONTHLY") {
    if (!monthPattern.test(value)) return { kind: "invalid" };
    const [year, month] = value.split("-").map(Number);
    if (year === undefined || month === undefined || year < 100 || month < 1 || month > 12) {
      return { kind: "invalid" };
    }
    return { kind: "valid", selector: { kind, month: value } };
  }
  const ordinal = exactDay(value);
  if (ordinal === null) return { kind: "invalid" };
  if (kind === "WEEKLY") {
    if (ordinal % 7 !== 1) return { kind: "invalid" };
    return { kind: "valid", selector: { kind, weekStart: value } };
  }
  return { kind: "valid", selector: { kind, date: value } };
}

export function selectorValue(selector: ReportSelector): string {
  if (selector.kind === "DAILY") return selector.date;
  if (selector.kind === "WEEKLY") return selector.weekStart;
  return selector.month;
}

const durationKeys = [
  "checkInTime",
  "parkingTime",
  "retrievalWait",
  "retrievalStartLatencyAuxiliary",
  "handoffTime",
] as const;

export function reportPresentation(
  report: ReportResponse,
  locale: DashboardLocale,
): readonly ReportPresentationSection[] {
  const t = reportsCopy(locale);
  const company = isCompanyReport(report);
  const metadata: ReportPresentationSection = {
    title: t.metadata,
    rows: [
      company
        ? { label: t.organizationId, value: report.organizationId, bidi: "code" }
        : { label: t.locationId, value: report.locationId, bidi: "code" },
      ...(!company ? [{ label: t.timezone, value: report.timezone, bidi: "code" as const }] : []),
      { label: t.kind, value: report.kind, bidi: "code" },
      { label: t.periodFrom, value: report.periodFrom, bidi: "number" },
      { label: t.periodTo, value: report.periodTo, bidi: "number" },
    ],
  };
  return company
    ? [metadata, ...companySections(report, t)]
    : [metadata, ...locationSections(report, t)];
}

function locationSections(report: LocationReport, t: ReturnType<typeof reportsCopy>): ReportPresentationSection[] {
  const summary = report.summary;
  const sections: ReportPresentationSection[] = [{
    title: t.operations,
    rows: durationKeys.flatMap((key) => {
      const metric = summary.metrics[key];
      return [
        { label: `${key}.averageSeconds`, labelBidi: "code", value: metric.averageSeconds, bidi: "number" },
        { label: `${key}.sampleCount`, labelBidi: "code", value: String(metric.sampleCount), bidi: "number" },
      ] satisfies ReportPresentationRow[];
    }),
  }];
  sections.push(cohort(t.carsPerDay, summary.carsHandledPerDay.map((day) => ({
    label: day.date,
    labelBidi: "number" as const,
    value: String(day.handledCount),
    bidi: "number" as const,
  })), t.emptyCohort));
  sections.push(cohort(t.finance, summary.currencies.flatMap((group) => currencyRows(group)), t.emptyCohort));
  sections.push(cohort(t.cash, summary.cashReconciliation.flatMap((entry) => [
    { label: `${entry.currency}.cashExpectedTotal`, labelBidi: "code" as const, value: entry.cashExpectedTotal, bidi: "number" as const },
    { label: `${entry.currency}.cashReportedTotal`, labelBidi: "code" as const, value: entry.cashReportedTotal, bidi: "number" as const },
    { label: `${entry.currency}.cashVarianceTotal`, labelBidi: "code" as const, value: entry.cashVarianceTotal, bidi: "number" as const },
  ]), t.emptyCohort));
  sections.push(incidentSection(summary.incidents, t.incidents, t.emptyCohort));
  if ("dailyActivity" in report) sections.push(dailySection(report.dailyActivity, t.dailyActivity, t.emptyCohort));
  return sections;
}

function companySections(report: CompanyReport, t: ReturnType<typeof reportsCopy>): ReportPresentationSection[] {
  const summary = report.summary;
  const sections: ReportPresentationSection[] = [
    companyCoverage(report, t.emptyCohort, t.coverage),
    {
      title: t.operations,
      rows: durationKeys.flatMap((key) => {
        const metric = summary.operational.metrics[key];
        return [
          { label: `${key}.averageSeconds`, labelBidi: "code" as const, value: metric.averageSeconds, bidi: "number" as const },
          { label: `${key}.sampleCount`, labelBidi: "code" as const, value: String(metric.sampleCount), bidi: "number" as const },
          { label: `${key}.contributingLocationCount`, labelBidi: "code" as const, value: String(metric.contributingLocationCount), bidi: "number" as const },
        ];
      }),
    },
  ];
  sections.push(cohort(t.carsPerDay, summary.operational.carsHandledPerDay.map((day) => ({
    label: day.date,
    labelBidi: "number" as const,
    value: String(day.handledCount),
    bidi: "number" as const,
  })), t.emptyCohort));
  sections.push(cohort(t.finance, summary.financial.currencies.flatMap((group) => currencyRows(group)), t.emptyCohort));
  sections.push(cohort(t.cash, summary.financial.cashReconciliation.flatMap((entry) => [
    { label: `${entry.currency}.cashExpectedTotal`, labelBidi: "code" as const, value: entry.cashExpectedTotal, bidi: "number" as const },
    { label: `${entry.currency}.cashReportedTotal`, labelBidi: "code" as const, value: entry.cashReportedTotal, bidi: "number" as const },
    { label: `${entry.currency}.cashVarianceTotal`, labelBidi: "code" as const, value: entry.cashVarianceTotal, bidi: "number" as const },
  ]), t.emptyCohort));
  sections.push(incidentSection(summary.incidents, t.incidents, t.emptyCohort));
  sections.push(companyKpis(report, t.kpis));
  if ("dailyActivity" in report) sections.push(dailySection(report.dailyActivity, t.dailyActivity, t.emptyCohort));
  return sections;
}

function cohort(title: string, rows: readonly ReportPresentationRow[], empty: string): ReportPresentationSection {
  return { title, rows: rows.length ? rows : [{ label: empty, value: "" }] };
}

function currencyRows(group: { currency: string; paidPaymentCount: number; collectedAmountTotal: string; tipAmountTotal: string; digitalPaymentRate: { numerator: number; denominator: number; percentage: string | null }; succeededRefundAmountTotal: string; validationRate: { numerator: number; denominator: number; percentage: string | null }; currentValidationAmountTotal: string }): ReportPresentationRow[] {
  const c = group.currency;
  return [
    { label: `${c}.paidPaymentCount`, labelBidi: "code", value: String(group.paidPaymentCount), bidi: "number" },
    { label: `${c}.collectedAmountTotal`, labelBidi: "code", value: group.collectedAmountTotal, bidi: "number" },
    { label: `${c}.tipAmountTotal`, labelBidi: "code", value: group.tipAmountTotal, bidi: "number" },
    { label: `${c}.digitalPaymentRate.numerator`, labelBidi: "code", value: String(group.digitalPaymentRate.numerator), bidi: "number" },
    { label: `${c}.digitalPaymentRate.denominator`, labelBidi: "code", value: String(group.digitalPaymentRate.denominator), bidi: "number" },
    { label: `${c}.digitalPaymentRate.percentage`, labelBidi: "code", value: group.digitalPaymentRate.percentage, bidi: "number" },
    { label: `${c}.succeededRefundAmountTotal`, labelBidi: "code", value: group.succeededRefundAmountTotal, bidi: "number" },
    { label: `${c}.validationRate.numerator`, labelBidi: "code", value: String(group.validationRate.numerator), bidi: "number" },
    { label: `${c}.validationRate.denominator`, labelBidi: "code", value: String(group.validationRate.denominator), bidi: "number" },
    { label: `${c}.validationRate.percentage`, labelBidi: "code", value: group.validationRate.percentage, bidi: "number" },
    { label: `${c}.currentValidationAmountTotal`, labelBidi: "code", value: group.currentValidationAmountTotal, bidi: "number" },
  ];
}

function incidentSection(incidents: ReportResponse["summary"]["incidents"], title: string, empty: string): ReportPresentationSection {
  return { title, rows: [
    { label: "incidentCount", labelBidi: "code", value: String(incidents.incidentCount), bidi: "number" },
    { label: "incidentsPer1000.numerator", labelBidi: "code", value: String(incidents.incidentsPer1000.numerator), bidi: "number" },
    { label: "incidentsPer1000.denominator", labelBidi: "code", value: String(incidents.incidentsPer1000.denominator), bidi: "number" },
    { label: "incidentsPer1000.value", labelBidi: "code", value: incidents.incidentsPer1000.value, bidi: "number" },
    ...(incidents.severityCounts.length ? incidents.severityCounts.map((row) => ({ label: `severity.${row.severity}`, labelBidi: "code" as const, value: String(row.count), bidi: "number" as const })) : [{ label: empty, value: "" }]),
    ...incidents.typeCounts.map((row) => ({ label: `type.${row.type}`, labelBidi: "code" as const, value: String(row.count), bidi: "number" as const })),
  ] };
}

function companyCoverage(report: CompanyDailyReportResponse | CompanyPeriodicReportResponse, empty: string, title: string): ReportPresentationSection {
  const coverage = report.summary.coverage;
  const rows: ReportPresentationRow[] = [
    { label: "totalLocationCount", labelBidi: "code", value: String(coverage.totalLocationCount), bidi: "number" },
    { label: "activeLocationCount", labelBidi: "code", value: String(coverage.activeLocationCount), bidi: "number" },
    { label: "inactiveLocationCount", labelBidi: "code", value: String(coverage.inactiveLocationCount), bidi: "number" },
  ];
  for (const zone of coverage.timezoneBoundaries) rows.push(
    { label: `${zone.timezone}.locationCount`, labelBidi: "code", value: String(zone.locationCount), bidi: "number" },
    { label: `${zone.timezone}.activeLocationCount`, labelBidi: "code", value: String(zone.activeLocationCount), bidi: "number" },
    { label: `${zone.timezone}.inactiveLocationCount`, labelBidi: "code", value: String(zone.inactiveLocationCount), bidi: "number" },
    { label: `${zone.timezone}.periodStartUtc`, labelBidi: "code", value: zone.periodStartUtc, bidi: "code" },
    { label: `${zone.timezone}.periodEndUtc`, labelBidi: "code", value: zone.periodEndUtc, bidi: "code" },
  );
  if (!coverage.timezoneBoundaries.length) rows.push({ label: empty, value: "" });
  return { title, rows };
}

function companyKpis(report: CompanyDailyReportResponse | CompanyPeriodicReportResponse, title: string): ReportPresentationSection {
  const k = report.summary.kpis;
  return { title, rows: [
    ...Object.entries(k.slaCompliance).map(([key, value]) => ({ label: `slaCompliance.${key}`, labelBidi: "code" as const, value: value === null ? null : String(value), bidi: "number" as const })),
    ...Object.entries(k.carsPerActiveEmployee).map(([key, value]) => ({ label: `carsPerActiveEmployee.${key}`, labelBidi: "code" as const, value: value === null ? null : String(value), bidi: "number" as const })),
    ...Object.entries(k.carsHandedOff).map(([key, value]) => ({ label: `carsHandedOff.${key}`, labelBidi: "code" as const, value: String(value), bidi: "number" as const })),
    { label: "keyExceptions.count", labelBidi: "code", value: String(k.keyExceptions.count), bidi: "number" },
    ...k.keyExceptions.byType.map((entry) => ({ label: `keyExceptions.${entry.type}`, labelBidi: "code" as const, value: String(entry.count), bidi: "number" as const })),
  ] };
}

function dailySection(a: DailyReportResponse["dailyActivity"], title: string, empty: string): ReportPresentationSection {
  return { title, rows: [
    { label: "retrievalRequestedCount", labelBidi: "code", value: String(a.retrievalRequestedCount), bidi: "number" },
    ...(a.dispatchEventCounts.length ? a.dispatchEventCounts.map((row) => ({ label: `dispatch.${row.taskType}.${row.eventType}`, labelBidi: "code" as const, value: String(row.count), bidi: "number" as const })) : [{ label: empty, value: "" }]),
    ...a.keyCustodyEventCounts.map((row) => ({ label: `keyCustody.${row.eventType}`, labelBidi: "code" as const, value: String(row.count), bidi: "number" as const })),
  ] };
}

function isCompanyReport(report: ReportResponse): report is CompanyReport {
  return "organizationId" in report;
}
