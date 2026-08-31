import { randomUUID } from "node:crypto";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { WEB_PUSH_DELIVERY } from "./web-push-delivery-constants";
import type {
  ClaimedWebPushDelivery,
  SubscriptionSnapshot,
  WebPushFailureClass,
} from "./web-push-delivery-types";

export async function claimWebPushDeliveries(
  pool: PostgresPool,
): Promise<ClaimedWebPushDelivery[]> {
  const leaseToken = randomUUID();
  const result = await pool.query<{
    attempt_count: number;
    delivery_id: string;
    lease_token: string;
  }>(
    `WITH due AS (
       SELECT delivery.id FROM web_push_deliveries AS delivery
       INNER JOIN web_push_delivery_intents AS intent ON intent.id = delivery.intent_id
       WHERE delivery.status = 'PENDING' AND delivery.next_attempt_at <= clock_timestamp()
         AND intent.expires_at > clock_timestamp()
         AND (delivery.lease_expires_at IS NULL OR delivery.lease_expires_at <= clock_timestamp())
       ORDER BY delivery.next_attempt_at, delivery.id
       FOR UPDATE OF delivery SKIP LOCKED LIMIT $1
     )
     UPDATE web_push_deliveries AS delivery
     SET lease_token = $2,
         lease_expires_at = clock_timestamp() + ($3::integer * interval '1 millisecond'),
         attempt_count = delivery.attempt_count + 1, updated_at = clock_timestamp()
     FROM due WHERE delivery.id = due.id
     RETURNING delivery.id::text AS delivery_id,
               delivery.attempt_count, delivery.lease_token::text`,
    [
      WEB_PUSH_DELIVERY.batchSize,
      leaseToken,
      WEB_PUSH_DELIVERY.leaseMilliseconds,
    ],
  );
  return result.rows.map((row) => ({
    attemptCount: row.attempt_count,
    deliveryId: row.delivery_id,
    leaseToken: row.lease_token,
  }));
}

export async function finalizeWebPushDelivery(
  pool: PostgresPool,
  input: {
    readonly claim: ClaimedWebPushDelivery;
    readonly failure?: WebPushFailureClass;
    readonly nextAttemptAt?: Date;
    readonly status: "ACCEPTED" | "SUPPRESSED" | "TERMINAL";
  },
): Promise<boolean> {
  const timeColumn =
    input.status === "ACCEPTED"
      ? "accepted_at"
      : input.status === "TERMINAL"
        ? "terminal_at"
        : "suppressed_at";
  const result = await pool.query(
    `UPDATE web_push_deliveries SET status = $3, ${timeColumn} = clock_timestamp(),
       last_failure_class = $4, lease_token = NULL, lease_expires_at = NULL,
       next_attempt_at = COALESCE($5, next_attempt_at), updated_at = clock_timestamp()
     WHERE id = $1 AND lease_token = $2 AND status = 'PENDING'`,
    [
      input.claim.deliveryId,
      input.claim.leaseToken,
      input.status,
      input.failure ?? null,
      input.nextAttemptAt ?? null,
    ],
  );
  return result.rowCount === 1;
}

export async function retryWebPushDelivery(
  pool: PostgresPool,
  claim: ClaimedWebPushDelivery,
  failure: WebPushFailureClass,
  nextAttemptAt: Date,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE web_push_deliveries SET next_attempt_at = $4,
       last_failure_class = $3, lease_token = NULL, lease_expires_at = NULL,
       updated_at = clock_timestamp()
     WHERE id = $1 AND lease_token = $2 AND status = 'PENDING'`,
    [claim.deliveryId, claim.leaseToken, failure, nextAttemptAt],
  );
  return result.rowCount === 1;
}

export async function finalizeGoneWebPushDelivery(
  pool: PostgresPool,
  claim: ClaimedWebPushDelivery,
  subscriptionId: string,
  snapshot: SubscriptionSnapshot,
): Promise<boolean> {
  return inPostgresTransaction(pool, async (transaction) => {
    const finalized = await transaction.query(
      `UPDATE web_push_deliveries SET status = 'TERMINAL',
         terminal_at = clock_timestamp(), last_failure_class = 'ENDPOINT_GONE',
         lease_token = NULL, lease_expires_at = NULL, updated_at = clock_timestamp()
       WHERE id = $1 AND lease_token = $2 AND status = 'PENDING'`,
      [claim.deliveryId, claim.leaseToken],
    );
    if (finalized.rowCount !== 1) return false;
    await transaction.query(
      `UPDATE web_push_subscriptions
       SET disabled_at = clock_timestamp(), disabled_reason = 'ENDPOINT_GONE',
           endpoint_ciphertext = NULL, p256dh_ciphertext = NULL,
           auth_ciphertext = NULL, encryption_key_version = NULL,
           updated_at = clock_timestamp()
       WHERE id = $1 AND disabled_at IS NULL AND endpoint_fingerprint = $2
         AND endpoint_ciphertext = $3 AND p256dh_ciphertext = $4
         AND auth_ciphertext = $5 AND encryption_key_version = $6`,
      [
        subscriptionId,
        snapshot.endpointFingerprint,
        snapshot.endpointCiphertext,
        snapshot.p256dhCiphertext,
        snapshot.authCiphertext,
        snapshot.encryptionKeyVersion,
      ],
    );
    return true;
  });
}
