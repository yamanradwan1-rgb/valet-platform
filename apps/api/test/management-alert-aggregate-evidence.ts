import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import type { PostgresPool } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { explainManagementAlertMixedAggregate } from "./management-alert-aggregate-explain";

interface ProfileScenario {
  readonly density: "sparse" | "dense";
  readonly locationId: string;
  readonly ca: StaffSessionContext;
  readonly lm: StaffSessionContext;
  readonly expectedPresenceCount: number;
  readonly expectedCount: number;
  readonly expectedHasMore: boolean;
}

const measuredGroups: Record<string, unknown>[] = [];

/** In-memory measures are persisted only after the entire run passes. */
export function recordAggregateMetric(measurement: Record<string, unknown>) {
  measuredGroups.push(measurement);
  console.info(JSON.stringify(measurement));
}

export function persistAggregateMetrics() {
  if (measuredGroups.length !== 12) {
    throw new Error("Incomplete mixed aggregate benchmark measurement matrix.");
  }
  if (process.env.ISSUE414_CAPTURE_AGGREGATE_EVIDENCE !== "enabled") return;
  const destination = resolve(
    process.cwd(),
    "../../docs/validation/issue414/ISSUE414_MIXED_AGGREGATE_PG17_METRICS.json",
  );
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(
    destination,
    JSON.stringify(
      {
        task: "Issue 414 authorized 5-category mixed-source aggregate PostgreSQL 17",
        generatedAtUtc: new Date().toISOString(),
        methodology:
          "12 CA/LM sparse/dense c4/c8/c16 groups; 20 warmup and 100 measured each; shared bounded runtime pool max 4; synthetic hot cache; per-group Presence source revalidated after measurement; not HTTP or production SLO",
        measurements: measuredGroups,
      },
      null,
      2,
    ) + "\n",
  );
}

/** Full-source authorized preview plus four actual SQL statements per audience. */
export async function captureAggregatePlans(
  pool: PostgresPool,
  scenarios: readonly ProfileScenario[],
  observedPgVersion: number,
) {
  const captured = [];
  for (const scenario of scenarios) {
    for (const role of ["ca", "lm"] as const) {
      const branches = await explainManagementAlertMixedAggregate(
        pool,
        scenario[role],
        scenario.locationId,
        scenario.expectedCount,
        scenario.expectedHasMore,
      );
      if (branches.length !== 4)
        throw new Error("Incomplete aggregate SQL plan.");
      // EXPLAIN executes after the full measured matrix. Its separate SQL
      // snapshot must still include ALL five live sources: a CRITICAL-filled
      // 20-row badge alone cannot establish off-page Presence/Task liveness.
      const expectedRows: Record<(typeof branches)[number]["family"], number> =
        {
          "ALT-01": scenario.expectedPresenceCount,
          "ALT-02/03": scenario.expectedPresenceCount * 2,
          "ALT-08": scenario.density === "sparse" ? 2 : 21,
          "ALT-12": scenario.expectedPresenceCount,
        };
      for (const branch of branches) {
        if (branch.actualRootRows !== expectedRows[branch.family]) {
          throw new Error(
            `Mixed-source EXPLAIN ${branch.family} lost eligible cases after profiling.`,
          );
        }
      }
      captured.push({
        density: scenario.density,
        audience: role,
        branches,
      });
      console.info(
        JSON.stringify({
          suite: "issue414-mixed-aggregate-real-source-explain",
          pgVersionNum: observedPgVersion,
          density: scenario.density,
          audience: role,
          branchSummary: branches.map((item) => ({
            family: item.family,
            executionMs: item.actualExecutionMs,
            rootRows: item.actualRootRows,
            inclusiveSharedHits: item.inclusiveRootSharedHits,
            inclusiveSharedReads: item.inclusiveRootSharedReads,
          })),
        }),
      );
    }
  }
  if (process.env.ISSUE414_CAPTURE_AGGREGATE_EVIDENCE === "enabled") {
    const destination = resolve(
      process.cwd(),
      "../../docs/validation/issue414/ISSUE414_MIXED_AGGREGATE_PG17_EXPLAIN.json.gz",
    );
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(
      destination,
      gzipSync(
        Buffer.from(
          JSON.stringify({
            source:
              "Actual authorized full 5-family preview; 4 shipped SQL statements",
            pgVersionNum: observedPgVersion,
            generatedAtUtc: new Date().toISOString(),
            limitations:
              "Synthetic hot-cache local PG17; no HTTP, pilot or production capacity claims",
            captured,
          }),
        ),
      ),
    );
  }
}
