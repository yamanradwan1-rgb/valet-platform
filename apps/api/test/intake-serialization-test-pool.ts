import type { Pool, PoolClient } from "pg";

/** Decorate only the test's command transaction; never create another pool. */
export function observeIntakeQueries(
  pool: Pool,
  observe: (sql: string, run: () => Promise<unknown>) => Promise<unknown>,
): Pool {
  return {
    connect: async () => {
      const client = await pool.connect();
      return new Proxy(client, {
        get(target, property) {
          if (property === "query")
            return (...args: unknown[]) => {
              const sql = typeof args[0] === "string" ? args[0] : "OTHER";
              return observe(sql, () =>
                Reflect.apply(target.query, target, args),
              );
            };
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as PoolClient;
    },
  } as Pool;
}

export function abortIntakeCommits(
  pool: Pool,
  count: number,
  afterRollback: () => Promise<void> = async () => {},
) {
  let aborts = 0;
  let attempts = 0;
  const codes: string[] = [];
  // Retain the current transaction only within its own query callback.
  const wrapped = {
    connect: async () => {
      const client = await pool.connect();
      return observeIntakeQueries(
        { connect: async () => client } as Pool,
        async (sql, run) => {
          if (sql.startsWith("BEGIN")) attempts += 1;
          if (sql === "COMMIT" && aborts < count) {
            aborts += 1;
            try {
              await client.query(`DO $abort$ BEGIN
                RAISE EXCEPTION 'controlled intake serialization abort'
                USING ERRCODE = '40001'; END $abort$`);
            } catch (error) {
              codes.push(String((error as { code?: unknown }).code));
              throw error;
            }
          }
          const result = await run();
          if (sql === "ROLLBACK") await afterRollback();
          return result;
        },
      ).connect();
    },
  } as Pool;
  return { pool: wrapped, codes, attempts: () => attempts };
}
