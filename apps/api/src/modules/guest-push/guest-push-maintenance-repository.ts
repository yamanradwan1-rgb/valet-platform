import type { PostgresPool } from "../../common/database/postgres";
import { GUEST_PUSH_MAINTENANCE_PASS_LIMIT } from "./guest-push-claim-repository";
import type { GuestPushCleanupResult } from "./guest-push-delivery-types";

interface EndedRegistrationRow {
  readonly suppressed_deliveries: number;
  readonly terminalized_registrations: number;
}

export async function reconcileEndedGuestPushRegistrations(
  pool: PostgresPool,
): Promise<{
  readonly suppressedDeliveries: number;
  readonly terminalizedRegistrations: number;
}> {
  const result = await pool.query<EndedRegistrationRow>(
    `SELECT terminalized_registrations, suppressed_deliveries
     FROM public.guest_push_reconcile_ended_v1($1)`,
    [GUEST_PUSH_MAINTENANCE_PASS_LIMIT],
  );
  return {
    suppressedDeliveries: result.rows[0]?.suppressed_deliveries ?? 0,
    terminalizedRegistrations:
      result.rows[0]?.terminalized_registrations ?? 0,
  };
}

export async function cleanupGuestPushPersistence(
  pool: PostgresPool,
): Promise<GuestPushCleanupResult> {
  const result = await pool.query<{
    readonly deleted_deliveries: number;
    readonly deleted_intents: number;
    readonly deleted_registrations: number;
  }>(`SELECT * FROM cleanup_guest_push_v1()`);
  const row = result.rows[0];
  return {
    deliveries: row?.deleted_deliveries ?? 0,
    intents: row?.deleted_intents ?? 0,
    registrations: row?.deleted_registrations ?? 0,
  };
}

export async function guestPushBacklog(pool: PostgresPool): Promise<{
  readonly dueCount: number;
  readonly oldestDueAgeSeconds: number;
}> {
  const result = await pool.query<{
    readonly due_count: number;
    readonly oldest_due_age_seconds: number;
  }>(
    `SELECT count(*)::integer AS due_count,
            COALESCE(EXTRACT(EPOCH FROM
              (clock_timestamp() -
                min(COALESCE(next_attempt_at, lease_expires_at)))),
              0)::integer AS oldest_due_age_seconds
     FROM guest_push_deliveries AS delivery
     INNER JOIN guest_push_intents AS intent ON intent.id = delivery.intent_id
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
