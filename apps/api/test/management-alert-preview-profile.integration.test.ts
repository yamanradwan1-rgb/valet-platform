import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, it } from "vitest";

import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { listManagementAlertPreview } from "../src/modules/dashboard/management-alert-preview-query";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

/** Opt-in representative local PG17 profiling, never a production SLO claim. */
const runProfile = process.env.ISSUE414_PG_PREVIEW_PROFILE === "enabled";
const database = new DashboardOverviewTestContext("414-alert-preview-profile");
let context: StaffSessionContext;
let locationId: string;
let savedCutover: string | undefined;

const percentiles = (times: readonly number[]) => {
  const sorted = [...times].sort((a, b) => a - b);
  const at = (fraction: number) =>
    Math.round((sorted[Math.ceil(fraction * sorted.length) - 1] ?? 0) * 100) /
    100;
  return {
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    maxMs: at(1),
    measuredCalls: times.length,
  };
};

async function timeOne(): Promise<number> {
  const started = performance.now();
  const preview = await listManagementAlertPreview(database.runtimePool, {
    context,
    locationId,
  });
  if (preview.count !== preview.items.length || preview.count > 20) {
    throw new Error("Invalid bounded alert badge during profile.");
  }
  return performance.now() - started;
}

async function profile(label: string, concurrency: number): Promise<void> {
  const warmup = 20;
  const measured = 100;
  for (let index = 0; index < warmup; index += 1) await timeOne();
  const samples: number[] = [];
  let maxPoolWaiting = 0;
  const rawPool = database.runtimePool as unknown as {
    readonly waitingCount?: number;
  };
  await Promise.all(
    Array.from({ length: concurrency }, async (_, worker) => {
      for (let call = worker; call < measured; call += concurrency) {
        samples.push(await timeOne());
        maxPoolWaiting = Math.max(maxPoolWaiting, rawPool.waitingCount ?? 0);
      }
    }),
  );
  // Explicit JSON record in canonical Vitest stdout: actual local profile only.
  console.info(
    JSON.stringify({
      test: "issue414-preview-pg17",
      fixture: label,
      concurrency,
      warmups: warmup,
      maxPoolWaiting,
      ...percentiles(samples),
    }),
  );
}

describe.skipIf(!runProfile)(
  "Issue #414 authorized preview performance profile",
  () => {
    beforeAll(async () => {
      savedCutover =
        process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER;
      await database.setup();
      const fixture = await database.managerFixture();
      context = await database.staffSessionContext(fixture.userId);
      locationId = fixture.locationId;
      const clock = await database.adminPool.query<{ now: Date }>(
        "SELECT clock_timestamp() AS now",
      );
      process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER =
        clock.rows[0]!.now.toISOString();
    }, 120_000);

    afterAll(async () => {
      if (savedCutover === undefined)
        delete process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER;
      else
        process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER =
          savedCutover;
      await database.teardown();
    }, 120_000);

    it("measures sparse LM Location at concurrency 4/8/16", async () => {
      for (const concurrency of [4, 8, 16])
        await profile("sparse-LM", concurrency);
    }, 180_000);

    it("measures dense LM Location with off-page eligible Incidents", async () => {
      const sessionId = await database.seedSession({ state: "PARKED" });
      await Promise.all(
        Array.from({ length: 150 }, () =>
          database.seedIncident({ sessionId, status: "OPEN" }),
        ),
      );
      for (const concurrency of [4, 8, 16])
        await profile("dense-LM", concurrency);
    }, 180_000);
  },
);
