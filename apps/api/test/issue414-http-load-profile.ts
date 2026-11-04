import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Pool } from "pg";

import {
  arithmeticIssue414GetsPerSecond,
  dispatchIssue414ForegroundGets,
  issue414Percentiles,
  planIssue414ForegroundGets,
  type Issue414Audience,
  type Issue414TabCohort,
} from "./issue414-http-foreground-cadence";
import { issue414ObserveHttpPool } from "./issue414-http-load-observer";
import type { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

interface MeasuredResponse {
  readonly status: number;
  readonly noStore: boolean;
  readonly validEnvelope: boolean;
  readonly count: number | null;
  readonly hasMore: boolean | null;
}

interface Endpoint {
  readonly baseUrl: string;
  readonly locationId: string;
  readonly bearer: Record<Issue414Audience, string>;
  readonly pool: Pool;
}

/** HTTP network + authentication + aggregate SQL + JSON parse, not SQL-only. */
export async function issue414HttpGet(
  target: Endpoint,
  audience: Issue414Audience,
): Promise<MeasuredResponse> {
  const response = await fetch(
    `${target.baseUrl}/v1/staff/dashboard/locations/${target.locationId}/alerts/preview`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${target.bearer[audience]}`,
        "X-Request-Id": randomUUID(),
        "Cache-Control": "no-store",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  const body = (await response.json()) as Record<string, unknown>;
  const items = body.items;
  const count = body.count;
  const hasMore = body.hasMore;
  const validEnvelope =
    Array.isArray(items) &&
    Number.isSafeInteger(count) &&
    typeof hasMore === "boolean" &&
    count === items.length &&
    count === 20 &&
    hasMore === true &&
    items.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "sourceId" in item &&
        "episodeId" in item,
    ) &&
    items.some(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "category" in item &&
        item.category === "ALT-08",
    ) &&
    items.some(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "category" in item &&
        (item.category === "ALT-02" || item.category === "ALT-03"),
    );
  return {
    status: response.status,
    noStore:
      response.headers.get("cache-control")?.includes("no-store") ?? false,
    validEnvelope,
    count: typeof count === "number" ? count : null,
    hasMore: typeof hasMore === "boolean" ? hasMore : null,
  };
}

/** Off-page Task versions must remain current, even if the global top 20
 * is saturated by newer Critical cases. Uses the same real HTTP authorization
 * and exact-detail contract as the dashboard, never raw fixture-only SQL. */
export async function issue414AssertLiveExactTaskReasons(
  target: Endpoint,
  probes: { readonly alt02TaskId: string; readonly alt03TaskId: string },
): Promise<void> {
  for (const audience of ["CA", "LM"] as const) {
    for (const [category, taskId, version] of [
      ["ALT-02", probes.alt02TaskId, 1],
      ["ALT-03", probes.alt03TaskId, 3],
    ] as const) {
      const response = await fetch(
        `${target.baseUrl}/v1/staff/dashboard/locations/${target.locationId}/alerts/sources/${category}/${taskId}?episodeId=${encodeURIComponent(`${taskId}:${version}`)}`,
        {
          headers: {
            Authorization: `Bearer ${target.bearer[audience]}`,
            "X-Request-Id": randomUUID(),
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
      assert.equal(response.status, 200, "Task reason retired under HTTP load");
      const body = (await response.json()) as {
        item?: { category?: string; sourceId?: string; episodeId?: string };
      };
      assert.equal(body.item?.category, category);
      assert.equal(body.item?.sourceId, taskId);
      assert.equal(body.item?.episodeId, `${taskId}:${version}`);
    }
  }
}

export async function issue414ProfileForegroundCohort(
  fixture: ManagementControlPlaneTestFixture,
  target: Endpoint,
  tabs: Issue414TabCohort,
) {
  const schedule = planIssue414ForegroundGets(tabs);
  const baseline = performance.now();
  let activeRequests = 0;
  let peakHttpInFlight = 0;
  const stopObserving = await issue414ObserveHttpPool(fixture, target.pool);
  let result:
    | Awaited<
        ReturnType<typeof dispatchIssue414ForegroundGets<MeasuredResponse>>
      >
    | undefined;
  let pool: Record<string, unknown>;
  try {
    result = await dispatchIssue414ForegroundGets(
      schedule,
      {
        nowMs: () => performance.now() - baseline,
        waitUntilMs: async (dueMs) => {
          const remaining = Math.max(
            0,
            Math.ceil(baseline + dueMs - performance.now()),
          );
          if (remaining > 0)
            await new Promise<void>((resolve) =>
              setTimeout(resolve, remaining),
            );
        },
      },
      async (request) => {
        activeRequests += 1;
        peakHttpInFlight = Math.max(peakHttpInFlight, activeRequests);
        try {
          return await issue414HttpGet(target, request.audience);
        } finally {
          activeRequests -= 1;
        }
      },
    );
  } finally {
    pool = await stopObserving();
  }
  assert.ok(result);
  const all = result.completed;
  const measured = all.filter((row) => row.request.measured);
  const warmups = all.filter((row) => !row.request.measured);
  const warmupSuccess = warmups.filter(
    (row) =>
      row.outcome.kind === "ok" &&
      row.outcome.value.status === 200 &&
      row.outcome.value.noStore &&
      row.outcome.value.validEnvelope,
  );
  const success = measured.filter(
    (row) =>
      row.outcome.kind === "ok" &&
      row.outcome.value.status === 200 &&
      row.outcome.value.noStore &&
      row.outcome.value.validEnvelope,
  );
  const statusCounts: Record<string, number> = {};
  for (const entry of all) {
    const key =
      entry.outcome.kind === "error"
        ? `NETWORK_${entry.outcome.reason}`
        : String(entry.outcome.value.status);
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }
  const measuredStart = measured.map((row) => row.startedMs);
  const measuredEnd = measured.map((row) => row.completedMs);
  const actualSpanMs =
    measured.length > 0
      ? Math.max(...measuredEnd) - Math.min(...measuredStart)
      : null;
  return {
    classification: "SIMULATED_FOREGROUND_TABS_REAL_LOCAL_BEARER_HTTP_PG17",
    tabs,
    nominalPeriodMs: 60_000,
    maxScheduledJitterMs: 3000,
    configuredArithmeticGetsPerSecond: arithmeticIssue414GetsPerSecond(tabs),
    warmupPlanned: tabs,
    measuredPlanned: tabs,
    warmupCompleted: warmups.length,
    warmupHttpSuccess: warmupSuccess.length,
    measuredCompleted: measured.length,
    measuredHttpSuccess: success.length,
    missedInFlightTicks: result.skipped.length,
    statusCounts,
    measuredSuccessByAudience: {
      CA: success.filter((row) => row.request.audience === "CA").length,
      LM: success.filter((row) => row.request.audience === "LM").length,
    },
    measuredEndToEndHttp: issue414Percentiles(
      measured.map((row) => row.completedMs - row.startedMs),
    ),
    measuredSuccessfulHttp: issue414Percentiles(
      success.map((row) => row.completedMs - row.startedMs),
    ),
    measuredScheduleLateness: issue414Percentiles(
      measured.map((row) => Math.max(0, row.startedMs - row.request.dueMs)),
    ),
    measuredDispatchSpanMs: measuredStart.length
      ? Math.max(...measuredStart) - Math.min(...measuredStart)
      : null,
    actualFirstSendToLastCompletionMs: actualSpanMs,
    observedSuccessfulGetsPerSecond:
      actualSpanMs && actualSpanMs > 0
        ? Number((success.length / (actualSpanMs / 1000)).toFixed(4))
        : null,
    peakHttpInFlight,
    pool,
    complete:
      warmups.length === tabs &&
      warmupSuccess.length === tabs &&
      measured.length === tabs &&
      success.length === tabs &&
      result.skipped.length === 0,
  };
}
