import {
  beginTransactionOutcomes,
  finishTransactionOutcomes,
} from "./postgres-transaction-outcome";
import type { PostgresPool } from "./postgres";
import type { PostgresTransaction } from "./postgres";
import {
  isGuestDatabaseOperation,
  remainingDatabaseOperationMs,
} from "./runtime-database-deadline";
import { runtimeDatabaseBudgets } from "./runtime-postgres-policy";

export async function inPostgresTransaction<T>(
  pool: PostgresPool,
  action: (transaction: PostgresTransaction) => Promise<T>,
): Promise<T> {
  const transaction = await pool.connect();
  let unusable = false;
  let shortened = false;
  let committing = false;
  beginTransactionOutcomes(transaction);
  try {
    const remaining = remainingDatabaseOperationMs();
    if (
      isGuestDatabaseOperation() &&
      remaining < runtimeDatabaseBudgets.transactionMs
    ) {
      shortened = true;
      // PostgreSQL arms transaction_timeout at transaction start, not a later SET LOCAL.
      // A separate autocommit SET must finish before BEGIN starts the protected work.
      await transaction.query(`SET transaction_timeout = '${remaining}ms'`);
    }
    await transaction.query("BEGIN");
    const result = await action(transaction);
    if (isGuestDatabaseOperation()) remainingDatabaseOperationMs();
    committing = true;
    await transaction.query("COMMIT");
    finishTransactionOutcomes(transaction, "COMMITTED");
    return result;
  } catch (error) {
    if (committing) unusable = true;
    try {
      await transaction.query("ROLLBACK");
      finishTransactionOutcomes(
        transaction,
        committing ? "UNAVAILABLE" : "ROLLED_BACK",
      );
    } catch {
      unusable = true;
      finishTransactionOutcomes(transaction, "UNAVAILABLE");
    }
    throw error;
  } finally {
    if (shortened && !unusable) {
      try {
        await transaction.query("RESET transaction_timeout");
      } catch {
        // A deadline-expired or disconnected lease cannot be recycled with changed settings.
        unusable = true;
      }
    }
    if (unusable) transaction.release(true);
    else transaction.release();
  }
}
