import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { queryGeofenceViolationAlertCases } from "../src/modules/dashboard/management-alert-sources/geofence-violation-alert-reader";
import { createGpsIngestionCommandExecutor } from "../src/modules/tracking/gps-ingestion-command";
import { Issue352TakeoverTestContext } from "./issue352-takeover-test-context";
import { seedIssue414GeofenceArea } from "./issue414-geofence-area-test-fixture";

// Lease-gated PG17 benchmark ONLY. Print actual sparse/dense measured plans;
// no synthetic geofence events and no fabricated performance/P95 conclusion.
const db = new Issue352TakeoverTestContext("414-alt09-index-plan");
let source: Awaited<ReturnType<typeof db.createStartParkingFixture>>;
let manager: Awaited<ReturnType<typeof db.addMember>>;
let context: Awaited<ReturnType<typeof db.credential>>;

async function readWithExplain(label: "sparse" | "dense") {
  return inPostgresTransaction(db.runtimePool, async (tx) => {
    let report:
      { readonly plan: unknown; readonly executionTime: unknown } | undefined;
    const diagnostic = {
      query: async (statement: string, parameters?: readonly unknown[]) => {
        const bindings = parameters === undefined ? [] : [...parameters];
        if (statement.includes("FROM geofence_events AS event")) {
          const explanation = await tx.query<{
            readonly "QUERY PLAN": readonly [
              {
                readonly Plan: unknown;
                readonly "Execution Time": number;
              },
            ];
          }>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement}`, bindings);
          const root = explanation.rows[0]?.["QUERY PLAN"]?.[0];
          if (root === undefined) throw new Error("Missing ALT09 EXPLAIN plan");
          report = { plan: root.Plan, executionTime: root["Execution Time"] };
        }
        return tx.query(statement, bindings);
      },
    } as unknown as PostgresTransaction;
    const cases = await queryGeofenceViolationAlertCases(diagnostic, {
      context,
      scope: {
        organizationId: source.organizationId,
        locationId: source.locationId,
        membershipId: manager.membershipId,
      },
      limit: 21,
    });
    expect(report).toBeDefined();
    // Machine-specific estimates must be assessed against an actual leased
    // DB and W18's forward-only index, not presented as a false PASS gate.
    console.info(`[ALT09 EXPLAIN ${label}]`, JSON.stringify(report));
    return cases;
  });
}

async function sendAlternating(count: number) {
  const now = await db.adminPool.query<{ at: Date }>(
    "SELECT clock_timestamp() AS at",
  );
  const timestamp = now.rows[0]!.at.getTime() + 100;
  const outside = { latitude: 33, longitude: 38 };
  const inside = { latitude: 31.5, longitude: 35.5 };
  const writer = createGpsIngestionCommandExecutor(db.runtimePool);
  for (let start = 0; start < count; start += 40) {
    const batch = Array.from(
      { length: Math.min(40, count - start) },
      (_, offset) => {
        const i = start + offset;
        return {
          ...(i % 2 === 0 ? outside : inside),
          accuracyMeters: 8,
          clientSampleId: randomUUID(),
          capturedAt: new Date(timestamp + i * 10).toISOString(),
        };
      },
    );
    await writer({
      authenticatedUserId: source.userId,
      sessionId: source.sessionId,
      samples: batch,
    });
  }
}

beforeAll(async () => {
  await db.setup();
  source = await db.createStartParkingFixture({ assignKey: false });
  await db.adminPool.query(
    "UPDATE organizations SET tracking_enabled=TRUE WHERE id=$1",
    [source.organizationId],
  );
  await db.adminPool.query(
    `UPDATE organization_subscriptions
     SET dashboard_access_enabled=TRUE,status='ACTIVE' WHERE organization_id=$1`,
    [source.organizationId],
  );
  await db.start(source, { session: 1, task: 3 });
  manager = await db.addMember(source, "LOCATION_MANAGER", false);
  context = await db.credential(manager.userId);
  await seedIssue414GeofenceArea(
    db.adminPool,
    source.organizationId,
    source.locationId,
    "RESTRICTED",
  );
}, 120_000);
afterAll(() => db.teardown(), 120_000);

describe("Issue #414 ALT09 source PG17 sparse/dense EXPLAIN evidence", () => {
  it("records measured plans before and after dense real-GPS event ingestion", async () => {
    await sendAlternating(2);
    const sparse = await readWithExplain("sparse");
    expect(sparse).toHaveLength(1);
    await sendAlternating(400);
    const dense = await readWithExplain("dense");
    expect(dense).toHaveLength(21);
    expect(new Set(dense.map((item) => item.sourceId)).size).toBe(21);
  }, 120_000);
});
