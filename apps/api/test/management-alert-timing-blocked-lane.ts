import type { PoolClient } from "pg";

import type { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import { waitForPostgresBlockingEdge } from "./postgres-lock-observer";
import { waitForAdvisoryLock } from "./management-settings-lock-observer";

/** Deterministic wait witness on real PostgreSQL; no timing-based race guess. */
export async function waitForAlertTimingAdvisoryWait(
  fixture: ManagementControlPlaneTestFixture,
  blocker: PoolClient | number,
): Promise<number> {
  const blockerPid =
    typeof blocker === "number"
      ? blocker
      : (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
          .rows[0]!.pid;
  const [waiterPid] = await waitForPostgresBlockingEdge(
    fixture.databasePool(),
    { blockerPid },
  );
  await waitForAdvisoryLock(
    fixture.databasePool(),
    { backendPid: waiterPid! },
    "ExclusiveLock",
    false,
  );
  return waiterPid!;
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
  } catch (error) {
    client.release(true);
    throw error;
  }
  client.release();
}
