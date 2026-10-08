import type { PostgresPool } from "./postgres";
import type { PostgresTransaction } from "./postgres";
import { remainingDatabaseOperationMs } from "./runtime-database-deadline";
import { runtimeDatabaseBudgets } from "./runtime-postgres-policy";

export async function inPostgresTransaction<T>(
  pool: PostgresPool,
  action: (transaction: PostgresTransaction) => Promise<T>,
): Promise<T> {
  const transaction = await pool.connect();
  let unusable = false;
  let shortened = false;
  try {
    const remaining = remainingDatabaseOperationMs();
    if (remaining < runtimeDatabaseBudgets.transactionMs) {
      shortened = true;
      // PostgreSQL arms transaction_timeout at transaction start, not a later SET LOCAL.
      // A separate autocommit SET must finish before BEGIN starts the protected work.
      await transaction.query(`SET transaction_timeout = '${remaining}ms'`);
    }
    await transaction.query("BEGIN");
    const result = await action(transaction);
    await transaction.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await transaction.query("ROLLBACK");
    } catch {
      unusable = true;
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
