import type { PostgresPool } from "../../../common/database/postgres";
import { inPostgresTransaction } from "../../../common/database/postgres-transaction";
import { AntiAbuseUnavailableError } from "../../anti-abuse/anti-abuse.service";

/**
 * Separate committed conservative failure finalization. The private SQL
 * checks the immutable completed receipt first and never discounts an
 * unproven login to IGNORED. It may leave PENDING on connection failure.
 */
export async function countUnresolvedA01(
  pool: PostgresPool,
  audience: string,
  operationId: string,
  reservationId: string,
): Promise<void> {
  const finalized = await inPostgresTransaction(pool, (transaction) =>
    transaction.query<{ readonly a01_count_unresolved: string }>(
      `SELECT auth_proof_private.a01_count_unresolved(
         $1::text,$2::uuid,$3::uuid
       )`,
      [audience, operationId, reservationId],
    ),
  );
  const state = finalized.rows[0]?.a01_count_unresolved;
  if (finalized.rows.length !== 1 ||
      (state !== "COUNTED" && state !== "IGNORED")) {
    throw new AntiAbuseUnavailableError();
  }
}
