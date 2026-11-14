import type { PostgresPool } from "../../../common/database/postgres";
import type { LoginSessionRow } from "../staff-auth-types";

interface A01ReceiptRow {
  readonly receipt_status: "COMMITTED" | "UNKNOWN";
  readonly access_expires_at: Date | null;
  readonly absolute_expires_at: Date | null;
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
         $1::text,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,
         $7::text,$8::text
       )`,
      [
        identity.audience, identity.operationId, identity.userId,
        identity.sessionId, identity.refreshId, identity.limiterReservationId,
        identity.accessHash, identity.refreshHash,
      ],
    );
    if (result.rows.length !== 1) return undefined;
    const row = result.rows[0];
    if (
      !row ||
      row.receipt_status !== "COMMITTED" ||
      !(row.access_expires_at instanceof Date) ||
      !(row.absolute_expires_at instanceof Date) ||
      row.access_expires_at.getTime() <= Date.now() ||
      row.absolute_expires_at.getTime() <= Date.now()
    ) return undefined;
    return {
      id: identity.sessionId,
      access_expires_at: row.access_expires_at,
      absolute_expires_at: row.absolute_expires_at,
      refresh_cookie_max_age_seconds: Math.max(
        0, Math.floor((row.absolute_expires_at.getTime() - Date.now()) / 1000),
      ),
    };
  } catch {
    return undefined;
  }
}
