import type { Pool } from "pg";
import type { StaffShiftForceEndTestFixture } from "./staff-shift-force-end-test-fixture";

/** Pause the real executor at COMMIT while its actual PostgreSQL locks remain held. */
export function holdForceEndTestCommit(pool: Pool, rollback = false) {
  let entered!: () => void;
  let release!: () => void;
  const held = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Executor did not reach the commit barrier.")),
      10_000,
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
      if (key === "connect")
        return async () => {
          const client = await target.connect();
          return new Proxy(client, {
            get(connection, property) {
              if (property === "query")
                return async (...args: unknown[]) => {
                  if (args[0] === "COMMIT") {
                    entered();
                    await gate;
                    if (rollback)
                      throw new Error("Test-controlled transaction rollback.");
                  }
                  return Reflect.apply(connection.query, connection, args);
                };
              const value = Reflect.get(connection, property);
              return typeof value === "function"
                ? value.bind(connection)
                : value;
            },
          });
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { pool: wrapped, held, release };
}

export async function waitForceEndTestBlocked(
  fixture: StaffShiftForceEndTestFixture,
  count = 1,
) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await fixture.query<{ n: number }>(`SELECT count(*)::int AS n
      FROM pg_stat_activity WHERE datname=current_database()
      AND pid<>pg_backend_pid() AND wait_event_type='Lock'`);
    if ((result.rows[0]?.n ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Competing PostgreSQL transaction did not block.");
}
