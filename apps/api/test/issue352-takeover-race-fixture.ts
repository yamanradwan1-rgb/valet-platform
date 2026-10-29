import type { Pool } from "pg";

import type { Issue352TakeoverTestContext } from "./issue352-takeover-test-context";

/** Holds the actual PostgreSQL transaction after its writes, immediately before COMMIT. */
export function holdTakeoverCommit(
  pool: Pool,
  mode: "commit" | "rollback" | "lost-response" = "commit",
) {
  let entered!: () => void;
  let release!: () => void;
  const held = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Issue #352 transaction did not reach COMMIT.")),
      15_000,
    );
    timeout.unref();
    entered = () => {
      clearTimeout(timeout);
      resolve();
    };
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const wrapped = new Proxy(pool, {
    get(target, key) {
      if (key === "connect") {
        return async () => {
          const connection = await target.connect();
          return new Proxy(connection, {
            get(client, property) {
              if (property === "query") {
                return async (...args: unknown[]) => {
                  if (args[0] === "COMMIT") {
                    entered();
                    await gate;
                    if (mode === "rollback") {
                      throw new Error("Test-controlled pre-COMMIT failure.");
                    }
                    const outcome = await Reflect.apply(client.query, client, args);
                    if (mode === "lost-response") {
                      throw new Error("Test-controlled lost response after COMMIT.");
                    }
                    return outcome;
                  }
                  return Reflect.apply(client.query, client, args);
                };
              }
              const value = Reflect.get(client, property);
              return typeof value === "function" ? value.bind(client) : value;
            },
          });
        };
      }
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { pool: wrapped, held, release };
}

export async function waitForIssue352DatabaseLock(
  context: Issue352TakeoverTestContext,
) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const blocked = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM pg_stat_activity
       WHERE datname = current_database() AND pid <> pg_backend_pid()
         AND wait_event_type = 'Lock'`,
    );
    if ((blocked.rows[0]?.count ?? 0) >= 1) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Competing Issue #352 SQL did not block on PostgreSQL.");
}
