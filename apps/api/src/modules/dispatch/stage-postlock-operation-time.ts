import type { PostgresTransaction } from "../../common/database/postgres";

/** Only for phase-entry commands after their authorization and row locks. */
export async function loadPostLockStageTime(
  transaction: PostgresTransaction,
): Promise<Date> {
  const result = await transaction.query<{ operation_time: Date }>(
    `SELECT clock_timestamp()::timestamptz(3) AS operation_time`,
  );
  const value = result.rows[0]?.operation_time;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Database did not provide a phase-entry timestamp.");
  }
  return value;
}
