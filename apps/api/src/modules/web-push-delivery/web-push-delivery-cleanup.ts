import type { PostgresPool } from "../../common/database/postgres";

export async function disableStaleWebPushSubscriptions(
  pool: PostgresPool,
): Promise<number> {
  const result = await pool.query(
    `WITH stale AS (
       SELECT subscription.id,
         CASE
           WHEN subscription.browser_expires_at <= clock_timestamp() THEN 'SESSION_EXPIRED'::web_push_disabled_reason
           WHEN subscription.audience = 'EMPLOYEE' AND auth_session.revoked_at IS NOT NULL THEN 'SESSION_REVOKED'::web_push_disabled_reason
           WHEN subscription.audience = 'EMPLOYEE' AND auth_session.absolute_expires_at <= clock_timestamp() THEN 'SESSION_EXPIRED'::web_push_disabled_reason
           WHEN subscription.audience = 'EMPLOYEE' AND user_row.status <> 'ACTIVE' THEN 'SESSION_REVOKED'::web_push_disabled_reason
           WHEN subscription.audience = 'GUEST' AND guest_session.customer_access_generation IS DISTINCT FROM subscription.guest_access_generation THEN 'GUEST_ACCESS_CHANGED'::web_push_disabled_reason
           WHEN subscription.audience = 'GUEST' AND guest_session.state = 'COMPLETED' THEN 'VALET_SESSION_COMPLETED'::web_push_disabled_reason
           WHEN subscription.audience = 'GUEST' AND guest_session.customer_access_revoked_at IS NOT NULL THEN 'SESSION_REVOKED'::web_push_disabled_reason
           WHEN subscription.audience = 'GUEST' AND guest_session.customer_access_expires_at <= clock_timestamp() THEN 'SESSION_EXPIRED'::web_push_disabled_reason
         END AS reason
       FROM web_push_subscriptions AS subscription
       LEFT JOIN staff_auth_sessions AS auth_session ON auth_session.id = subscription.staff_auth_session_id
       LEFT JOIN users AS user_row ON user_row.id = auth_session.user_id
       LEFT JOIN valet_sessions AS guest_session ON guest_session.id = subscription.guest_valet_session_id
       WHERE subscription.disabled_at IS NULL
     )
     UPDATE web_push_subscriptions AS subscription
     SET disabled_at = clock_timestamp(), disabled_reason = stale.reason,
         endpoint_ciphertext = NULL, p256dh_ciphertext = NULL,
         auth_ciphertext = NULL, encryption_key_version = NULL,
         updated_at = clock_timestamp()
     FROM stale WHERE subscription.id = stale.id AND stale.reason IS NOT NULL
       AND subscription.disabled_at IS NULL`,
  );
  return result.rowCount ?? 0;
}

export async function expireWebPushDeliveries(
  pool: PostgresPool,
): Promise<number> {
  const result = await pool.query(
    `UPDATE web_push_deliveries AS delivery
     SET status = 'TERMINAL', terminal_at = clock_timestamp(),
         last_failure_class = 'AUTHORITY', lease_token = NULL,
         lease_expires_at = NULL, updated_at = clock_timestamp()
     FROM web_push_delivery_intents AS intent
     WHERE intent.id = delivery.intent_id AND delivery.status = 'PENDING'
       AND intent.expires_at <= clock_timestamp()`,
  );
  return result.rowCount ?? 0;
}
