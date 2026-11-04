import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { runtimePoolSnapshot } from "../src/common/database/bounded-postgres-pool";
import {
  readCurrentUncoveredTaskAlertById,
  readCurrentUncoveredTaskAlerts,
  type AuthorizedUncoveredTaskAlertScope,
} from "../src/modules/dispatch/uncovered-task-alert-query";
import { DispatchTestContext } from "../test/dispatch-test-context";
import type { BenchmarkLocation } from "./issue414-dispatch-performance-fixture";
import { sampleRuntimeWaits } from "./issue414-dispatch-performance-observer";
import {
  planNodes,
  type PgExplainResult,
} from "./issue414-dispatch-performance-plan";
function distribution(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) =>
    Number(sorted[Math.ceil(sorted.length * p) - 1]!.toFixed(3));
  return {
    samples: sorted.length,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    maxMs: Number(sorted[sorted.length - 1]!.toFixed(3)),
  };
}

function parameters(
  item: BenchmarkLocation,
  role: "CA" | "LM",
  arm: "list" | "alt02" | "alt03",
): {
  scope: AuthorizedUncoveredTaskAlertScope;
  id: string | null;
  args: unknown[];
} {
  const actor = role === "CA" ? item.ca : item.lm;
  const id =
    arm === "alt02" ? item.alt02Id : arm === "alt03" ? item.alt03Id : null;
  const scope = {
    organizationId: item.organizationId,
    locationId: item.locationId,
    viewerUserId: actor.userId,
    viewerMembershipId: actor.membershipId,
    initialQueueDelaySeconds: 0,
    postDeclineDelaySeconds: 0,
    postLockClockCutover: new Date(0), // synthetic experiment only; NOT a rollout cutover
    limit: 21,
  };
  return {
    scope,
    id,
    args: [
      scope.organizationId,
      scope.locationId,
      scope.viewerUserId,
      scope.viewerMembershipId,
      0,
      0,
      id,
      21,
      scope.postLockClockCutover,
    ],
  };
}

export async function explain(
  context: DispatchTestContext,
  sql: string,
  item: BenchmarkLocation,
  role: "CA" | "LM",
  arm: "list" | "alt02" | "alt03",
) {
  const { args } = parameters(item, role, arm);
  const client = await context.runtimePool.connect();
  try {
    const result = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
      args,
    );
    const plan = result.rows[0]?.["QUERY PLAN"]?.[0] as
      PgExplainResult | undefined;
    assert.ok(plan?.Plan);
    return {
      tier: item.name,
      role,
      arm,
      planningMs: plan["Planning Time"],
      executionMs: plan["Execution Time"],
      actualTopRows: plan.Plan["Actual Rows"],
      inclusiveSharedHits: plan.Plan["Shared Hit Blocks"] ?? 0,
      inclusiveSharedReads: plan.Plan["Shared Read Blocks"] ?? 0,
      nodes: planNodes(plan.Plan),
      fullPlan: plan,
    };
  } finally {
    client.release();
  }
}

async function queryOnce(
  context: DispatchTestContext,
  item: BenchmarkLocation,
  role: "CA" | "LM",
  arm: "list" | "alt02" | "alt03",
) {
  const { scope, id } = parameters(item, role, arm);
  const started = performance.now();
  const client = await context.runtimePool.connect();
  const acquired = performance.now();
  try {
    if (id === null) {
      const rows = await readCurrentUncoveredTaskAlerts(client, scope);
      assert.equal(rows.length, 21);
    } else {
      const row = await readCurrentUncoveredTaskAlertById(client, scope, id);
      assert.ok(row);
      assert.equal(row.sourceId, id);
      assert.equal(row.category, arm === "alt02" ? "ALT-02" : "ALT-03");
    }
    return {
      totalMs: performance.now() - started,
      acquisitionMs: acquired - started,
      readerMs: performance.now() - acquired,
    };
  } finally {
    client.release();
  }
}

export async function measure(
  context: DispatchTestContext,
  item: BenchmarkLocation,
  role: "CA" | "LM",
  arm: "list" | "alt02" | "alt03",
  concurrency: number,
) {
  const warmups = 20;
  const measurements = 100;
  const before = runtimePoolSnapshot(context.runtimePool);
  const deadlocksBefore = await context.adminPool.query<{ deadlocks: string }>(
    "SELECT deadlocks::text FROM pg_stat_database WHERE datname=current_database()",
  );
  const finishWaitSampling = await sampleRuntimeWaits(
    context.adminPool,
    context.runtimeRole,
  );
  const totalMs: number[] = [],
    acquisitionMs: number[] = [],
    readerMs: number[] = [];
  let peakWaiting = 0;
  let errors = 0;
  const reasons: string[] = [];
  const readBatch = async (count: number, record: boolean) => {
    const pending = Array.from({ length: count }, () =>
      queryOnce(context, item, role, arm),
    );
    peakWaiting = Math.max(peakWaiting, context.runtimePool.waitingCount);
    const results = await Promise.allSettled(pending);
    for (const result of results) {
      if (result.status === "rejected") {
        errors += 1;
        const error = result.reason as { code?: string; message?: string };
        reasons.push(error.code ?? error.message ?? String(result.reason));
      } else if (record) {
        totalMs.push(result.value.totalMs);
        acquisitionMs.push(result.value.acquisitionMs);
        readerMs.push(result.value.readerMs);
      }
    }
  };
  let waits;
  try {
    for (let i = 0; i < warmups; i += concurrency)
      await readBatch(Math.min(concurrency, warmups - i), false);
    for (let i = 0; i < measurements; i += concurrency)
      await readBatch(Math.min(concurrency, measurements - i), true);
  } finally {
    waits = await finishWaitSampling();
  }
  const after = runtimePoolSnapshot(context.runtimePool);
  const deadlocksAfter = await context.adminPool.query<{ deadlocks: string }>(
    "SELECT deadlocks::text FROM pg_stat_database WHERE datname=current_database()",
  );
  return {
    tier: item.name,
    totalTasksAtLocation: item.totalTasks,
    qualifyingAlt02: item.eligible02,
    qualifyingAlt03: item.eligible03,
    role,
    arm,
    requestedConcurrency: concurrency,
    actualPoolCap: after.configuredMax,
    warmupRequests: warmups,
    measuredRequests: measurements,
    successfulMeasured: totalMs.length,
    errors,
    errorReasons: [...new Set(reasons)].slice(0, 8),
    endToEnd: distribution(totalMs),
    poolAcquisition: distribution(acquisitionMs),
    readerQueryAndMapping: distribution(readerMs),
    peakNativeQueueObserved: peakWaiting,
    sampledPgActivity: waits,
    pgStatDatabaseDeadlocksDelta:
      Number(deadlocksAfter.rows[0]?.deadlocks ?? 0) -
      Number(deadlocksBefore.rows[0]?.deadlocks ?? 0),
    poolCounters: {
      peakAdmittedCumulative: after.peakAdmitted,
      peakActiveCumulative: after.peakActive,
      peakWaitingCumulative: after.peakWaiting,
      acquisitionTimeoutsDelta:
        (after.acquisitionTimeouts ?? 0) - (before.acquisitionTimeouts ?? 0),
      lockTimeoutsDelta: (after.lockTimeouts ?? 0) - (before.lockTimeouts ?? 0),
      statementTimeoutsDelta:
        (after.statementTimeouts ?? 0) - (before.statementTimeouts ?? 0),
      queryTimeoutsDelta:
        (after.queryTimeouts ?? 0) - (before.queryTimeouts ?? 0),
    },
    exceedsProvisional1sP95: (distribution(totalMs)?.p95Ms ?? Infinity) > 1000,
  };
}
