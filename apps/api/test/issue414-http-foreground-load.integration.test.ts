import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import {
  issue414CreateAuthorizedLoadActors,
  issue414SeedAuthorizedHttpLoad,
  type Issue414LoadActors,
  type Issue414LoadTaskProbes,
} from "./issue414-http-load-fixture";
import { issue414MountedApp } from "./issue414-http-load-observer";
import {
  issue414AssertLiveExactTaskReasons,
  issue414HttpGet,
  issue414ProfileForegroundCohort,
} from "./issue414-http-load-profile";
import type { Issue414Audience } from "./issue414-http-foreground-cadence";

const enabled =
  process.env.ISSUE414_W7_HTTP_TABS_PROFILE === "I_OWN_EXCLUSIVE_LOCAL_PG17";
const fixture = new ManagementControlPlaneTestFixture();
const original = {
  mfa: process.env.VAYLET_LOCAL_DISABLE_MFA,
  enabled: process.env.MANAGEMENT_ALERTS_PHASE1_ENABLED,
  cutover: process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER,
  pool: process.env.DATABASE_POOL_MAX,
};
const results: Record<string, unknown>[] = [];
let actors: Issue414LoadActors;
let taskProbes: Issue414LoadTaskProbes;
let target: ReturnType<typeof issue414MountedApp>;
let startAttempted = false;
let databaseVersion = 0;

function ensureExclusiveLocalPG17Lease(): void {
  assert.ok(
    process.env.VAYLET_TEST_CLUSTER_RUN_ID,
    "Only repository run-owned-tests exclusive PG17 harness is permitted",
  );
  // Match the canonical owned-harness/StaffAuthNativeFixture target selection:
  // a local default is permitted only under VAYLET_TEST_CLUSTER_RUN_ID.
  const url =
    process.env.TEST_DATABASE_URL ??
    process.env.MIGRATION_DATABASE_URL ??
    "postgresql://valet:valet@127.0.0.1:5432/valet";
  const parsed = new URL(url);
  assert.equal(
    parsed.hostname,
    "127.0.0.1",
    "Remote/production target refused",
  );
  assert.ok(parsed.port && Number(parsed.port) > 1024);
  assert.ok(parsed.pathname.length > 1 && parsed.username && parsed.password);
  assert.ok(!parsed.search && !parsed.hash);
  assert.notEqual(process.env.NODE_ENV, "production");
  // W7's reviewed source intentionally DOES NOT contain this controller.
  // Do not even create a test DB here until Prime has integrated the
  // HTTP route in a separate authorized worktree and reviewed these tests.
  assert.ok(
    existsSync(
      resolve(
        process.cwd(),
        "src/modules/dashboard/management-alert-preview.controller.ts",
      ),
    ),
    "W7 has no Management Alert preview endpoint; portable test only, NOT RUN",
  );
}

function restoreEnvironment(): void {
  for (const [name, value] of [
    ["VAYLET_LOCAL_DISABLE_MFA", original.mfa],
    ["MANAGEMENT_ALERTS_PHASE1_ENABLED", original.enabled],
    ["MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER", original.cutover],
    ["DATABASE_POOL_MAX", original.pool],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

describe.skipIf(!enabled)(
  "Issue #414 25/100/200 synthetic foreground tabs, actual bearer HTTP + PG17",
  () => {
    beforeAll(async () => {
      ensureExclusiveLocalPG17Lease();
      process.env.VAYLET_LOCAL_DISABLE_MFA = "false";
      process.env.MANAGEMENT_ALERTS_PHASE1_ENABLED = "enabled";
      process.env.DATABASE_POOL_MAX = "4";
      startAttempted = true;
      await fixture.start();
      const version = await fixture.query<{ version: number }>(
        "SELECT current_setting('server_version_num')::integer AS version",
      );
      databaseVersion = version.rows[0]?.version ?? 0;
      expect(databaseVersion).toBeGreaterThanOrEqual(170000);
      expect(databaseVersion).toBeLessThan(180000);
      // Synthetic cutover is test-only and deliberately predates all
      // SQL-generated history; it is NOT valid operational rollout evidence.
      const clock = await fixture.query<{ cutover: Date }>(
        `SELECT (clock_timestamp()::timestamptz(3)-interval '1 day')
                ::timestamptz(3) AS cutover`,
      );
      process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER =
        clock.rows[0]!.cutover.toISOString();
      actors = await issue414CreateAuthorizedLoadActors(fixture);
      taskProbes = await issue414SeedAuthorizedHttpLoad(fixture, actors);
      target = issue414MountedApp(fixture);
      const tokens: Record<Issue414Audience, string> = {
        CA: actors.ca.accessToken,
        LM: actors.lm.accessToken,
      };
      for (const audience of ["CA", "LM"] as const) {
        const probe = await issue414HttpGet(
          {
            ...target,
            locationId: actors.locationId,
            bearer: tokens,
          },
          audience,
        );
        assert.equal(
          probe.status,
          200,
          "Real authorized bearer GET endpoint unavailable; no benchmark claim",
        );
        assert.ok(probe.noStore && probe.validEnvelope);
        assert.equal(probe.count, 20);
        assert.equal(probe.hasMore, true);
      }
      await issue414AssertLiveExactTaskReasons(
        { ...target, locationId: actors.locationId, bearer: tokens },
        taskProbes,
      );
      const denied = await fixture.managementGet(
        `/v1/staff/dashboard/locations/${actors.locationId}/alerts/preview`,
        "not-a-valid-bearer",
      );
      assert.equal(denied.status, 401);
      assert.equal(denied.body?.items, undefined);
    }, 180_000);

    afterAll(async () => {
      try {
        if (startAttempted) await fixture.stop();
      } finally {
        restoreEnvironment();
        const path = resolve(
          process.cwd(),
          "../../tmp/issue414-w7-owned/http-foreground-tabs.json",
        );
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(
          path,
          JSON.stringify(
            {
              category: "SIMULATED_TABS_REAL_HTTP_PG17",
              databaseVersion,
              resultCount: results.length,
              complete:
                results.length === 3 &&
                results.every((row) => row.complete === true),
              results,
              caveat: "Never a production capacity SLO; no actual browser tabs",
            },
            null,
            2,
          ),
        );
      }
    }, 120_000);

    it("performs real HTTP 60s cadence across 25,100,200 simulated tabs", async () => {
      const sessions = {
        CA: actors.ca.sessionId,
        LM: actors.lm.sessionId,
      };
      const originalMfa = {
        CA: (await fixture.sessionSnapshot(sessions.CA)).rows[0]!,
        LM: (await fixture.sessionSnapshot(sessions.LM)).rows[0]!,
      };
      const bearer: Record<Issue414Audience, string> = {
        CA: actors.ca.accessToken,
        LM: actors.lm.accessToken,
      };
      const refresh: Record<Issue414Audience, string> = {
        CA: actors.ca.refreshToken,
        LM: actors.lm.refreshToken,
      };
      for (const tabs of [25, 100, 200] as const) {
        const record = await issue414ProfileForegroundCohort(
          fixture,
          { ...target, locationId: actors.locationId, bearer },
          tabs,
        );
        results.push(record);
        console.info(
          JSON.stringify({
            test: "issue414-http-foreground-cadence",
            tabs,
            completed: record.measuredCompleted,
            success: record.measuredHttpSuccess,
            p95Ms: record.measuredSuccessfulHttp?.p95Ms,
            actualPoolMax: record.pool.actualMountedPoolMax,
            errors: record.statusCounts,
          }),
        );
        expect(record.complete).toBe(true);
        await issue414AssertLiveExactTaskReasons(
          { ...target, locationId: actors.locationId, bearer },
          taskProbes,
        );
        if (tabs !== 200) {
          for (const audience of ["CA", "LM"] as const) {
            const rotated = await fixture.refresh(refresh[audience]);
            assert.equal(rotated.status, 200);
            assert.ok(typeof rotated.body?.accessToken === "string");
            assert.ok(typeof rotated.body?.refreshToken === "string");
            bearer[audience] = rotated.body.accessToken;
            refresh[audience] = rotated.body.refreshToken;
            const renewed = await issue414HttpGet(
              { ...target, locationId: actors.locationId, bearer },
              audience,
            );
            assert.equal(renewed.status, 200);
            assert.ok(renewed.noStore && renewed.validEnvelope);
          }
        }
      }
      for (const audience of ["CA", "LM"] as const) {
        const after = (await fixture.sessionSnapshot(sessions[audience]))
          .rows[0]!;
        expect(after.mfa_authenticated_at).toEqual(
          originalMfa[audience].mfa_authenticated_at,
        );
        expect(after.last_admin_activity_at).toEqual(
          originalMfa[audience].last_admin_activity_at,
        );
      }
    }, 800_000);
  },
);
