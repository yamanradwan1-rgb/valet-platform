import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createRuntimePostgresPool,
  type PostgresPool,
} from "../src/common/database/postgres";
import { runtimePoolSnapshot } from "../src/common/database/bounded-postgres-pool";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { listManagementAlertPreview } from "../src/modules/dashboard/management-alert-preview-query";
import { ManagementAlertMfaFixture } from "./management-alert-mfa-fixture";
import { seedAlertAggregateIncidentHistory } from "./management-alert-aggregate-perf-seed";

/**
 * Explicit opt-in only: local PG17, runtime-role, MFA bypass OFF, 2 densities
 * and both Management audiences. Do not infer production cadence or capacity.
 */
const profileEnabled = process.env.ISSUE414_PG_AGGREGATE_PROFILE === "enabled";
const fixture = new ManagementAlertMfaFixture();
const savedCutover =
  process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER;
let pool: PostgresPool;

interface Scenario {
  readonly density: "sparse" | "dense";
  readonly locationId: string;
  readonly ca: StaffSessionContext;
  readonly lm: StaffSessionContext;
  readonly expectedCount: number;
  readonly expectedHasMore: boolean;
}

let scenarios: Scenario[] = [];

const percentiles = (samples: readonly number[]) => {
  const values = [...samples].sort((a, b) => a - b);
  const at = (fraction: number) =>
    Number(values[Math.ceil(values.length * fraction) - 1]!.toFixed(3));
  return { p50Ms: at(0.5), p95Ms: at(0.95), maxMs: at(1) };
};

async function readOne(scenario: Scenario, role: "ca" | "lm"): Promise<number> {
  const started = performance.now();
  const result = await listManagementAlertPreview(pool, {
    context: scenario[role],
    locationId: scenario.locationId,
  });
  expect(result.count).toBe(scenario.expectedCount);
  expect(result.hasMore).toBe(scenario.expectedHasMore);
  expect(result.items).toHaveLength(scenario.expectedCount);
  return performance.now() - started;
}

async function measure(
  scenario: Scenario,
  role: "ca" | "lm",
  concurrency: number,
): Promise<void> {
  const warmups = 20;
  const measured = 100;
  for (let i = 0; i < warmups; i += 1) await readOne(scenario, role);
  const samples: number[] = [];
  let peakWaiting = 0;
  const before = runtimePoolSnapshot(pool);
  await Promise.all(
    Array.from({ length: concurrency }, async (_, lane) => {
      for (let index = lane; index < measured; index += concurrency) {
        samples.push(await readOne(scenario, role));
        peakWaiting = Math.max(peakWaiting, pool.waitingCount);
      }
    }),
  );
  expect(samples).toHaveLength(measured);
  const after = runtimePoolSnapshot(pool);
  console.info(
    JSON.stringify({
      suite: "issue414-pg17-authorized-aggregate",
      density: scenario.density,
      audience: role === "ca" ? "COMPANY_ADMIN_MFA" : "LOCATION_MANAGER",
      concurrency,
      warmups,
      measured,
      ...percentiles(samples),
      peakWaiting,
      peakAdmitted: after.peakAdmitted,
      peakActive: after.peakActive,
      lockTimeoutDelta: after.lockTimeouts - before.lockTimeouts,
      queryTimeoutDelta: after.queryTimeouts - before.queryTimeouts,
      acquisitionTimeoutDelta:
        after.acquisitionTimeouts - before.acquisitionTimeouts,
    }),
  );
}

describe.skipIf(!profileEnabled)(
  "Issue #414 P1 actual aggregate PG17 benchmark",
  () => {
    beforeAll(async () => {
      await fixture.start();
      pool = createRuntimePostgresPool(fixture.runtimeDatabaseUrl());
      const serverClock = await fixture.query<{ now: Date }>(
        "SELECT clock_timestamp()::timestamptz(3) AS now",
      );
      process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER =
        serverClock.rows[0]!.now.toISOString();

      const specifications = [
        { density: "sparse" as const, active: 2, history: 10 },
        { density: "dense" as const, active: 80, history: 400 },
      ];
      scenarios = [];
      for (const spec of specifications) {
        const admin = await fixture.createAssuredAdmin();
        const manager = await fixture.createManager(
          admin.membership.organizationId,
        );
        await fixture.grantLocation(
          admin.membership.organizationId,
          manager.membershipId,
          admin.location.locationId,
        );
        await seedAlertAggregateIncidentHistory(fixture.databasePool(), {
          organizationId: admin.membership.organizationId,
          locationId: admin.location.locationId,
          reporterMembershipId: admin.membership.membershipId,
          activeCount: spec.active,
          historicalCount: spec.history,
        });
        scenarios.push({
          density: spec.density,
          locationId: admin.location.locationId,
          ca: await fixture.contextFor(
            admin.auth.accessToken,
            admin.auth.sessionId,
            admin.user.id,
          ),
          lm: await fixture.contextFor(
            manager.auth.accessToken,
            manager.auth.sessionId,
            manager.user.id,
          ),
          expectedCount: Math.min(20, spec.active),
          expectedHasMore: spec.active > 20,
        });
      }
    }, 180_000);

    afterAll(async () => {
      try {
        await pool?.end();
        await fixture.stop();
      } finally {
        if (savedCutover === undefined)
          delete process.env
            .MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER;
        else
          process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER =
            savedCutover;
      }
    }, 120_000);

    it("records sparse/dense CA/LM p50/p95/max and pool/locks at 4/8/16", async () => {
      for (const scenario of scenarios) {
        for (const role of ["ca", "lm"] as const) {
          for (const concurrency of [4, 8, 16]) {
            await measure(scenario, role, concurrency);
          }
        }
      }
    }, 420_000);
  },
);
