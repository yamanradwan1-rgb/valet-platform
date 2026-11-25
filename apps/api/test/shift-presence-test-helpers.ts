import { setTimeout as pause } from "node:timers/promises";

import type { Pool, PoolClient } from "pg";

interface PresenceLockEdge {
  readonly holderPid: number;
  readonly waiterPid: number;
}

/** Capture the exact two real backend PIDs before starting the competing SQL. */
export async function waitForPresenceLock(
  waiter: PoolClient,
  holder: PoolClient,
): Promise<PresenceLockEdge> {
  const [waiting, holding] = await Promise.all([
    waiter.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"),
    holder.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"),
  ]);
  const waiterPid = waiting.rows[0]?.pid;
  const holderPid = holding.rows[0]?.pid;
  if (!Number.isSafeInteger(waiterPid) ||
      !Number.isSafeInteger(holderPid) || waiterPid === holderPid) {
    throw new Error("Presence lock fixture requires distinct backend PIDs.");
  }
  return { waiterPid: waiterPid!, holderPid: holderPid! };
}

/** pg_stat_activity.wait_event_type is masked across PostgreSQL roles.
 * pg_blocking_pids proves the precise live holder/waiter edge instead.
 */
export async function observePresenceLock(pool: Pool, edge: PresenceLockEdge) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ blocked: boolean }>(
      `SELECT $2::int = ANY(pg_blocking_pids(waiter.pid)) AS blocked
       FROM pg_stat_activity AS waiter
       JOIN pg_stat_activity AS holder ON holder.pid=$2
         AND holder.datname=waiter.datname
       WHERE waiter.pid=$1 AND waiter.datname=current_database()`,
      [edge.waiterPid, edge.holderPid],
    );
    if (result.rows[0]?.blocked === true) return;
    await pause(15);
  }
  throw new Error(
    `Expected PostgreSQL lock held by PID ${edge.holderPid} to block PID ${edge.waiterPid}.`,
  );
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
