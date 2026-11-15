import type { PostgresPool, PostgresTransaction } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { observeTransactionOutcome, type TransactionOutcome } from "../../common/database/postgres-transaction-outcome";

/**
 * Never retry a transaction whose COMMIT acknowledgement was lost.
 * An exact, read-only committed-state proof may recover its original result.
 */
export async function staffAuthWriterTransaction<T>(
  writer: PostgresPool,
  action: (transaction: PostgresTransaction) => Promise<T>,
  reconcile: (result: T) => Promise<boolean>,
): Promise<T> {
  let outcome: TransactionOutcome | undefined;
  let pending: T | undefined;
  try {
    return await inPostgresTransaction(writer, async (transaction) => {
      observeTransactionOutcome(transaction, (next) => { outcome = next; });
      pending = await action(transaction);
      return pending;
    });
  } catch (error) {
    if (outcome === "UNAVAILABLE" && pending !== undefined) {
      try {
        if (await reconcile(pending)) return pending;
      } catch {
        // An unavailable or contradictory readback cannot authorize token release.
      }
    }
    throw error;
  }
}
