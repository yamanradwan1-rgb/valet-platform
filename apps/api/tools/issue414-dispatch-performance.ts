/**
 * W7 test-only PG17 performance harness. Never runs implicitly in CI.
 * Requires an explicit Prime-exclusive PG17 lease and disposable DB parent.
 * Invoked only from the opt-in Vitest suite under run-owned-tests cluster lease.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import pg from "pg";

import { DispatchTestContext } from "../test/dispatch-test-context";
import { createBenchmarkLocations } from "./issue414-dispatch-performance-fixture";
import { extractSourceSql } from "./issue414-dispatch-performance-plan";
import { explain, measure } from "./issue414-dispatch-performance-load";

function readRequiredLease(): string {
  const urlText = process.env.TEST_DATABASE_URL;
  assert.equal(
    process.env.ISSUE414_W7_BENCH_ENABLE,
    "I_OWN_EXCLUSIVE_PG17_LEASE",
    "Benchmark requires explicit, externally verified Prime-exclusive PG17 lease",
  );
  const lease = process.env.VAYLET_TEST_CLUSTER_RUN_ID;
  assert.ok(
    lease,
    "Use run-owned-tests: benchmark requires its real global lease",
  );
  assert.ok(
    urlText,
    "Explicit TEST_DATABASE_URL to disposable PG17 parent required",
  );
  const url = new URL(urlText);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.equal(url.hostname, "127.0.0.1", "Only local owned PG17 accepted");
  assert.ok(url.port && Number(url.port) > 1024);
  assert.ok(url.pathname.length > 1 && url.username && url.password);
  assert.ok(!url.search && !url.hash);
  return lease;
}

export async function runIssue414DispatchPerformance(): Promise<void> {
  const lease = readRequiredLease();
  const { sql, sha256 } = extractSourceSql();
  const sourceSha = "71ad11f349e76236ef9429b971ce537772cba2ac";
  const reviewedSource = execFileSync(
    "git",
    [
      "show",
      `${sourceSha}:apps/api/src/modules/dispatch/uncovered-task-alert-query.ts`,
    ],
    { cwd: resolve(process.cwd(), "../.."), encoding: "utf8" },
  );
  const currentSource = execFileSync(
    "git",
    [
      "show",
      "HEAD:apps/api/src/modules/dispatch/uncovered-task-alert-query.ts",
    ],
    { cwd: resolve(process.cwd(), "../.."), encoding: "utf8" },
  );
  assert.equal(
    currentSource,
    reviewedSource,
    "W1-reviewed reader source differs",
  );
  const parent = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    max: 1,
  });
  try {
    const identity = (
      await parent.query(
        "SELECT current_database() AS db,current_user AS role, current_setting('server_version_num')::integer AS version",
      )
    ).rows[0] as { db: string; role: string; version: number };
    assert.equal(Math.floor(identity.version / 10000), 17, "PG17 only");
  } finally {
    await parent.end();
  }
  const context = new DispatchTestContext("issue414_perf_w7");
  let setupComplete = false;
  const output = {
    classification: "DISPOSABLE_SQL_GENERATED_FIXTURE_NOT_CANONICAL_WRITERS",
    leaseSha256: createHash("sha256").update(lease).digest("hex"),
    sqlSha256: sha256,
    testedSourceSha: sourceSha,
    startedAt: new Date().toISOString(),
    runtimeDefaultPoolMax: process.env.DATABASE_POOL_MAX ?? "4",
    database: {} as Record<string, unknown>,
    locations: [] as unknown[],
    plans: [] as unknown[],
    scenarios: [] as unknown[],
  };
  const destination =
    process.env.ISSUE414_W7_PERF_OUTPUT ??
    resolve(process.cwd(), "../../tmp/issue414-w7-owned/performance.json");
  try {
    await context.setup();
    setupComplete = true;
    const identity = (
      await context.adminPool.query(
        "SELECT current_database() AS db,current_user AS role,current_setting('server_version') AS version,pg_size_pretty(pg_database_size(current_database())) AS size",
      )
    ).rows[0] as Record<string, unknown>;
    assert.equal(identity.db, context.databaseName);
    output.database = identity;
    const denseTotal = Number(process.env.ISSUE414_W7_DENSE_TASKS ?? "1200");
    const locations = await createBenchmarkLocations(context, denseTotal);
    const totals = await context.adminPool.query(
      "SELECT (SELECT count(*)::integer FROM tasks) AS tasks,(SELECT count(*)::integer FROM dispatch_events) AS dispatch,(SELECT count(*)::integer FROM audit_events) AS audit",
    );
    output.database = { ...identity, actualFixtureRows: totals.rows[0] };
    output.locations = locations.map((item) => ({
      name: item.name,
      totalTasks: item.totalTasks,
      qualifyingAlt02: item.eligible02,
      qualifyingAlt03: item.eligible03,
    }));
    for (const item of locations) {
      for (const role of ["CA", "LM"] as const) {
        for (const arm of ["list", "alt02", "alt03"] as const) {
          output.plans.push(await explain(context, sql, item, role, arm));
          for (const concurrency of [4, 8, 16]) {
            const result = await measure(context, item, role, arm, concurrency);
            output.scenarios.push(result);
            console.info(
              JSON.stringify({
                tier: item.name,
                role,
                arm,
                concurrency,
                p95Ms: result.endToEnd?.p95Ms,
                errors: result.errors,
                poolMax: result.actualPoolCap,
              }),
            );
          }
        }
      }
    }
  } finally {
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(
      destination,
      JSON.stringify(
        {
          ...output,
          finishedAt: new Date().toISOString(),
          complete: output.scenarios.length === 36,
        },
        null,
        2,
      ),
    );
    if (setupComplete) await context.teardown();
    console.info("W7 disposable benchmark JSON written; teardown requested.");
  }
  assert.equal(output.scenarios.length, 36);
  assert.ok(
    output.scenarios.every(
      (scenario) => (scenario as { errors: number }).errors === 0,
    ),
  );
}
