import type { Pool } from "pg";

/** Force an old real PostgreSQL snapshot to exercise the defensive INSERT-loser path.
 * All authority/row locks remain intact; no query result or unique failure is fabricated.
 */
export function convergenceSnapshotPool(pool: Pool) {
  const uniqueViolations: string[] = [];
  let first = true;
  let reached!: (pid: number) => void;
  let resume!: () => void;
  const snapshot = new Promise<number>((resolve) => { reached = resolve; });
  const released = new Promise<void>((resolve) => { resume = resolve; });
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
                    if (sql === "BEGIN" && first) {
                      first = false;
                      const result = await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
                      // Pin the real snapshot before the competing writer starts.
                      const pinned = await connection.query<{ pid: number }>(
                        "SELECT pg_backend_pid() AS pid, pg_current_snapshot()",
                      );
                      const pid = pinned.rows[0]?.pid;
                      if (pid === undefined || !Number.isSafeInteger(pid) || pid <= 0)
                        throw new Error("Convergence snapshot requires a real backend PID.");
                      reached(pid);
                      await released;
                      return result;
                    }
                    // Recovery must use a fresh ordinary transaction.
                    return await Reflect.apply(connection.query, connection, [sql, ...args]);
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
  return {
    pool: gated,
    uniqueViolations,
    resume,
    waitForSnapshot(request: Promise<unknown>) {
      return Promise.race([
        snapshot,
        request.then(() => { throw new Error("Convergence request settled before snapshot."); }),
      ]);
    },
  };
}
