import type { PostgresTransaction } from "./postgres";

export async function lockLocationLifecycle(
  transaction: PostgresTransaction,
  locationId: string,
  mode: "EXCLUSIVE" | "SHARED",
): Promise<void> {
  await transaction.query(
    mode === "SHARED"
      ? `SELECT pg_advisory_xact_lock_shared(
           hashtextextended('location-lifecycle:' || $1::text, 0)
         )`
      : `SELECT pg_advisory_xact_lock(
           hashtextextended('location-lifecycle:' || $1::text, 0)
         )`,
    [locationId],
  );
}
