import type { Pool, PoolClient } from "pg";

function signal() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
/** Holds a real transaction after selected SQL; the competing command uses another connection. */
export function cancellationSqlBarrier(
  pool: Pool,
  predicate: (sql: string) => boolean,
) {
  const entered = signal();
  const released = signal();
  let pid: number | null = null;
  let held = false;
  const wrapped = new Proxy(pool, {
    get(target, property) {
      if (property !== "connect") {
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async () => {
        const client = await target.connect();
        return new Proxy(client, {
          get(connection, key) {
            if (key !== "query") {
              const value = Reflect.get(connection, key);
              return typeof value === "function"
                ? value.bind(connection)
                : value;
            }
            return async (sql: string, values?: unknown[]) => {
              const result = await connection.query(sql, values);
              if (!held && predicate(sql)) {
                held = true;
                pid = (
                  await connection.query<{ pid: number }>(
                    "SELECT pg_backend_pid() AS pid",
                  )
                ).rows[0]!.pid;
                entered.release();
                await released.promise;
              }
              return result;
            };
          },
        }) as PoolClient;
      };
    },
  });
  return {
    pool: wrapped,
    entered: entered.promise,
    release: released.release,
    async proveBlocked(admin: Pool) {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const result = await admin.query<{ blocked: boolean }>(
          "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) AS blocked",
          [pid],
        );
        if (result.rows[0]?.blocked) return;
        await admin.query("SELECT pg_sleep(0.01)");
      }
      throw new Error(
        "Competing PostgreSQL connection did not demonstrably block.",
      );
    },
  };
}
