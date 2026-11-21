import type { Pool, PoolClient } from "pg";

export async function backendPid(client: PoolClient): Promise<number> {
  const result = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  return result.rows[0]!.pid;
}

export async function waitsForBackend(pool: Pool, blocker: number, waiter: number): Promise<boolean> {
  const result = await pool.query<{ waiting: boolean }>(
    "SELECT $1::int = ANY(pg_blocking_pids($2::int)) AS waiting",
    [blocker, waiter],
  );
  return result.rows[0]?.waiting === true;
}
