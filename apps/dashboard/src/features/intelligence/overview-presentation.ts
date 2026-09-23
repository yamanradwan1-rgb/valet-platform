import type {
  CompanyAnalyticsResponse,
  IncidentAnalyticsResponse,
  LocationKpiAnalyticsResponse,
  OperationalAnalyticsResponse,
  QueueSnapshotResponse,
  SessionStateCountsResponse,
} from "@valet/contracts";

export interface OverviewPeriodPresentation {
  readonly activity: OperationalAnalyticsResponse["carsHandledPerDay"];
  readonly carsHandled: number;
  readonly activeEmployeeCount: number;
  readonly retrievalWaitAverageSeconds: string | null;
  readonly retrievalWaitSampleCount: number;
  readonly slaCompliance: LocationKpiAnalyticsResponse["slaCompliance"];
  readonly incidentCount: number;
  readonly companyCoverage: CompanyAnalyticsResponse["summary"]["coverage"] | null;
}

export interface OverviewCurrentPresentation {
  readonly counts: SessionStateCountsResponse["counts"];
  readonly queue: QueueSnapshotResponse;
}

export function locationOverviewPresentation(
  operations: OperationalAnalyticsResponse,
  incidents: IncidentAnalyticsResponse,
  kpis: LocationKpiAnalyticsResponse,
): OverviewPeriodPresentation {
  return {
    activity: operations.carsHandledPerDay,
    carsHandled: kpis.carsPerActiveEmployee.numerator,
    activeEmployeeCount: kpis.carsPerActiveEmployee.denominator,
    retrievalWaitAverageSeconds: operations.metrics.retrievalWait.averageSeconds,
    retrievalWaitSampleCount: operations.metrics.retrievalWait.sampleCount,
    slaCompliance: kpis.slaCompliance,
    incidentCount: incidents.incidentCount,
    companyCoverage: null,
  };
}

export function companyOverviewPresentation(
  response: CompanyAnalyticsResponse,
): OverviewPeriodPresentation {
  return {
    activity: response.summary.operational.carsHandledPerDay,
    carsHandled: response.summary.kpis.carsPerActiveEmployee.numerator,
    activeEmployeeCount: response.summary.kpis.carsPerActiveEmployee.denominator,
    retrievalWaitAverageSeconds:
      response.summary.operational.metrics.retrievalWait.averageSeconds,
    retrievalWaitSampleCount:
      response.summary.operational.metrics.retrievalWait.sampleCount,
    slaCompliance: response.summary.kpis.slaCompliance,
    incidentCount: response.summary.incidents.incidentCount,
    companyCoverage: response.summary.coverage,
  };
}

export function locationCurrentPresentation(
  stateCounts: SessionStateCountsResponse,
  queue: QueueSnapshotResponse,
): OverviewCurrentPresentation {
  return { counts: stateCounts.counts, queue };
}
