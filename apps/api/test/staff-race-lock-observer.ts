import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

import type { Client, Pool, PoolClient } from "pg";

// Register and handle a request in the same synchronous turn it is created.
// Await the original promise later to preserve its success/error assertions.
export function trackStaffRaceRequest<T>(
  requests: Promise<unknown>[],
  request: Promise<T>,
): Promise<T> {
  requests.push(request);
  void request.catch(() => undefined);
  return request;
}

export function staffRacePoolBarrierCloser(client: PoolClient) {
  let closed = false;
  return {
    async close(outcome: "COMMIT" | "ROLLBACK"): Promise<void> {
      if (closed) return;
      closed = true;
      try {
        await client.query(outcome);
      } catch (error) {
        // A failed transaction terminator leaves its state uncertain. Never
        // let pg-pool hand that connection to a subsequent test.
        try {
          client.release(true);
        } catch {
          // Keep the original PostgreSQL failure as the test verdict.
        }
        throw error;
      }
      client.release();
    },
  };
}

// One-shot transaction teardown for test-held barriers. The first attempt,
// including a failed COMMIT, owns closing the connection; later failure
// cleanup must neither issue SQL on an ended client nor shadow the test error.
export function staffRaceBarrierCloser(client: Client) {
  let closed = false;
  return {
    async close(outcome: "COMMIT" | "ROLLBACK"): Promise<void> {
      if (closed) return;
      closed = true;
      try {
        await client.query(outcome);
      } catch (error) {
        // These proof barriers use a standalone Client, never a pooled one.
        // Destroy it while preserving the failed SQL operation as the cause.
        await client.end().catch(() => undefined);
        throw error;
      }
      await client.end();
    },
  };
}

// The test runners use distinct PostgreSQL roles. pg_stat_activity's state,
// query and wait_event_type are masked across them, so the old global lock
// counts could not establish that the competing operation actually queued.
// Follow only the real pg_blocking_pids tree rooted at the transaction held
// by this test, including waiters queued behind an earlier waiter.
export async function waitForStaffRaceBlockingTree(
  observer: Pick<Pool, "query">,
  blocker: Pick<Client, "query"> | number,
  expected: number,
  timeoutMs = 10_000,
): Promise<void> {
  const blockerPid =
    typeof blocker === "number"
      ? blocker
      : (
          await blocker.query<{ pid: number }>(
            "SELECT pg_backend_pid() AS pid",
          )
        ).rows[0]?.pid;
  if (
    blockerPid === undefined ||
    !Number.isSafeInteger(blockerPid) ||
    blockerPid <= 0 ||
    !Number.isSafeInteger(expected) ||
    expected < 1 ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1
  ) {
    throw new Error("Invalid Staff race blocker PID or waiter expectation.");
  }

  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const result = await observer.query<{ count: number }>(
      `WITH RECURSIVE blocked(pid) AS (
         SELECT $1::integer
         UNION
         SELECT waiting.pid
         FROM pg_stat_activity AS waiting
         JOIN blocked AS parent ON parent.pid = ANY(pg_blocking_pids(waiting.pid))
         WHERE waiting.datname = current_database()
       )
       SELECT (count(*) - 1)::integer AS count FROM blocked`,
      [blockerPid],
    );
    if ((result.rows[0]?.count ?? 0) >= expected) return;
    await delay(Math.min(20, Math.max(1, deadline - performance.now())));
  }
  throw new Error(
    `Expected ${expected} real PostgreSQL waiter(s) behind Staff race PID ${blockerPid}.`,
  );
}
