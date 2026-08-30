import type { PostgresTransaction } from "../../common/database/postgres";

export interface WebPushBindingOwner {
  readonly audience: "EMPLOYEE" | "GUEST";
  readonly guest_access_generation: string | null;
  readonly guest_valet_session_id: string | null;
  readonly id: string;
  readonly staff_auth_session_id: string | null;
}

async function staleReason(
  transaction: PostgresTransaction,
  binding: WebPushBindingOwner,
): Promise<string | undefined> {
  if (binding.audience === "EMPLOYEE") {
    const result = await transaction.query<{
      absolute_expired: boolean;
      revoked: boolean;
      user_active: boolean;
    }>(
      `SELECT session.revoked_at IS NOT NULL AS revoked,
              clock_timestamp() >= session.absolute_expires_at AS absolute_expired,
              staff_user.status = 'ACTIVE' AS user_active
       FROM staff_auth_sessions AS session
       INNER JOIN users AS staff_user ON staff_user.id = session.user_id
       WHERE session.id = $1 FOR UPDATE OF session`,
      [binding.staff_auth_session_id],
    );
    const owner = result.rows[0];
    if (owner === undefined || owner.revoked || !owner.user_active) {
      return "SESSION_REVOKED";
    }
    return owner.absolute_expired ? "SESSION_EXPIRED" : undefined;
  }
  const result = await transaction.query<{
    completed: boolean;
    expired: boolean;
    generation_matches: boolean;
    revoked: boolean;
  }>(
    `SELECT session.customer_access_revoked_at IS NOT NULL AS revoked,
            session.customer_access_expires_at <= clock_timestamp() AS expired,
            session.customer_access_generation = $2 AS generation_matches,
            session.state = 'COMPLETED' AS completed
     FROM valet_sessions AS session
     WHERE session.id = $1 FOR UPDATE OF session`,
    [binding.guest_valet_session_id, binding.guest_access_generation],
  );
  const owner = result.rows[0];
  if (owner === undefined || !owner.generation_matches) {
    return "GUEST_ACCESS_CHANGED";
  }
  if (owner.completed) return "VALET_SESSION_COMPLETED";
  if (owner.revoked) return "SESSION_REVOKED";
  return owner.expired ? "SESSION_EXPIRED" : undefined;
}

export async function disableIneligibleWebPushBinding(
  transaction: PostgresTransaction,
  binding: WebPushBindingOwner,
): Promise<boolean> {
  const reason = await staleReason(transaction, binding);
  if (reason === undefined) return false;
  await transaction.query(
    `UPDATE web_push_subscriptions
     SET disabled_at = transaction_timestamp(), disabled_reason = $2,
         endpoint_ciphertext = NULL, p256dh_ciphertext = NULL,
         auth_ciphertext = NULL, encryption_key_version = NULL,
         updated_at = transaction_timestamp()
     WHERE id = $1 AND disabled_at IS NULL`,
    [binding.id, reason],
  );
  return true;
}
