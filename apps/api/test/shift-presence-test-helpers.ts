import { setImmediate } from "node:timers/promises";

import type { Pool, PoolClient } from "pg";

/** Observe the real PostgreSQL lock wait, not a timer-based race guess. */
export async function waitForPresenceLock(_pool: Pool, client: PoolClient) {
  const { rows } = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  return rows[0]!.pid;
}

export async function observePresenceLock(pool: Pool, pid: number) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ blocked: boolean }>(
      `SELECT wait_event_type='Lock' AS blocked FROM pg_stat_activity WHERE pid=$1`, [pid],
    );
    if (result.rows[0]?.blocked) return;
    await setImmediate();
  }
  throw new Error("Expected deterministic PostgreSQL lock barrier was not reached.");
}

export async function presenceTransaction<T>(pool: Pool, execute: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await execute(client);
    await client.query("COMMIT");
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
