import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";

export async function inPaymentTransaction<T>(
  pool: PostgresPool,
  operation: (transaction: PostgresTransaction) => Promise<T>,
): Promise<T> {
  return inPostgresTransaction(pool, operation);
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
