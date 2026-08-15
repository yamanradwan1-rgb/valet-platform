import type { PostgresPool, PostgresTransaction } from "./postgres";

export async function inPostgresTransaction<T>(
  pool: PostgresPool,
  operation: (transaction: PostgresTransaction) => Promise<T>,
): Promise<T> {
  const transaction = await pool.connect();
  try {
    await transaction.query("BEGIN");
    const result = await operation(transaction);
    await transaction.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await transaction.query("ROLLBACK");
    } catch {
      // Preserve the original operation failure.
    }
    throw error;
  } finally {
    transaction.release();
  }
}
