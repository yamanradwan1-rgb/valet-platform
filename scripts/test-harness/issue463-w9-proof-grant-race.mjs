import { createRequire } from "node:module";
import { URL } from "node:url";

const requireDatabase = createRequire(new URL(
  "../../packages/database/package.json", import.meta.url));
const { Client } = requireDatabase("pg");

/** The exact W2 per-DB P2 repeated GRANT under PG17. No authority changes:
 * both isolated DBs already own an identical migrator and membership graph.
 * Concurrent execution after full migrations stresses the cluster catalog
 * without relying on incidental overlap between 157-migration sequences. */
export async function repeatConcurrentOwnerGrants(
  identity, rounds = 12, clientFactory = (configuration) =>
    new Client(configuration),
) {
  const clients = identity.databaseNames.map((database) => clientFactory({
    host: "127.0.0.1", port: identity.port, database,
    user: "valet", password: identity.migratorSecret,
    connectionTimeoutMillis: 5000, query_timeout: 15_000,
  }));
  const grant =
    "GRANT vaylet_rating_feedback_reader_owner," +
    "vaylet_rating_feedback_privacy_owner TO valet " +
    "WITH INHERIT FALSE, SET TRUE, ADMIN FALSE";
  const observed = [];
  try {
    await Promise.all(clients.map((client) => client.connect()));
    const backends = await Promise.all(clients.map((client) =>
      client.query("SELECT pg_backend_pid() AS pid, current_user AS principal")));
    const pids = backends.map((result) => result.rows[0]?.pid);
    if (new Set(pids).size !== 2 || backends.some((result) =>
      result.rows[0]?.principal !== "valet"))
      throw new Error("Grant concurrency requires distinct authenticated backends.");

    for (let attempt = 0; attempt < rounds; attempt += 1) {
      const started = Date.now();
      const results = await Promise.allSettled(clients.map(async (client) => {
        await client.query("BEGIN");
        try {
          await client.query("SET LOCAL lock_timeout = '5s'");
          const result = await client.query(grant);
          // Crucially commit this backend NOW. Waiting for both GRANTs here
          // would itself manufacture a lock timeout on the other backend.
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw error;
        }
      }));
      if (results.some((result) => result.status !== "fulfilled")) {
        const failures = results.filter((result) => result.status === "rejected")
          .map((result) => String(result.reason?.code ??
            result.reason?.message ?? "UNKNOWN"));
        throw new Error(
          `PG17 concurrent same-role GRANT failed in round ${attempt + 1}: ` +
          failures.join(","),
        );
      }
      observed.push({
        round: attempt + 1, elapsedMs: Date.now() - started,
        committed: 2,
      });
    }
    return { rounds, distinctBackends: pids.length, grantCommits: rounds * 2,
      maxElapsedMs: Math.max(...observed.map((item) => item.elapsedMs)) };
  } finally {
    await Promise.allSettled(clients.map((client) => client.end()));
  }
}
