import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";

export async function inPaymentTransaction<T>(
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
      // Preserve the original payment operation failure.
    }
    throw error;
  } finally {
    transaction.release();
  }
}

export async function loadPaymentOperationTime(
  transaction: PostgresTransaction,
): Promise<Date> {
  const result = await transaction.query<{ operation_time: Date }>(
    `SELECT transaction_timestamp()::timestamptz(3) AS operation_time`,
  );
  const operationTime = result.rows[0]?.operation_time;
  if (operationTime === undefined) {
    throw new Error("Database did not provide a payment operation timestamp.");
  }
  return operationTime;
}
