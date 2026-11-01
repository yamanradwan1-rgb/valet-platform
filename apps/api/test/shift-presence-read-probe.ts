import type { Pool } from "pg";

/** Observe actual driver results without substituting SQL or authorization. */
export function presenceReadProbe(pool: Pool, lockTimeoutMs?: number) {
  let busy!: () => void;
  const atBusy = new Promise<void>((resolve) => {
    busy = resolve;
  });
  const statements: string[] = [];
  const errors: string[] = [];
  const observed = new Proxy(pool, {
    get(target, property) {
      if (property === "connect")
        return async () => {
          const client = await target.connect();
          return new Proxy(client, {
            get(connection, key) {
              if (key === "query")
                return async (sql: string, ...args: unknown[]) => {
                  statements.push(sql);
                  try {
                    const result = await Reflect.apply(
                      connection.query,
                      connection,
                      [sql, ...args],
                    );
                    if (sql === "BEGIN" && lockTimeoutMs !== undefined)
                      await connection.query(
                        `SET LOCAL lock_timeout = '${lockTimeoutMs}ms'`,
                      );
                    if (
                      sql.includes("pg_try_advisory_xact_lock(") &&
                      result.rows[0]?.acquired === false
                    )
                      busy();
                    return result;
                  } catch (error) {
                    errors.push(String((error as { code?: string }).code));
                    throw error;
                  }
                };
              const value = Reflect.get(connection, key, connection);
              return typeof value === "function"
                ? value.bind(connection)
                : value;
            },
          });
        };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { pool: observed, atBusy, statements, errors };
}
