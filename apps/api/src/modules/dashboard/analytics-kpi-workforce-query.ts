import type { PostgresTransaction } from "../../common/database/postgres";
import { analyticsWindowSelect } from "./analytics-period";

interface CarsPerActiveEmployeeRow {
  readonly denominator: number;
  readonly numerator: number;
  readonly value: string | null;
}

interface HandoffSummaryRow {
  readonly attributedCount: number;
  readonly employeeCount: number;
  readonly missingAttributionCount: number;
}

export interface HandoffEmployeeRow {
  readonly count: number;
  readonly membershipId: string;
}

const evidenceUnion = `
  SELECT s.checked_in_by_membership_id AS membership_id
  FROM valet_sessions AS s CROSS JOIN bounds
  WHERE s.organization_id = $1 AND s.location_id = $2
    AND s.created_at >= bounds.period_start AND s.created_at < bounds.period_end
  UNION
  SELECT s.check_in_condition_completed_by_membership_id
  FROM valet_sessions AS s CROSS JOIN bounds
  WHERE s.organization_id = $1 AND s.location_id = $2
    AND s.check_in_condition_completed_by_membership_id IS NOT NULL
    AND s.check_in_condition_completed_at >= bounds.period_start
    AND s.check_in_condition_completed_at < bounds.period_end
  UNION
  SELECT s.completed_by_membership_id
  FROM valet_sessions AS s CROSS JOIN bounds
  WHERE s.organization_id = $1 AND s.location_id = $2
    AND s.completed_by_membership_id IS NOT NULL
    AND s.completed_at >= bounds.period_start AND s.completed_at < bounds.period_end
  UNION
  SELECT event.actor_membership_id
  FROM key_custody_events AS event CROSS JOIN bounds
  WHERE event.organization_id = $1 AND event.location_id = $2
    AND event.occurred_at >= bounds.period_start AND event.occurred_at < bounds.period_end
  UNION
  SELECT note.recorded_by_membership_id
  FROM condition_notes AS note CROSS JOIN bounds
  WHERE note.organization_id = $1 AND note.location_id = $2
    AND note.created_at >= bounds.period_start AND note.created_at < bounds.period_end
  UNION
  SELECT photo.captured_by_membership_id
  FROM vehicle_photos AS photo CROSS JOIN bounds
  WHERE photo.organization_id = $1 AND photo.location_id = $2
    AND photo.created_at >= bounds.period_start AND photo.created_at < bounds.period_end
  UNION
  SELECT verification.verified_by_membership_id
  FROM handoff_verifications AS verification
  INNER JOIN valet_sessions AS s
    ON s.organization_id = verification.organization_id
   AND s.id = verification.valet_session_id
  CROSS JOIN bounds
  WHERE verification.organization_id = $1 AND s.location_id = $2
    AND verification.verified_by_membership_id IS NOT NULL
    AND verification.verified_at >= bounds.period_start
    AND verification.verified_at < bounds.period_end
  UNION
  SELECT event.actor_membership_id
  FROM dispatch_events AS event CROSS JOIN bounds
  WHERE event.organization_id = $1 AND event.location_id = $2
    AND event.actor_membership_id IS NOT NULL
    AND event.event_type IN ('ACCEPTED','DECLINED','IN_PROGRESS','COMPLETED')
    AND event.occurred_at >= bounds.period_start AND event.occurred_at < bounds.period_end
`;

export async function queryCarsPerActiveEmployee(
  transaction: PostgresTransaction,
  parameters: readonly unknown[],
): Promise<CarsPerActiveEmployeeRow> {
  const result = await transaction.query<CarsPerActiveEmployeeRow>(
    `WITH bounds AS (${analyticsWindowSelect(3, 4, 5)}),
     work_memberships AS (${evidenceUnion}),
     totals AS (
       SELECT
         (SELECT count(*)::int FROM work_memberships) AS denominator,
         (SELECT count(*)::int
          FROM valet_sessions AS s CROSS JOIN bounds
          WHERE s.organization_id = $1 AND s.location_id = $2
            AND s.completed_at >= bounds.period_start
            AND s.completed_at < bounds.period_end) AS numerator
     )
     SELECT denominator, numerator,
            CASE WHEN denominator = 0 THEN NULL
                 ELSE (numerator::numeric / denominator::numeric)::numeric(20,3)::text
            END AS value
     FROM totals`,
    [...parameters],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("Active employee aggregate is missing.");
  return row;
}

export async function queryHandoffSummary(
  transaction: PostgresTransaction,
  parameters: readonly unknown[],
): Promise<HandoffSummaryRow> {
  const result = await transaction.query<HandoffSummaryRow>(
    `WITH bounds AS (${analyticsWindowSelect(3, 4, 5)})
     SELECT
       count(*) FILTER (WHERE s.completed_by_membership_id IS NOT NULL)::int
         AS "attributedCount",
       count(DISTINCT s.completed_by_membership_id)::int AS "employeeCount",
       count(*) FILTER (WHERE s.completed_by_membership_id IS NULL)::int
         AS "missingAttributionCount"
     FROM valet_sessions AS s CROSS JOIN bounds
     WHERE s.organization_id = $1 AND s.location_id = $2
       AND s.completed_at >= bounds.period_start
       AND s.completed_at < bounds.period_end`,
    [...parameters],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("Handoff summary aggregate is missing.");
  return row;
}

export function queryHandoffEmployees(
  transaction: PostgresTransaction,
  parameters: readonly unknown[],
): Promise<{ rows: HandoffEmployeeRow[] }> {
  return transaction.query<HandoffEmployeeRow>(
    `WITH bounds AS (${analyticsWindowSelect(3, 4, 5)})
     SELECT s.completed_by_membership_id::text AS "membershipId",
            count(*)::int AS count
     FROM valet_sessions AS s CROSS JOIN bounds
     WHERE s.organization_id = $1 AND s.location_id = $2
       AND s.completed_at >= bounds.period_start
       AND s.completed_at < bounds.period_end
       AND s.completed_by_membership_id IS NOT NULL
     GROUP BY s.completed_by_membership_id
     ORDER BY s.completed_by_membership_id
     LIMIT 500`,
    [...parameters],
  );
}
