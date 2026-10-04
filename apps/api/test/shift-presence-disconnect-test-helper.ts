import type { PresenceServerTestContext } from "./shift-presence-server-test-context";

/** Terminate the verified protected Presence transaction, not the preceding limiter transaction. */
export function disconnectBeforePresenceCommit(db: PresenceServerTestContext) {
  return new Proxy(db.runtimePool, {
    get(pool, key) {
      if (key === "connect")
        return async () => {
          const connection = await pool.connect();
          let accessedOperation = false;
          connection.on("error", () => undefined);
          return new Proxy(connection, {
            get(client, property) {
              if (property === "query")
                return async (sql: string, ...args: unknown[]) => {
                  if (sql.includes("shift_presence_operations"))
                    accessedOperation = true;
                  if (sql === "COMMIT" && accessedOperation) {
                    const pid = (
                      await client.query<{ pid: number }>(
                        `SELECT pg_backend_pid() AS pid`,
                      )
                    ).rows[0]!.pid;
                    const verified = await db.adminPool.query(
                      `SELECT pid FROM pg_stat_activity WHERE pid=$1 AND datname=$2 AND usename=$3`,
                      [pid, db.databaseName, db.runtimeRole],
                    );
                    if (verified.rowCount !== 1)
                      throw new Error("Unexpected test disconnect target");
                    await db.adminPool.query(
                      `SELECT pg_terminate_backend($1)`,
                      [pid],
                    );
                  }
                  return Reflect.apply(client.query, client, [sql, ...args]);
                };
              const value = Reflect.get(client, property, client);
              return typeof value === "function" ? value.bind(client) : value;
            },
          });
        };
      const value = Reflect.get(pool, key, pool);
      return typeof value === "function" ? value.bind(pool) : value;
    },
  });
}
