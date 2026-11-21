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
                  if (
                    sql.includes("shift_presence_operations") ||
                    sql.includes("shift_presence_management_results")
                  )
                    accessedOperation = true;
                  if (sql === "COMMIT" && accessedOperation) {
                    await client.end();
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
