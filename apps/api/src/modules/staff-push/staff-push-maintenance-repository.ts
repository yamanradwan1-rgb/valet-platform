import type { PostgresPool } from "../../common/database/postgres";
import type { StaffPushCleanupResult } from "./staff-push-delivery-types";

interface CleanupRow {
  readonly deleted_deliveries: number;
  readonly deleted_intents: number;
  readonly deleted_registrations: number;
}

interface BacklogRow {
  readonly due_count: number;
  readonly oldest_due_age_seconds: number;
}

export async function cleanupStaffPushPersistence(
  pool: PostgresPool,
): Promise<StaffPushCleanupResult> {
  const result = await pool.query<CleanupRow>(
    `SELECT * FROM cleanup_staff_push_v1()`,
  );
  const row = result.rows[0];
  return {
    deliveries: row?.deleted_deliveries ?? 0,
    intents: row?.deleted_intents ?? 0,
    registrations: row?.deleted_registrations ?? 0,
  };
}

export async function staffPushBacklog(pool: PostgresPool): Promise<{
  readonly dueCount: number;
  readonly oldestDueAgeSeconds: number;
}> {
  const result = await pool.query<BacklogRow>(
    `SELECT count(*)::integer AS due_count,
            COALESCE(EXTRACT(EPOCH FROM
              (clock_timestamp() - min(COALESCE(next_attempt_at, lease_expires_at)))),
              0)::integer AS oldest_due_age_seconds
     FROM staff_push_deliveries AS delivery
     INNER JOIN staff_push_intents AS intent ON intent.id = delivery.intent_id
     WHERE intent.expires_at > clock_timestamp()
       AND delivery.attempt_count < delivery.max_attempts
       AND ((delivery.state IN ('PENDING', 'RETRY_WAIT')
              AND delivery.next_attempt_at <= clock_timestamp())
         OR (delivery.state = 'LEASED'
              AND delivery.lease_expires_at <= clock_timestamp()))`,
  );
  return {
    dueCount: result.rows[0]?.due_count ?? 0,
    oldestDueAgeSeconds: Math.max(
      0,
      result.rows[0]?.oldest_due_age_seconds ?? 0,
    ),
  };
}
