import type { CompanyAnalyticsSummary } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { companyLocationBoundsCte } from "./company-analytics-bounds";

interface OperationsRow {
  readonly carsHandledPerDay: CompanyAnalyticsSummary["operational"]["carsHandledPerDay"];
  readonly checkInAverage: string | null;
  readonly checkInCount: number;
  readonly checkInLocations: number;
  readonly handoffAverage: string | null;
  readonly handoffCount: number;
  readonly handoffLocations: number;
  readonly parkingAverage: string | null;
  readonly parkingCount: number;
  readonly parkingLocations: number;
  readonly retrievalStartAverage: string | null;
  readonly retrievalStartCount: number;
  readonly retrievalStartLocations: number;
  readonly retrievalWaitAverage: string | null;
  readonly retrievalWaitCount: number;
  readonly retrievalWaitLocations: number;
}

export async function queryCompanyOperations(
  transaction: PostgresTransaction,
  parameters: readonly [string, string, string],
): Promise<CompanyAnalyticsSummary["operational"]> {
  const result = await transaction.query<OperationsRow>(
    `WITH ${companyLocationBoundsCte()}, duration_samples AS (
       SELECT 'CHECK_IN' AS metric, s.location_id,
              EXTRACT(EPOCH FROM (s.checking_in_completed_at - s.created_at)) AS seconds
       FROM valet_sessions AS s JOIN location_bounds AS b ON b.location_id = s.location_id
       WHERE s.organization_id = $1 AND s.checking_in_completed_at IS NOT NULL
         AND s.checking_in_completed_at >= b.period_start AND s.checking_in_completed_at < b.period_end
         AND s.checking_in_completed_at >= s.created_at
       UNION ALL
       SELECT 'PARKING', s.location_id,
              EXTRACT(EPOCH FROM (s.parked_at - s.parking_started_at))
       FROM valet_sessions AS s JOIN location_bounds AS b ON b.location_id = s.location_id
       WHERE s.organization_id = $1 AND s.parked_at IS NOT NULL AND s.parking_started_at IS NOT NULL
         AND s.parked_at >= b.period_start AND s.parked_at < b.period_end
         AND s.parked_at >= s.parking_started_at
       UNION ALL
       SELECT 'RETRIEVAL_WAIT', s.location_id,
              EXTRACT(EPOCH FROM (s.ready_at - s.retrieval_requested_at))
       FROM valet_sessions AS s JOIN location_bounds AS b ON b.location_id = s.location_id
       WHERE s.organization_id = $1 AND s.ready_at IS NOT NULL AND s.retrieval_requested_at IS NOT NULL
         AND s.ready_at >= b.period_start AND s.ready_at < b.period_end
         AND s.ready_at >= s.retrieval_requested_at
       UNION ALL
       SELECT 'RETRIEVAL_START', s.location_id,
              EXTRACT(EPOCH FROM (s.retrieval_started_at - s.retrieval_requested_at))
       FROM valet_sessions AS s JOIN location_bounds AS b ON b.location_id = s.location_id
       WHERE s.organization_id = $1 AND s.retrieval_started_at IS NOT NULL
         AND s.retrieval_requested_at IS NOT NULL
         AND s.retrieval_started_at >= b.period_start AND s.retrieval_started_at < b.period_end
         AND s.retrieval_started_at >= s.retrieval_requested_at
       UNION ALL
       SELECT 'HANDOFF', s.location_id, EXTRACT(EPOCH FROM (s.completed_at - s.ready_at))
       FROM valet_sessions AS s JOIN location_bounds AS b ON b.location_id = s.location_id
       WHERE s.organization_id = $1 AND s.completed_at IS NOT NULL AND s.ready_at IS NOT NULL
         AND s.completed_at >= b.period_start AND s.completed_at < b.period_end
         AND s.completed_at >= s.ready_at
     ), durations AS (
       SELECT count(*) FILTER (WHERE metric='CHECK_IN')::int AS "checkInCount",
              (avg(seconds) FILTER (WHERE metric='CHECK_IN'))::numeric(20,3)::text AS "checkInAverage",
              count(DISTINCT location_id) FILTER (WHERE metric='CHECK_IN')::int AS "checkInLocations",
              count(*) FILTER (WHERE metric='PARKING')::int AS "parkingCount",
              (avg(seconds) FILTER (WHERE metric='PARKING'))::numeric(20,3)::text AS "parkingAverage",
              count(DISTINCT location_id) FILTER (WHERE metric='PARKING')::int AS "parkingLocations",
              count(*) FILTER (WHERE metric='RETRIEVAL_WAIT')::int AS "retrievalWaitCount",
              (avg(seconds) FILTER (WHERE metric='RETRIEVAL_WAIT'))::numeric(20,3)::text AS "retrievalWaitAverage",
              count(DISTINCT location_id) FILTER (WHERE metric='RETRIEVAL_WAIT')::int AS "retrievalWaitLocations",
              count(*) FILTER (WHERE metric='RETRIEVAL_START')::int AS "retrievalStartCount",
              (avg(seconds) FILTER (WHERE metric='RETRIEVAL_START'))::numeric(20,3)::text AS "retrievalStartAverage",
              count(DISTINCT location_id) FILTER (WHERE metric='RETRIEVAL_START')::int AS "retrievalStartLocations",
              count(*) FILTER (WHERE metric='HANDOFF')::int AS "handoffCount",
              (avg(seconds) FILTER (WHERE metric='HANDOFF'))::numeric(20,3)::text AS "handoffAverage",
              count(DISTINCT location_id) FILTER (WHERE metric='HANDOFF')::int AS "handoffLocations"
       FROM duration_samples
     ), days AS (
       SELECT generate_series($2::date, $3::date, INTERVAL '1 day')::date AS day
     ), handled AS (
       SELECT (s.completed_at AT TIME ZONE b.timezone)::date AS day, count(*)::int AS handled
       FROM valet_sessions AS s JOIN location_bounds AS b ON b.location_id = s.location_id
       WHERE s.organization_id = $1 AND s.completed_at IS NOT NULL
         AND s.completed_at >= b.period_start AND s.completed_at < b.period_end
       GROUP BY 1
     ), cars AS (
       SELECT jsonb_agg(jsonb_build_object(
                'date', days.day::text, 'handledCount', COALESCE(handled.handled, 0)) ORDER BY days.day)
              AS "carsHandledPerDay"
       FROM days LEFT JOIN handled USING (day)
     )
     SELECT durations.*, COALESCE(cars."carsHandledPerDay", '[]'::jsonb) AS "carsHandledPerDay"
     FROM durations CROSS JOIN cars`,
    [...parameters],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("Company operational analytics are missing.");
  return {
    carsHandledPerDay: row.carsHandledPerDay,
    metrics: {
      checkInTime: { averageSeconds: row.checkInAverage, contributingLocationCount: row.checkInLocations, sampleCount: row.checkInCount },
      handoffTime: { averageSeconds: row.handoffAverage, contributingLocationCount: row.handoffLocations, sampleCount: row.handoffCount },
      parkingTime: { averageSeconds: row.parkingAverage, contributingLocationCount: row.parkingLocations, sampleCount: row.parkingCount },
      retrievalStartLatencyAuxiliary: { averageSeconds: row.retrievalStartAverage, contributingLocationCount: row.retrievalStartLocations, sampleCount: row.retrievalStartCount },
      retrievalWait: { averageSeconds: row.retrievalWaitAverage, contributingLocationCount: row.retrievalWaitLocations, sampleCount: row.retrievalWaitCount },
    },
  };
}
