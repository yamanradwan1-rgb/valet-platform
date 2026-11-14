// Exclusive per-database session lease. Never treat this as a distributed
// migration cutover or protection against an authorized superuser mutator.
export async function acquireExclusiveOwnedLease(client) {
  const result = await client.query(
    "SELECT pg_catalog.pg_try_advisory_lock(416,26) AS locked, " +
      "(SELECT count(*)::integer FROM pg_catalog.pg_stat_activity " +
      "WHERE datname=current_database() AND pid<>pg_catalog.pg_backend_pid() " +
      "AND backend_type='client backend') AS foreign_sessions, " +
      "(SELECT count(*)::integer FROM pg_catalog.pg_prepared_xacts " +
      "WHERE database=current_database()) AS prepared",
  );
  const state = result.rows[0];
  if (
    result.rowCount !== 1 ||
    state?.locked !== true ||
    state.foreign_sessions !== 0 ||
    state.prepared !== 0
  ) {
    if (state?.locked === true) {
      await client.query("SELECT pg_catalog.pg_advisory_unlock(416,26)");
    }
    throw new Error("W26_PG17_EXCLUSIVE_OWNED_LEASE_UNAVAILABLE");
  }
  return true;
}

export async function releaseExclusiveOwnedLease(client) {
  const result = await client.query(
    "SELECT pg_catalog.pg_advisory_unlock(416,26) AS released",
  );
  if (result.rowCount !== 1 || result.rows[0]?.released !== true) {
    throw new Error("W26_PG17_LEASE_RELEASE_FAILED");
  }
}
