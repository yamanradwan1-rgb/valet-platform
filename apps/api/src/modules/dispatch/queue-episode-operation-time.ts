import type { PostgresTransaction } from "../../common/database/postgres";

/**
 * Queue/requeue eligibility begins after all operation locks are acquired.
 * transaction_timestamp() would refer to BEGIN, before a blocked row lock.
 */
export async function loadPostLockQueueEpisodeTime(
  tx: PostgresTransaction,
): Promise<Date> {
  const result = await tx.query<{ operation_time: Date }>(
    `SELECT clock_timestamp()::timestamptz(3) AS operation_time`,
  );
  const operationTime = result.rows[0]?.operation_time;
  if (operationTime === undefined) {
    throw new Error("Database did not provide a Queue episode timestamp.");
  }
  return operationTime;
}
