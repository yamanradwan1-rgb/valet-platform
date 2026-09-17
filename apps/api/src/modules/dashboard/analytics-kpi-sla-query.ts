import type { PostgresTransaction } from "../../common/database/postgres";
import { analyticsWindowSelect } from "./analytics-period";

interface SlaRow {
  readonly denominator: number;
  readonly invalidOrMissingIntervalCount: number;
  readonly missingTargetCount: number;
  readonly numerator: number;
  readonly percentage: string | null;
}

export async function querySlaCompliance(
  transaction: PostgresTransaction,
  parameters: readonly unknown[],
): Promise<SlaRow> {
  const result = await transaction.query<SlaRow>(
    `WITH bounds AS (${analyticsWindowSelect(3, 4, 5)}), cohort AS (
       SELECT request.requested_at,
              request.sla_target_seconds_snapshot,
              session.retrieval_requested_at,
              session.ready_at
       FROM retrieval_requests AS request
       INNER JOIN valet_sessions AS session
         ON session.organization_id = request.organization_id
        AND session.id = request.valet_session_id
       CROSS JOIN bounds
       WHERE request.organization_id = $1
         AND session.location_id = $2
         AND request.status <> 'CANCELLED'
         AND request.requested_at >= bounds.period_start
         AND request.requested_at < bounds.period_end
     ), counts AS (
     SELECT
       count(*) FILTER (
         WHERE sla_target_seconds_snapshot IS NOT NULL
           AND retrieval_requested_at = requested_at
           AND ready_at IS NOT NULL
           AND ready_at >= requested_at
       )::int AS denominator,
       count(*) FILTER (
         WHERE sla_target_seconds_snapshot IS NOT NULL
           AND retrieval_requested_at = requested_at
           AND ready_at IS NOT NULL
           AND ready_at >= requested_at
           AND EXTRACT(EPOCH FROM (ready_at - requested_at))
               <= sla_target_seconds_snapshot
       )::int AS numerator,
       count(*) FILTER (
         WHERE sla_target_seconds_snapshot IS NULL
       )::int AS "missingTargetCount",
       count(*) FILTER (
         WHERE retrieval_requested_at IS NULL
            OR retrieval_requested_at <> requested_at
            OR ready_at IS NULL
            OR ready_at < requested_at
       )::int AS "invalidOrMissingIntervalCount"
     FROM cohort
     )
     SELECT numerator, denominator, "missingTargetCount",
            "invalidOrMissingIntervalCount",
            CASE WHEN denominator = 0 THEN NULL
                 ELSE (numerator::numeric * 100 / denominator::numeric)
                        ::numeric(20,2)::text
            END AS percentage
     FROM counts`,
    [...parameters],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("SLA analytics aggregate is missing.");
  return row;
}
