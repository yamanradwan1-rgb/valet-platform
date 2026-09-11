import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { STAFF_PUSH_MAINTENANCE_PASS_LIMIT } from "./staff-push-claim-repository";
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

interface StaleRegistrationRow {
  readonly disabled_registrations: number;
  readonly suppressed_deliveries: number;
}

export interface StaleRegistrationResult {
  readonly disabledRegistrations: number;
  readonly suppressedDeliveries: number;
}

export async function reconcileStaleStaffPushRegistrations(
  pool: PostgresPool,
  activeRegistrationStaleDays: number,
): Promise<StaleRegistrationResult> {
  return inPostgresTransaction(pool, async (transaction) => {
    const result = await transaction.query<StaleRegistrationRow>(
      `WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS now),
       candidates AS MATERIALIZED (
         SELECT registration.id
         FROM staff_push_registrations AS registration
         CROSS JOIN clock
         WHERE registration.state = 'ACTIVE'
           AND registration.last_confirmed_at <=
             clock.now - make_interval(days => $1)
         ORDER BY registration.last_confirmed_at, registration.id
         FOR UPDATE OF registration SKIP LOCKED
         LIMIT $2
       ), disabled AS (
         UPDATE staff_push_registrations AS registration
         SET state = 'DISABLED', provider_token = NULL,
             terminal_at = clock.now,
             terminal_reason_class = 'STALE_CONFIRMATION_TIMEOUT',
             updated_at = clock.now
         FROM candidates, clock
         WHERE registration.id = candidates.id
           AND registration.state = 'ACTIVE'
           AND registration.last_confirmed_at <=
             clock.now - make_interval(days => $1)
         RETURNING registration.id
       ), suppressed AS (
         UPDATE staff_push_deliveries AS delivery
         SET state = 'SUPPRESSED', next_attempt_at = NULL,
             provider_result_class = NULL, provider_reference = NULL,
             terminal_at = clock.now, updated_at = clock.now
         FROM disabled, clock
         WHERE delivery.registration_id = disabled.id
           AND delivery.state IN ('PENDING', 'RETRY_WAIT')
         RETURNING delivery.id
       )
       SELECT (SELECT count(*)::integer FROM disabled)
                AS disabled_registrations,
              (SELECT count(*)::integer FROM suppressed)
                AS suppressed_deliveries`,
      [activeRegistrationStaleDays, STAFF_PUSH_MAINTENANCE_PASS_LIMIT],
    );
    return {
      disabledRegistrations: result.rows[0]?.disabled_registrations ?? 0,
      suppressedDeliveries: result.rows[0]?.suppressed_deliveries ?? 0,
    };
  });
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
