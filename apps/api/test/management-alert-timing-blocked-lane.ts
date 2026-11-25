import type { PoolClient } from "pg";

import type { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import { waitForPostgresBlockingEdge } from "./postgres-lock-observer";
import { racePoolTransaction } from "./postgres-race-pool-client";

/** Deterministic wait witness on real PostgreSQL; no timing-based race guess. */
export async function waitForAlertTimingAdvisoryWait(
  fixture: ManagementControlPlaneTestFixture,
  blocker: PoolClient | number,
  mode: "ExclusiveLock" | "ShareLock",
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
  // Verify the same advisory lock tag on the exact holder and waiter, not
  // another advisory lock held or requested by either transaction.
  const witness = await fixture.query<{ matched: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_locks AS waiting
       JOIN pg_locks AS held
         ON held.locktype=waiting.locktype
         AND held.database=waiting.database
         AND held.classid=waiting.classid
         AND held.objid=waiting.objid
         AND held.objsubid=waiting.objsubid
       WHERE waiting.pid=$1 AND held.pid=$2
         AND waiting.locktype='advisory' AND NOT waiting.granted
         AND waiting.mode=$3 AND held.granted AND held.mode='ExclusiveLock'
     ) AS matched`,
    [waiterPid, blockerPid, mode],
  );
  if (witness.rows[0]?.matched !== true) {
    throw new Error("Expected the exact held alert-timing advisory lock dependency.");
  }
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
    await racePoolTransaction(client).close("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function releaseAlertTimingBlock(client: PoolClient, outcome: "COMMIT" | "ROLLBACK" = "COMMIT") {
  await racePoolTransaction(client).close(outcome);
}
