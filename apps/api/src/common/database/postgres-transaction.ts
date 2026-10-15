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
    if (isGuestDatabaseOperation()) {
      // PG16 lacks transaction_timeout. Its bounded lease and operation
      // watchdog still terminate this connection at the request deadline;
      // PG17+ always arms its server-native 5s-or-shorter limit before BEGIN,
      // including early guest requests with their full remaining budget.
      const capability = await transaction.query<{ supports_timeout: boolean }>(
        "SELECT current_setting('server_version_num')::int >= 170000 AS supports_timeout",
      );
      if (capability.rows[0]?.supports_timeout) {
        shortened = true;
        await transaction.query(`SET transaction_timeout = '${remaining}ms'`);
      }
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
