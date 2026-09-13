import type { PostgresTransaction } from "../../common/database/postgres";

/** Production always uses DB time; the optional value is a deterministic test seam. */
export async function readIncidentDatabaseTime(
  transaction: PostgresTransaction,
  controlledTime?: Date,
): Promise<Date> {
  const result =
    controlledTime === undefined
      ? await transaction.query<{ database_now: Date }>(
          `SELECT clock_timestamp() AS database_now`,
        )
      : await transaction.query<{ database_now: Date }>(
          `SELECT $1::timestamptz AS database_now`,
          [controlledTime],
        );
  return result.rows[0]!.database_now;
}
