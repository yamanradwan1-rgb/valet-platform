import type {
  CompanyAnalyticsResponse,
  FinancialAnalyticsResponse,
  IncidentAnalyticsResponse,
  LocationKpiAnalyticsResponse,
  OperationalAnalyticsResponse,
} from "@valet/contracts";
import { useSyncExternalStore } from "react";

const periodChangedEvent = "md05:period-changed";

export type RawAnalyticsPeriod = {
  readonly from: string | null;
  readonly to: string | null;
};

export type AnalyticsDurationKey =
  | "checkInTime"
  | "parkingTime"
  | "retrievalWait"
  | "retrievalStartLatencyAuxiliary"
  | "handoffTime";

export interface AnalyticsDurationPresentation {
  readonly key: AnalyticsDurationKey;
  readonly averageSeconds: string | null;
  readonly sampleCount: number;
  readonly contributingLocationCount: number | null;
}

type CompanySummary = CompanyAnalyticsResponse["summary"];
type CompanySla = CompanySummary["kpis"]["slaCompliance"];
type CompanyCarsPerEmployee = CompanySummary["kpis"]["carsPerActiveEmployee"];
export interface AnalyticsHandoffPresentation {
  readonly attributedCount: number;
  readonly missingAttributionCount: number;
  readonly employeeEvidenceCount: number;
  readonly truncated: boolean;
}

export interface AnalyticsPresentation {
  readonly mode: "COMPANY" | "LOCATION";
  readonly activity: OperationalAnalyticsResponse["carsHandledPerDay"];
  readonly durations: readonly AnalyticsDurationPresentation[];
  readonly financial: Pick<FinancialAnalyticsResponse, "currencies" | "cashReconciliation">;
  readonly incidents: Omit<IncidentAnalyticsResponse, "locationId" | "timezone" | "from" | "to">;
  readonly slaCompliance: LocationKpiAnalyticsResponse["slaCompliance"] | CompanySla;
  readonly carsPerActiveEmployee:
    | LocationKpiAnalyticsResponse["carsPerActiveEmployee"]
    | CompanyCarsPerEmployee;
  readonly handoff: AnalyticsHandoffPresentation;
  readonly keyExceptions: LocationKpiAnalyticsResponse["keyExceptions"];
  readonly coverage: CompanySummary["coverage"] | null;
  readonly sourceTimezone: string | null;
}

export function rawAnalyticsPeriod(search: string): RawAnalyticsPeriod {
  const query = new URLSearchParams(search);
  return {
    from: query.get("from"),
    to: query.get("to"),
  };
}

export function useRawAnalyticsPeriod(): RawAnalyticsPeriod {
  const key = useSyncExternalStore(subscribeRawPeriod, rawPeriodKey, () => "");
  if (!key) return { from: null, to: null };
  return JSON.parse(key) as RawAnalyticsPeriod;
}

function subscribeRawPeriod(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(periodChangedEvent, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(periodChangedEvent, onChange);
  };
}

function rawPeriodKey(): string {
  if (typeof window === "undefined") return "";
  return JSON.stringify(rawAnalyticsPeriod(window.location.search));
}

function locationDurations(
  metrics: OperationalAnalyticsResponse["metrics"],
): readonly AnalyticsDurationPresentation[] {
  return durationKeys.map((key) => ({
    key,
    averageSeconds: metrics[key].averageSeconds,
    sampleCount: metrics[key].sampleCount,
    contributingLocationCount: null,
  }));
}

function companyDurations(
  metrics: CompanySummary["operational"]["metrics"],
): readonly AnalyticsDurationPresentation[] {
  return durationKeys.map((key) => ({
    key,
    averageSeconds: metrics[key].averageSeconds,
    sampleCount: metrics[key].sampleCount,
    contributingLocationCount: metrics[key].contributingLocationCount,
  }));
}

const durationKeys: readonly AnalyticsDurationKey[] = [
  "checkInTime",
  "parkingTime",
  "retrievalWait",
  "retrievalStartLatencyAuxiliary",
  "handoffTime",
];

export function locationAnalyticsPresentation(
  operations: OperationalAnalyticsResponse,
  financial: FinancialAnalyticsResponse,
  incidents: IncidentAnalyticsResponse,
  kpis: LocationKpiAnalyticsResponse,
): AnalyticsPresentation {
  return {
    mode: "LOCATION",
    activity: operations.carsHandledPerDay,
    durations: locationDurations(operations.metrics),
    financial: {
      currencies: financial.currencies,
      cashReconciliation: financial.cashReconciliation,
    },
    incidents: {
      incidentCount: incidents.incidentCount,
      severityCounts: incidents.severityCounts,
      typeCounts: incidents.typeCounts,
      incidentsPer1000: incidents.incidentsPer1000,
    },
    slaCompliance: kpis.slaCompliance,
    carsPerActiveEmployee: kpis.carsPerActiveEmployee,
    handoff: {
      attributedCount: kpis.carsHandedOffByEmployee.attributedCount,
      missingAttributionCount: kpis.carsHandedOffByEmployee.missingAttributionCount,
      employeeEvidenceCount: kpis.carsHandedOffByEmployee.employeeCount,
      truncated: kpis.carsHandedOffByEmployee.truncated,
    },
    keyExceptions: kpis.keyExceptions,
    coverage: null,
    sourceTimezone: operations.timezone,
  };
}

export function companyAnalyticsPresentation(
  response: CompanyAnalyticsResponse,
): AnalyticsPresentation {
  const { summary } = response;
  return {
    mode: "COMPANY",
    activity: summary.operational.carsHandledPerDay,
    durations: companyDurations(summary.operational.metrics),
    financial: summary.financial,
    incidents: summary.incidents,
    slaCompliance: summary.kpis.slaCompliance,
    carsPerActiveEmployee: summary.kpis.carsPerActiveEmployee,
    handoff: {
      attributedCount: summary.kpis.carsHandedOff.attributedCount,
      missingAttributionCount: summary.kpis.carsHandedOff.missingAttributionCount,
      employeeEvidenceCount: summary.kpis.carsHandedOff.distinctAttributedEmployeeCount,
      truncated: false,
    },
    keyExceptions: summary.kpis.keyExceptions,
    coverage: summary.coverage,
    sourceTimezone: null,
  };
}

export function companyEvidenceLocationCount(
  presentation: AnalyticsPresentation,
): number | null {
  return "evidenceLocationCount" in presentation.carsPerActiveEmployee
    ? presentation.carsPerActiveEmployee.evidenceLocationCount
    : null;
}

export function companySlaEvidence(
  presentation: AnalyticsPresentation,
): { readonly contributingLocationCount: number; readonly requestCount: number } | null {
  return "requestCount" in presentation.slaCompliance
    ? {
        contributingLocationCount: presentation.slaCompliance.contributingLocationCount,
        requestCount: presentation.slaCompliance.requestCount,
      }
    : null;
}

export function handoffEvidence(presentation: AnalyticsPresentation) {
  return presentation.handoff;
}
