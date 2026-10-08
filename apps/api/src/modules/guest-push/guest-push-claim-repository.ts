import { randomUUID } from "node:crypto";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { ClaimedGuestPushDelivery } from "./guest-push-delivery-types";

interface ClaimRow {
  readonly attempt_count: number;
  readonly id: string;
  readonly lease_token: string;
  readonly max_attempts: number;
  readonly prior_state: string;
}

export const GUEST_PUSH_MAINTENANCE_PASS_LIMIT = 100;

export async function claimGuestPushDelivery(
  pool: PostgresPool,
  leaseDurationSeconds: number,
): Promise<ClaimedGuestPushDelivery | undefined> {
  return inPostgresTransaction(pool, async (transaction) => {
    const leaseToken = randomUUID();
    const result = await transaction.query<ClaimRow>(
      `WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS now),
       candidate AS MATERIALIZED (
         SELECT delivery.id, delivery.state::text AS prior_state
         FROM guest_push_deliveries AS delivery
         INNER JOIN guest_push_intents AS intent ON intent.id = delivery.intent_id
         CROSS JOIN clock
         WHERE intent.expires_at > clock.now
           AND delivery.attempt_count < delivery.max_attempts
           AND ((delivery.state IN ('PENDING', 'RETRY_WAIT')
                  AND delivery.next_attempt_at <= clock.now)
             OR (delivery.state = 'LEASED'
                  AND delivery.lease_expires_at <= transaction_timestamp()))
         ORDER BY COALESCE(delivery.next_attempt_at, delivery.lease_expires_at),
                  delivery.created_at, delivery.id
         FOR UPDATE OF delivery SKIP LOCKED
         LIMIT 1
       )
       UPDATE guest_push_deliveries AS delivery
       SET state = 'LEASED', attempt_count = delivery.attempt_count + 1,
           next_attempt_at = NULL, provider_result_class = NULL,
           provider_reference = NULL, lease_token = $1,
           lease_expires_at = clock.now + make_interval(secs => $2),
           updated_at = clock.now
       FROM candidate, clock
       WHERE delivery.id = candidate.id
       RETURNING delivery.id, delivery.attempt_count, delivery.max_attempts,
                 delivery.lease_token, candidate.prior_state`,
      [leaseToken, leaseDurationSeconds],
    );
    const row = result.rows[0];
    if (row === undefined) return undefined;
    return {
      attemptCount: row.attempt_count,
      deliveryId: row.id,
      leaseToken: row.lease_token,
      maxAttempts: row.max_attempts,
      reclaimed: row.prior_state === "LEASED",
    };
  });
}

export async function terminalizeUnclaimableGuestPushDeliveries(
  pool: PostgresPool,
): Promise<number> {
  return inPostgresTransaction(pool, async (transaction) => {
    const result = await transaction.query(
      `WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS now),
       candidates AS MATERIALIZED (
         SELECT delivery.id,
                CASE WHEN intent.expires_at <= clock.now
                  THEN 'EXPIRED'::guest_push_delivery_state
                  ELSE 'PERMANENT_FAILURE'::guest_push_delivery_state
                END AS terminal_state
         FROM guest_push_deliveries AS delivery
         INNER JOIN guest_push_intents AS intent ON intent.id = delivery.intent_id
         CROSS JOIN clock
         WHERE (delivery.state IN ('PENDING', 'RETRY_WAIT')
                  AND intent.expires_at <= clock.now)
            OR (delivery.state = 'LEASED'
                  AND delivery.lease_expires_at <= clock.now
                  AND (intent.expires_at <= clock.now
                    OR delivery.attempt_count >= delivery.max_attempts))
         ORDER BY COALESCE(delivery.lease_expires_at, intent.expires_at),
                  delivery.created_at, delivery.id
         FOR UPDATE OF delivery SKIP LOCKED
         LIMIT $1
       )
       UPDATE guest_push_deliveries AS delivery
       SET state = candidates.terminal_state, next_attempt_at = NULL,
           lease_token = NULL, lease_expires_at = NULL,
           provider_result_class = CASE
             WHEN candidates.terminal_state = 'PERMANENT_FAILURE'
               THEN 'UNKNOWN'::guest_push_provider_result_class
             ELSE NULL END,
           provider_reference = NULL, terminal_at = clock.now, updated_at = clock.now
       FROM candidates, clock
       WHERE delivery.id = candidates.id`,
      [GUEST_PUSH_MAINTENANCE_PASS_LIMIT],
    );
    return result.rowCount ?? 0;
  });
}

export async function claimedGuestPushDeliveryExpiry(
  pool: PostgresPool,
  claim: ClaimedGuestPushDelivery,
): Promise<{ readonly intentExpired: boolean; readonly leaseExpired: boolean } | undefined> {
  const result = await pool.query<{
    readonly intent_expired: boolean;
    readonly lease_expired: boolean;
  }>(
    `SELECT intent.expires_at <= clock_timestamp() AS intent_expired,
            delivery.lease_expires_at <= clock_timestamp() AS lease_expired
     FROM guest_push_deliveries AS delivery
     INNER JOIN guest_push_intents AS intent ON intent.id = delivery.intent_id
     WHERE delivery.id = $1 AND delivery.state = 'LEASED'
       AND delivery.lease_token = $2`,
    [claim.deliveryId, claim.leaseToken],
  );
  const row = result.rows[0];
  return row === undefined
    ? undefined
    : { intentExpired: row.intent_expired, leaseExpired: row.lease_expired };
}
