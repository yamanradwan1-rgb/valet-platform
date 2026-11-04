import type { PoolClient } from "pg";

import type { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

/** Deterministic wait witness on real PostgreSQL; no timing-based race guess. */
export async function waitForAlertTimingAdvisoryWait(
  fixture: ManagementControlPlaneTestFixture,
  lockFamily: "management-alert-timing:" | "staff-user-security:",
  minimum = 1,
): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const blocked = await fixture.query<{ blocked: number }>(
      `SELECT count(DISTINCT activity.pid)::int AS blocked
       FROM pg_stat_activity AS activity
       JOIN pg_locks AS wait ON wait.pid = activity.pid
       WHERE activity.datname = current_database()
         AND activity.state = 'active'
         AND activity.wait_event_type = 'Lock'
         AND wait.locktype = 'advisory'
         AND NOT wait.granted
         AND activity.query LIKE '%' || $1::text || '%'`,
      [lockFamily],
    );
    if ((blocked.rows[0]?.blocked ?? 0) >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `Expected a pending ${lockFamily} advisory lock (PG wait not seen).`,
  );
}

/** External lock is test-only; real API must still reauthorize normally. */
export async function blockAlertTimingPreference(
  fixture: ManagementControlPlaneTestFixture,
  organizationId: string,
  userId: string,
): Promise<PoolClient> {
  const client = await fixture.databasePool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(
         hashtextextended('management-alert-timing:' || $1::text || ':' || $2::text, 0)
       )`,
      [organizationId, userId],
    );
    return client;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    throw error;
  }
}

export async function releaseAlertTimingBlock(client: PoolClient) {
  try {
    await client.query("COMMIT");
  } finally {
    client.release();
  }
}
