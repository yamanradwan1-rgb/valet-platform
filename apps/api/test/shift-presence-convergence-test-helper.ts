import type { Pool } from "pg";

/** Force an old real PostgreSQL snapshot to exercise the defensive INSERT-loser path.
 * All authority/row locks remain intact; no query result or unique failure is fabricated.
 */
export function convergenceSnapshotPool(pool: Pool) {
  const uniqueViolations: string[] = [];
  const gated = new Proxy(pool, {
    get(target, property) {
      if (property === "connect")
        return async () => {
          const client = await target.connect();
          return new Proxy(client, {
            get(connection, key) {
              if (key === "query")
                return async (sql: string, ...args: unknown[]) => {
                  try {
                    return await Reflect.apply(connection.query, connection, [
                      sql === "BEGIN"
                        ? "BEGIN ISOLATION LEVEL REPEATABLE READ"
                        : sql,
                      ...args,
                    ]);
                  } catch (error) {
                    const failure = error as {
                      code?: string;
                      constraint?: string;
                    };
                    if (
                      failure.code === "23505" &&
                      failure.constraint ===
                        "shifts_one_active_per_membership_idx"
                    )
                      uniqueViolations.push(failure.constraint);
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
  return { pool: gated, uniqueViolations };
}
