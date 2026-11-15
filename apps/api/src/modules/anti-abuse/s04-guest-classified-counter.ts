import { observeTransactionOutcome } from "../../common/database/postgres-transaction-outcome";
import type { PostgresTransaction } from "../../common/database/postgres";
import type { AntiAbuseKey } from "./anti-abuse-key";
import { signS04GuestClassified } from "./s04-signed-sql-proof";

export const guestClassMeasurements = {
  A: { allowed: 0, blocked: 0, rolledBack: 0, unavailable: 0 },
  B: { allowed: 0, blocked: 0, rolledBack: 0, unavailable: 0 },
  C: { allowed: 0, blocked: 0, rolledBack: 0, unavailable: 0 },
  D: { allowed: 0, blocked: 0, rolledBack: 0, unavailable: 0 },
};

// Caller must first verify persisted Guest credential and exact visit on the
// same transaction. A one-time proof binds the visit/group and quota policy.
export async function countClassifiedGuest(
  transaction: PostgresTransaction,
  key: AntiAbuseKey,
  requestClass: "A" | "B" | "C" | "D",
  threshold: number,
  aggregate: number,
  group: AntiAbuseKey = key,
  credentialAggregate: number = aggregate,
): Promise<{ readonly id?: string; readonly retryAfter: number }> {
  try {
    const proof = signS04GuestClassified(
      key, group, requestClass, threshold, aggregate, credentialAggregate,
    );
    const result = await transaction.query<{
      id: string | null;
      retry_after: number;
    }>(
      `SELECT id,retry_after FROM public.s04_guest_classified(
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid,$12::bigint,$13)`,
      [
        key.keyHash, group.keyHash, requestClass, threshold, aggregate,
        credentialAggregate, group.lockHigh, group.lockLow,
        key.lockHigh, key.lockLow, proof.nonce, proof.expiresMs, proof.mac,
      ],
    );
    const row = result.rows[0];
    if (!row || (row.id === null && row.retry_after === 0)) {
      throw new Error("Guest accounting unavailable.");
    }
    observeTransactionOutcome(transaction, (outcome) => {
      const measurement =
        outcome === "COMMITTED"
          ? row.retry_after === 0 ? "allowed" : "blocked"
          : outcome === "ROLLED_BACK" ? "rolledBack" : "unavailable";
      guestClassMeasurements[requestClass][measurement] += 1;
    });
    return {
      ...(row.id === null ? {} : { id: row.id }),
      retryAfter: row.retry_after,
    };
  } catch (error) {
    guestClassMeasurements[requestClass].unavailable += 1;
    throw error;
  }
}
