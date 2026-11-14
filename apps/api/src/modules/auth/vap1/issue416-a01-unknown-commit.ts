import type { PostgresPool } from "../../../common/database/postgres";
import type { LoginSessionRow } from "../staff-auth-types";

interface A01ReceiptRow extends LoginSessionRow {
  readonly operation_id: string;
  readonly user_id: string;
  readonly refresh_id: string;
  readonly limiter_reservation_id: string;
  readonly current_access_token_hash: string;
  readonly refresh_token_hash: string;
  readonly receipt_outcome: string;
}

interface A01ReceiptIdentity {
  readonly audience: string;
  readonly operationId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly refreshId: string;
  readonly limiterReservationId: string;
  readonly accessHash: string;
  readonly refreshHash: string;
}

/**
 * Exactly one read-only, purpose-fixed receipt lookup after an ambiguous
 * domain COMMIT. No re-prepare, no replay, no new session or credential.
 * SQL must resolve exclusively from the immutable committed receipt, joining
 * exact persisted access/refresh lineage and original limiter operation.
 * A missing/mismatching receipt is UNKNOWN and must remain fail-closed.
 *
 * This dormant adapter waits for W33's independently reviewed SQL ABI.
 */
export async function reconcileA01UnknownCommit(
  pool: PostgresPool,
  identity: A01ReceiptIdentity,
): Promise<LoginSessionRow | undefined> {
  try {
    const result = await pool.query<A01ReceiptRow>(
      `SELECT * FROM auth_proof_private.a01_read_commit_receipt(
         $1::text,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid
       )`,
      [
        identity.audience, identity.operationId, identity.userId,
        identity.sessionId, identity.refreshId, identity.limiterReservationId,
      ],
    );
    if (result.rows.length !== 1) return undefined;
    const row = result.rows[0];
    if (
      !row ||
      row.receipt_outcome !== "COMPLETED" ||
      row.operation_id !== identity.operationId ||
      row.user_id !== identity.userId ||
      row.id !== identity.sessionId ||
      row.refresh_id !== identity.refreshId ||
      row.limiter_reservation_id !== identity.limiterReservationId ||
      row.current_access_token_hash !== identity.accessHash ||
      row.refresh_token_hash !== identity.refreshHash ||
      !(row.access_expires_at instanceof Date) ||
      !(row.absolute_expires_at instanceof Date) ||
      !Number.isInteger(row.refresh_cookie_max_age_seconds)
    ) return undefined;
    return row;
  } catch {
    return undefined;
  }
}
