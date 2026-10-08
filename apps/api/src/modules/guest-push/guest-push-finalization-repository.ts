import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type {
  ClaimedGuestPushDelivery,
  EligibleGuestPushDelivery,
} from "./guest-push-delivery-types";
import type { GuestPushProviderResultClass } from "./guest-push-provider";

type TerminalState =
  | "EXPIRED"
  | "PERMANENT_FAILURE"
  | "PROVIDER_ACCEPTED"
  | "SUPPRESSED";

export async function finalizeGuestPushDelivery(
  pool: PostgresPool,
  claim: ClaimedGuestPushDelivery,
  state: TerminalState,
  resultClass?: GuestPushProviderResultClass,
): Promise<boolean> {
  const accepted = state === "PROVIDER_ACCEPTED";
  const result = await pool.query(
    `UPDATE guest_push_deliveries
     SET state = $3::guest_push_delivery_state,
         lease_token = NULL, lease_expires_at = NULL,
         provider_result_class = $4::guest_push_provider_result_class,
         provider_reference = NULL,
         provider_accepted_at = CASE WHEN $5 THEN clock_timestamp() ELSE NULL END,
         terminal_at = clock_timestamp(), updated_at = clock_timestamp()
     WHERE id = $1 AND state = 'LEASED' AND lease_token = $2`,
    [claim.deliveryId, claim.leaseToken, state, resultClass ?? null, accepted],
  );
  return result.rowCount === 1;
}

export async function retryOrTerminalizeGuestPushDelivery(
  pool: PostgresPool,
  claim: ClaimedGuestPushDelivery,
  resultClass: "TRANSIENT" | "RATE_LIMITED" | "CONFIGURATION" | "UNKNOWN",
  delaySeconds: number,
): Promise<"EXPIRED" | "PERMANENT_FAILURE" | "RETRY_WAIT" | "STALE"> {
  const result = await pool.query<{ state: string }>(
    `WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS now)
     UPDATE guest_push_deliveries AS delivery
     SET state = CASE
           WHEN clock.now >= intent.expires_at
             THEN 'EXPIRED'::guest_push_delivery_state
           WHEN delivery.attempt_count >= delivery.max_attempts
             THEN 'PERMANENT_FAILURE'::guest_push_delivery_state
           WHEN clock.now + make_interval(secs => $4) >= intent.expires_at
             THEN 'EXPIRED'::guest_push_delivery_state
           ELSE 'RETRY_WAIT'::guest_push_delivery_state END,
         next_attempt_at = CASE
           WHEN delivery.attempt_count < delivery.max_attempts
             AND clock.now + make_interval(secs => $4) < intent.expires_at
             THEN clock.now + make_interval(secs => $4)
           ELSE NULL END,
         lease_token = NULL, lease_expires_at = NULL,
         provider_result_class = $3::guest_push_provider_result_class,
         provider_reference = NULL,
         terminal_at = CASE
           WHEN delivery.attempt_count < delivery.max_attempts
             AND clock.now + make_interval(secs => $4) < intent.expires_at
             THEN NULL ELSE clock.now END,
         updated_at = clock.now
     FROM guest_push_intents AS intent, clock
     WHERE delivery.id = $1 AND delivery.state = 'LEASED'
       AND delivery.lease_token = $2 AND intent.id = delivery.intent_id
     RETURNING delivery.state::text`,
    [claim.deliveryId, claim.leaseToken, resultClass, delaySeconds],
  );
  const state = result.rows[0]?.state;
  return state === "RETRY_WAIT" ||
    state === "EXPIRED" ||
    state === "PERMANENT_FAILURE"
    ? state
    : "STALE";
}

export async function finalizeGuestPushInvalidEndpoint(
  pool: PostgresPool,
  delivery: EligibleGuestPushDelivery,
): Promise<boolean> {
  return inPostgresTransaction(pool, async (transaction) => {
    const finalized = await transaction.query(
      `UPDATE guest_push_deliveries
       SET state = 'PERMANENT_FAILURE', lease_token = NULL,
           lease_expires_at = NULL, provider_result_class = 'INVALID_ENDPOINT',
           provider_reference = NULL, terminal_at = clock_timestamp(),
           updated_at = clock_timestamp()
       WHERE id = $1 AND state = 'LEASED' AND lease_token = $2`,
      [delivery.deliveryId, delivery.leaseToken],
    );
    if (finalized.rowCount !== 1) return false;
    const invalidated = await transaction.query(
      `UPDATE guest_push_registrations
       SET state = 'PROVIDER_INVALID', endpoint = NULL, p256dh = NULL,
           auth_secret = NULL, terminal_at = clock_timestamp(),
           terminal_reason_class = 'INVALID_ENDPOINT',
           updated_at = clock_timestamp()
       WHERE id = $1 AND state = 'ACTIVE'`,
      [delivery.registrationId],
    );
    if (invalidated.rowCount === 1) {
      await transaction.query(
        `UPDATE guest_push_deliveries
         SET state = 'SUPPRESSED', next_attempt_at = NULL,
             provider_result_class = 'INVALID_ENDPOINT',
             terminal_at = clock_timestamp(), updated_at = clock_timestamp()
         WHERE registration_id = $1 AND id <> $2
           AND state IN ('PENDING', 'RETRY_WAIT')`,
        [delivery.registrationId, delivery.deliveryId],
      );
    }
    return true;
  });
}
