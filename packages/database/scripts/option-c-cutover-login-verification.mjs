import pg from "pg";

import { verifyMigrationConnectionTls } from "./database-connection-policy.mjs";

export async function verifyOptionCCutoverLogins(
  { runtimeIdentity, writers },
  migrationConfig,
  nodeEnv,
  createClient = (config) => new pg.Client(config),
) {
  for (const identity of [runtimeIdentity, ...Object.values(writers)]) {
    const client = createClient({
      ...migrationConfig,
      user: identity.role,
      password: identity.password,
      connectionTimeoutMillis: 5_000,
      query_timeout: 5_000,
    });
    try {
      await client.connect();
      await verifyMigrationConnectionTls(client, nodeEnv);
      const result = await client.query(
        `SELECT current_database() AS database, current_user AS principal,
                session_user AS login, pg_catalog.pg_is_in_recovery() AS recovery`,
      );
      const row = result.rows[0];
      if (
        result.rowCount !== 1 ||
        row?.database !== identity.database ||
        row.principal !== identity.role ||
        row.login !== identity.role ||
        row.recovery !== false
      ) {
        throw new Error("Unexpected database login identity.");
      }
    } catch {
      throw new Error(
        `Option C cutover could not attest the configured ${identity.role} login.`,
      );
    } finally {
      await client.end();
    }
  }
}
