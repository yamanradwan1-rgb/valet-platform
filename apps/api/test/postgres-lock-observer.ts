import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

import type { Pool } from "pg";

export interface PostgresBlockingEdge {
  readonly blockerPid: number;
  readonly waiterPid?: number;
  readonly expectedWaiters?: number;
  readonly timeoutMs?: number;
}

// pg_stat_activity's query, state and wait_event_type may be masked across
// roles. pg_blocking_pids exposes a real lock dependency for an exact backend
// PID without requiring pg_read_all_stats or broader role privileges.
export async function waitForPostgresBlockingEdge(
  observer: Pick<Pool, "query">,
  edge: PostgresBlockingEdge,
): Promise<number[]> {
  const {
    blockerPid,
    waiterPid,
    expectedWaiters = 1,
    timeoutMs = 10_000,
  } = edge;
  if (
    !Number.isSafeInteger(blockerPid) ||
    blockerPid <= 0 ||
    (waiterPid !== undefined &&
      (!Number.isSafeInteger(waiterPid) || waiterPid <= 0)) ||
    !Number.isSafeInteger(expectedWaiters) ||
    expectedWaiters < 1 ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1
  ) {
    throw new Error("Invalid PostgreSQL blocking edge observation.");
  }
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const result = await observer.query<{ pid: number }>(
      `SELECT activity.pid
       FROM pg_stat_activity AS activity
       WHERE activity.datname = current_database()
         AND activity.pid <> pg_backend_pid()
         AND $1::integer = ANY(pg_blocking_pids(activity.pid))
         AND ($2::integer IS NULL OR activity.pid = $2::integer)`,
      [blockerPid, waiterPid ?? null],
    );
    const waiters = result.rows.map((row) => row.pid);
    if (waiters.length >= expectedWaiters) return waiters;
    await delay(Math.min(20, Math.max(1, deadline - performance.now())));
  }
  throw new Error(
    `Expected ${expectedWaiters} real PostgreSQL lock waiter(s) behind PID ${blockerPid}.`,
  );
}
