import type { INestApplication } from "@nestjs/common";
import assert from "node:assert/strict";
import type { Pool } from "pg";

import { runtimePoolSnapshot } from "../src/common/database/bounded-postgres-pool";
import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import type { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

/** Test fixture uses a TS-private field, not #private. Fail if it changes. */
export function issue414MountedApp(fixture: ManagementControlPlaneTestFixture) {
  const app = Reflect.get(fixture, "app") as INestApplication | undefined;
  assert.ok(
    app?.getHttpServer,
    "Real mounted Nest test server is unavailable.",
  );
  const address = app.getHttpServer().address() as { port?: number } | null;
  assert.ok(address?.port && address.port > 1024);
  const pool = app.get<Pool>(RUNTIME_POSTGRES_POOL, { strict: false });
  assert.ok(pool?.connect, "Mounted app's actual runtime PG pool is missing.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    pool,
  };
}

/**
 * Observational evidence: 200ms probes can miss short waits. The pool
 * metrics are from the ACTUAL mounted HTTP server, not a separate test pool.
 */
export async function issue414ObserveHttpPool(
  fixture: ManagementControlPlaneTestFixture,
  pool: Pool,
): Promise<() => Promise<Record<string, unknown>>> {
  const role = (
    await pool.query<{ role: string }>("SELECT current_user::text AS role")
  ).rows[0]?.role;
  assert.ok(role);
  const deadlocksBefore = await fixture.query<{ deadlocks: string }>(
    "SELECT deadlocks::text FROM pg_stat_database WHERE datname=current_database()",
  );
  const before = runtimePoolSnapshot(pool);
  let peakActiveObserved = 0;
  let peakWaitingObserved = 0;
  let peakLockedBackends = 0;
  let postgresActivePeak = 0;
  let positiveLockSamples = 0;
  let pgSamples = 0;
  const errors = new Set<string>();
  let pending: Promise<void> | undefined;
  let stopped = false;
  const poll = () => {
    const snap = runtimePoolSnapshot(pool);
    peakActiveObserved = Math.max(peakActiveObserved, snap.active);
    peakWaitingObserved = Math.max(peakWaitingObserved, snap.waiting);
    if (pending || stopped) return;
    pending = fixture
      .query<{ locked: string; active: string }>(
        `SELECT count(*) FILTER (WHERE wait_event_type='Lock')::text AS locked,
              count(*) FILTER (WHERE state='active')::text AS active
       FROM pg_stat_activity
       WHERE datname=current_database() AND usename=$1`,
        [role],
      )
      .then((result) => {
        const locked = Number(result.rows[0]?.locked ?? 0);
        const active = Number(result.rows[0]?.active ?? 0);
        pgSamples += 1;
        if (locked > 0) positiveLockSamples += 1;
        peakLockedBackends = Math.max(peakLockedBackends, locked);
        postgresActivePeak = Math.max(postgresActivePeak, active);
      })
      .catch((error: unknown) => {
        errors.add(error instanceof Error ? error.name : "UNKNOWN");
      })
      .finally(() => {
        pending = undefined;
      });
  };
  const timer = setInterval(poll, 200);
  timer.unref();
  poll();
  return async () => {
    stopped = true;
    clearInterval(timer);
    if (pending) await pending;
    const after = runtimePoolSnapshot(pool);
    const deadlocksAfter = await fixture.query<{ deadlocks: string }>(
      "SELECT deadlocks::text FROM pg_stat_database WHERE datname=current_database()",
    );
    return {
      actualMountedPoolMax: after.configuredMax,
      observedPeakPoolActive: peakActiveObserved,
      observedPeakPoolWaiting: peakWaitingObserved,
      cumulativePoolPeakAdmitted: after.peakAdmitted,
      cumulativePoolPeakWaiting: after.peakWaiting,
      acquisitionTimeoutsDelta:
        (after.acquisitionTimeouts ?? 0) - (before.acquisitionTimeouts ?? 0),
      queryTimeoutsDelta:
        (after.queryTimeouts ?? 0) - (before.queryTimeouts ?? 0),
      lockTimeoutsDelta: (after.lockTimeouts ?? 0) - (before.lockTimeouts ?? 0),
      statementTimeoutsDelta:
        (after.statementTimeouts ?? 0) - (before.statementTimeouts ?? 0),
      deadlocksDelta:
        Number(deadlocksAfter.rows[0]?.deadlocks ?? 0) -
        Number(deadlocksBefore.rows[0]?.deadlocks ?? 0),
      pgActivitySamplerIntervalMs: 200,
      pgActivitySamples: pgSamples,
      positiveLockSamples,
      peakLockedBackends,
      peakPgActiveBackends: postgresActivePeak,
      samplerErrors: [...errors],
    };
  };
}
