/**
 * Fail closed if an old ordinary-runtime API/worker pool or prepared
 * transaction is still connected during the one-way LEGACY cutover.
 * This is an additional catalog gate, not a replacement for operational
 * process drain and network admission fencing outside the database.
 */
export async function assertOptionCLegacyWorkersDrained(client, runtimeRole) {
  const connections = await client.query(
    `SELECT 1 FROM pg_catalog.pg_stat_activity
       WHERE datname=pg_catalog.current_database() AND usename=$1
         AND pid<>pg_catalog.pg_backend_pid() LIMIT 1`,
    [runtimeRole],
  );
  if (connections.rowCount !== 0) {
    throw new Error(
      "Option C cutover requires every legacy runtime SQL pool to be drained.",
    );
  }
  const prepared = await client.query(
    `SELECT 1 FROM pg_catalog.pg_prepared_xacts
       WHERE database=pg_catalog.current_database() AND owner=$1 LIMIT 1`,
    [runtimeRole],
  );
  if (prepared.rowCount !== 0) {
    throw new Error(
      "Option C cutover requires no legacy runtime prepared transactions.",
    );
  }
}
