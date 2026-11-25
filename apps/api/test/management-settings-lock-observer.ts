import { performance } from "node:perf_hooks";
import { setTimeout as pause } from "node:timers/promises";

import type { Pool } from "pg";

import {
  waitForPostgresBlockingEdge,
  type PostgresBlockingEdge,
} from "./postgres-lock-observer";

type AdvisoryMode = "ExclusiveLock" | "ShareLock";
type AdvisoryLocator = string | { readonly backendPid: number };

async function waitForDatabaseCondition(
  check: () => Promise<boolean>,
  description: string,
): Promise<void> {
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    if ((await check()) && performance.now() <= deadline) return;
    await pause(Math.min(20, Math.max(1, deadline - performance.now())));
  }
  throw new Error(
    "Timed out waiting for PostgreSQL state: " + description + ".",
  );
}

export async function waitForLockWait(
  pool: Pool,
  locator: string | PostgresBlockingEdge,
): Promise<void> {
  if (typeof locator !== "string") {
    await waitForPostgresBlockingEdge(pool, locator);
    return;
  }
  await waitForDatabaseCondition(async () => {
    const result = await pool.query<{ waiting: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
         WHERE datname = current_database()
           AND state = 'active'
           AND wait_event_type = 'Lock'
           AND query ILIKE $1
       ) AS waiting`,
      [`%${locator}%`],
    );
    return result.rows[0]?.waiting === true;
  }, `lock wait for ${locator}`);
}

export function waitForAdvisoryLock(
  pool: Pool,
  locator: AdvisoryLocator,
  mode: AdvisoryMode,
  granted: boolean,
): Promise<void> {
  return waitForDatabaseCondition(
    async () => {
      const byPid = typeof locator !== "string";
      const result = await pool.query<{ matched: boolean }>(
        `SELECT EXISTS (
         SELECT 1
         FROM pg_stat_activity AS activity
         INNER JOIN pg_locks AS held ON held.pid = activity.pid
         WHERE activity.datname = current_database()
           AND ${byPid ? "TRUE" : "activity.state = 'active'"}
           AND ${byPid ? "activity.pid = $1::integer" : "activity.query ILIKE $1"}
           AND held.locktype = 'advisory'
           AND held.mode = $2
           AND held.granted = $3
       ) AS matched`,
        [byPid ? locator.backendPid : `%${locator}%`, mode, granted],
      );
      return result.rows[0]?.matched === true;
    },
    `${granted ? "granted" : "waiting"} ${mode} for ${typeof locator === "string" ? locator : `PID ${locator.backendPid}`}`,
  );
}
