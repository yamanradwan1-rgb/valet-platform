import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createRuntimePostgresPool,
  type PostgresPool,
} from "../src/common/database/postgres";
import { runtimePoolSnapshot } from "../src/common/database/bounded-postgres-pool";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { listManagementAlertPreview } from "../src/modules/dashboard/management-alert-preview-query";
import { assertCurrentMixedTaskReasons } from "./management-alert-aggregate-exact";
import { ManagementAlertMfaFixture } from "./management-alert-mfa-fixture";
import { seedAlertAggregateIncidentHistory } from "./management-alert-aggregate-perf-seed";
import { seedManagementAlertMixedSources } from "./management-alert-aggregate-mixed-seed";
import { seedManagementAlertTaskHistory } from "./management-alert-aggregate-task-seed";
import {
  captureAggregatePlans,
  persistAggregateMetrics,
  recordAggregateMetric,
} from "./management-alert-aggregate-evidence";
import { assertScenarioPresenceStillLive } from "./management-alert-aggregate-liveness";

/**
 * Explicit opt-in only: local PG17, runtime-role, MFA bypass OFF, 2 densities
 * and both Management audiences. Do not infer production cadence or capacity.
 */
const profileEnabled = process.env.ISSUE414_PG_AGGREGATE_PROFILE === "enabled";
const fixture = new ManagementAlertMfaFixture();
const savedCutover =
  process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER;
let pool: PostgresPool;
let observedPostgresVersion = 0;

interface Scenario {
  readonly density: "sparse" | "dense";
  readonly organizationId: string;
  readonly locationId: string;
  readonly caMembershipId: string;
  readonly lmMembershipId: string;
  readonly expectedPresenceCount: number;
  readonly alt02TaskId: string;
  readonly alt03TaskId: string;
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
  // A five-source profile cannot begin with an already expired Presence case.
  await assertScenarioPresenceStillLive(pool, scenario, role);
  for (let i = 0; i < warmups; i += 1) await readOne(scenario, role);
  const samples: number[] = [];
  let groupPeakWaitingObserved = 0;
  let groupPeakActiveObserved = 0;
  const before = runtimePoolSnapshot(pool);
  // Sample DURING in-flight requests; sampling only after reads complete would
  // systematically miss acquisition pressure. Observed peaks are approximate
  // under the event-loop sampler, not guaranteed database-level maxima.
  const samplePool = () => {
    groupPeakWaitingObserved = Math.max(
      groupPeakWaitingObserved,
      pool.waitingCount,
    );
    groupPeakActiveObserved = Math.max(
      groupPeakActiveObserved,
      pool.totalCount - pool.idleCount,
    );
  };
  const sampler = setInterval(samplePool, 1);
  try {
    await Promise.all(
      Array.from({ length: concurrency }, async (_, lane) => {
        for (let index = lane; index < measured; index += concurrency) {
          samplePool();
          samples.push(await readOne(scenario, role));
          samplePool();
        }
      }),
    );
  } finally {
    clearInterval(sampler);
    samplePool();
  }
  expect(samples).toHaveLength(measured);
  const after = runtimePoolSnapshot(pool);
  // Source reviewability expires independently of Incident/Task state. The
  // 420s test timeout must NEVER allow a stale benchmark to report success.
  await assertScenarioPresenceStillLive(pool, scenario, role);
  const metricDelta = (
    key: "lockTimeouts" | "queryTimeouts" | "acquisitionTimeouts",
  ) => {
    const initial = before[key];
    const final = after[key];
    if (initial === undefined || final === undefined) {
      throw new Error("Bounded PostgreSQL pool metrics are unavailable.");
    }
    return final - initial;
  };
  recordAggregateMetric({
    suite: "issue414-pg17-authorized-aggregate",
    postgresServerVersionNum: observedPostgresVersion,
    density: scenario.density,
    audience: role === "ca" ? "COMPANY_ADMIN_MFA" : "LOCATION_MANAGER",
    concurrency,
    warmups,
    measured,
    ...percentiles(samples),
    groupPeakWaitingObserved,
    groupPeakActiveObserved,
    poolLifetimePeakAdmitted: after.peakAdmitted,
    poolLifetimePeakActive: after.peakActive,
    lockTimeoutDelta: metricDelta("lockTimeouts"),
    queryTimeoutDelta: metricDelta("queryTimeouts"),
    acquisitionTimeoutDelta: metricDelta("acquisitionTimeouts"),
  });
}

describe.skipIf(!profileEnabled)(
  "Issue #414 P1 actual aggregate PG17 benchmark",
  () => {
    beforeAll(async () => {
      await fixture.start();
      const version = await fixture.query<{ versionNum: number }>(
        `SELECT current_setting('server_version_num')::integer AS "versionNum"`,
      );
      observedPostgresVersion = version.rows[0]!.versionNum;
      expect(observedPostgresVersion).toBeGreaterThanOrEqual(170000);
      expect(observedPostgresVersion).toBeLessThan(180000);
      pool = createRuntimePostgresPool(fixture.runtimeDatabaseUrl());
      const serverClock = await fixture.query<{ now: Date }>(
        "SELECT clock_timestamp()::timestamptz(3) AS now",
      );
      process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER =
        serverClock.rows[0]!.now.toISOString();

      const specifications = [
        { density: "sparse" as const, active: 2, mixed: 2, history: 10 },
        // Ten cases per family keep BOTH folded ALT-02/03 reasons inside
        // their shared LIMIT 21 while 80 current Incidents and 400 historic
        // Tasks still exercise dense scan and critical-first pagination.
        { density: "dense" as const, active: 80, mixed: 10, history: 400 },
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
        const worker = await seedManagementAlertMixedSources(
          fixture.databasePool(),
          {
            organizationId: admin.membership.organizationId,
            locationId: admin.location.locationId,
            reporterMembershipId: admin.membership.membershipId,
            ownerUserIds: [admin.user.id, manager.user.id],
            eligiblePerFamily: spec.mixed,
            historicalTasks: spec.history,
          },
        );
        const tasks = await seedManagementAlertTaskHistory(
          fixture.databasePool(),
          {
            organizationId: admin.membership.organizationId,
            locationId: admin.location.locationId,
            workerMembershipId: worker.membershipId,
            eligiblePerReason: spec.mixed,
            historicalTasks: spec.history,
          },
        );
        await fixture.query(
          `ANALYZE tasks; ANALYZE dispatch_events; ANALYZE audit_events;
           ANALYZE retrieval_requests; ANALYZE incidents;
           ANALYZE shift_presence_exceptions`,
        );
        scenarios.push({
          density: spec.density,
          organizationId: admin.membership.organizationId,
          locationId: admin.location.locationId,
          caMembershipId: admin.membership.membershipId,
          lmMembershipId: manager.membershipId,
          expectedPresenceCount: spec.mixed,
          alt02TaskId: tasks.alt02Id,
          alt03TaskId: tasks.alt03Id,
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
          expectedCount: Math.min(20, spec.active + 4 * spec.mixed),
          expectedHasMore: spec.active + 4 * spec.mixed > 20,
        });
      }
      await assertCurrentMixedTaskReasons(pool, scenarios);
      // The sparse cohort fits in a 20-row preview: unlike an incident-only
      // benchmark it proves that all five approved sources are LIVE together.
      const sparse = scenarios.find((entry) => entry.density === "sparse")!;
      for (const role of ["ca", "lm"] as const) {
        const result = await listManagementAlertPreview(pool, {
          context: sparse[role],
          locationId: sparse.locationId,
        });
        expect(result.items.map((item) => item.category).sort()).toEqual(
          [
            "ALT-01",
            "ALT-01",
            "ALT-02",
            "ALT-02",
            "ALT-03",
            "ALT-03",
            "ALT-08",
            "ALT-08",
            "ALT-12",
            "ALT-12",
          ].sort(),
        );
      }
    }, 180_000);

    afterAll(async () => {
      try {
        try {
          await pool?.end();
        } finally {
          // Cleanup the disposable DB, runtime role, Nest app and MFA env
          // even when the profiling pool fails during termination.
          await fixture.stop();
        }
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
      // No complete EXPLAIN/metric artifacts are written before the entire
      // measured workload and source-liveness validations pass.
      await captureAggregatePlans(pool, scenarios, observedPostgresVersion);
      persistAggregateMetrics();
    }, 420_000);
  },
);
