import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildAlertPerfFixture,
  type AlertPerfFixture,
} from "./management-alert-perf-fixtures";
import {
  explainSource,
  measureConcurrency,
  measureSerial,
  type AlertPerfFamily,
  type AlertPerfReader,
} from "./management-alert-perf-metrics";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { queryPresenceReviewAlertCases } from "../src/modules/dashboard/management-alert-sources/presence-review-alert-reader";
import { queryIncidentAlertCases } from "../src/modules/dashboard/management-alert-sources/incident-alert-reader";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";

const db = new PresenceServerTestContext("414-alert-w8-perf");
const families: AlertPerfFamily[] = ["ALT-01", "ALT-08", "ALT-12"];
const evidencePath = resolve(
  process.cwd(),
  "../../docs/evidence/issue-414-w8/management-alert-source-pg17.json",
);

beforeAll(() => db.setup(), 120_000);
afterAll(() => db.teardown(), 120_000);

function reader(
  scenario: AlertPerfFixture,
  role: "LM" | "CA",
  family: AlertPerfFamily,
): AlertPerfReader {
  const actor = role === "LM" ? scenario.lm : scenario.ca;
  return {
    db,
    context: actor.context,
    scope: {
      locationId: scenario.fixture.locationId,
      organizationId: scenario.fixture.organizationId,
      membershipId: actor.membershipId,
    },
    family,
    expectedLimit: scenario.expectedLimit,
  };
}

async function sourceCounts(scenario: AlertPerfFixture) {
  const [retrieval, incident, presence, history, crossLocation] =
    await Promise.all([
      db.adminPool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM retrieval_requests r
       JOIN valet_sessions s ON s.id=r.valet_session_id
       WHERE s.organization_id=$1 AND s.location_id=$2`,
        [scenario.fixture.organizationId, scenario.fixture.locationId],
      ),
      db.adminPool.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM incidents WHERE organization_id=$1 AND location_id=$2",
        [scenario.fixture.organizationId, scenario.fixture.locationId],
      ),
      db.adminPool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM shift_presence_exceptions
       WHERE organization_id=$1 AND location_id=$2`,
        [scenario.fixture.organizationId, scenario.fixture.locationId],
      ),
      db.adminPool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM shift_presence_exceptions
       WHERE organization_id=$1 AND location_id=$2 AND status='REJECTED'`,
        [scenario.fixture.organizationId, scenario.fixture.locationId],
      ),
      db.adminPool.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM valet_sessions WHERE organization_id=$1 AND location_id=$2",
        [scenario.fixture.organizationId, scenario.otherLocationId],
      ),
    ]);
  const asNumber = (result: { rows: readonly { n: string }[] }) =>
    Number(result.rows[0]?.n ?? "NaN");
  return {
    totalRetrievals: asNumber(retrieval),
    totalIncidents: asNumber(incident),
    totalPresence: asNumber(presence),
    terminalPresence: asNumber(history),
    crossLocationSessions: asNumber(crossLocation),
  };
}

async function proveCommercialScope(scenario: AlertPerfFixture) {
  const config = reader(scenario, "LM", "ALT-12");
  const live = await inPostgresTransaction(db.runtimePool, async (tx) => {
    const entitlement = await tx.query<{ enabled: boolean }>(
      "SELECT shift_presence_lock_management_entitlement($1,$2,$3,$4) AS enabled",
      [
        config.context.userId,
        config.context.staffAuthSessionId,
        config.context.accessTokenHash,
        config.scope.organizationId,
      ],
    );
    const cases = await queryPresenceReviewAlertCases(tx, {
      context: config.context,
      scope: config.scope,
      limit: 21,
    });
    return { enabled: entitlement.rows[0]?.enabled, count: cases.length };
  });
  expect(live).toEqual({ enabled: true, count: config.expectedLimit });
  // Flip only the isolated fixture's subscription. There is no separate
  // Presence-disabled-but-Dashboard-enabled capability in this schema.
  await db.adminPool.query(
    "UPDATE organization_subscriptions SET dashboard_access_enabled=FALSE WHERE organization_id=$1",
    [scenario.fixture.organizationId],
  );
  try {
    const blocked = await inPostgresTransaction(db.runtimePool, (tx) =>
      tx.query<{ enabled: boolean }>(
        "SELECT shift_presence_lock_management_entitlement($1,$2,$3,$4) AS enabled",
        [
          config.context.userId,
          config.context.staffAuthSessionId,
          config.context.accessTokenHash,
          config.scope.organizationId,
        ],
      ),
    );
    expect(blocked.rows[0]?.enabled).toBe(false);
    await expect(
      inPostgresTransaction(db.runtimePool, (tx) =>
        queryIncidentAlertCases(tx, {
          context: config.context,
          scope: config.scope,
          limit: 21,
        }),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    return {
      dashboardEnabled: live.enabled,
      dashboardDisabled: blocked.rows[0]?.enabled,
      ordinaryDashboardReaderDenied: true,
    };
  } finally {
    await db.adminPool.query(
      "UPDATE organization_subscriptions SET dashboard_access_enabled=TRUE WHERE organization_id=$1",
      [scenario.fixture.organizationId],
    );
  }
}

describe("Issue #414 W8 source read performance (real PG17, isolated DB)", () => {
  it("records EXPLAIN ANALYZE BUFFERS and warmup+measured samples", async () => {
    const version = await db.adminPool.query<{
      version: string;
      version_num: number;
      block_size: string;
    }>(
      `SELECT version(),current_setting('server_version_num')::int AS version_num,
        current_setting('block_size') AS block_size`,
    );
    const server = version.rows[0]!;
    expect(server.version_num).toBeGreaterThanOrEqual(170000);
    expect(server.version_num).toBeLessThan(180000);
    const results: unknown[] = [];
    const scenarioEvidence: unknown[] = [];
    const dense = await buildAlertPerfFixture(db, "dense");
    const sparse = await buildAlertPerfFixture(db, "sparse");
    for (const scenario of [sparse, dense]) {
      const counts = await sourceCounts(scenario);
      expect(counts.terminalPresence).toBe(scenario.seeded.terminalPresence);
      expect(counts.crossLocationSessions).toBe(
        scenario.seeded.otherLocationSessions,
      );
      const commercial = await proveCommercialScope(scenario);
      scenarioEvidence.push({
        label: scenario.label,
        seeded: scenario.seeded,
        observedRows: counts,
        commercial,
        locationScope:
          "single selected active Location; different Location noise",
        eligible: scenario.expectedLimit,
      });
      for (const role of ["LM", "CA"] as const) {
        for (const family of families) {
          const config = reader(scenario, role, family);
          const explain = await explainSource(config);
          const latency = await measureSerial(config, 20, 100);
          results.push({
            scenario: scenario.label,
            role,
            family,
            limit: 21,
            warmup: 20,
            measured: 100,
            latencyMs: latency,
            sqlExplain: explain,
          });
        }
      }
    }
    const concurrency = [];
    for (const role of ["LM", "CA"] as const) {
      for (const family of families) {
        const config = reader(dense, role, family);
        for (const width of [4, 8, 16] as const) {
          concurrency.push({
            scenario: "dense",
            role,
            family,
            ...(await measureConcurrency(config, width, 5)),
          });
        }
      }
    }
    const cpu = cpus()[0];
    const document = {
      task: "Issue 414 W8 real PG17 source reader benchmark",
      sourceCommit: "971e59abbdb9f509b6d10aa1df30c31490aba778",
      generatedAtUtc: new Date().toISOString(),
      environment: {
        pgVersion: server.version,
        pgVersionNum: server.version_num,
        blockSize: Number(server.block_size),
        node: process.version,
        platform: process.platform,
        cpuModel: cpu?.model ?? null,
        cpuCount: cpus().length,
        totalMemoryBytes: totalmem(),
        harness: "api-postgres-race, owned exclusive cluster lease",
      },
      methodology: {
        source:
          "real exported readers, current Staff session and Dashboard authorization",
        serial:
          "20 untimed warmup + 100 measured end-to-end transaction latencies per role/family/scenario",
        explain:
          "exact candidate SQL captured without altering reader, EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)",
        concurrency:
          "5 waves each at widths 4/8/16, shared Staff principal, includes locks/pool queue; descriptive only",
        syntheticData:
          "two isolated Organizations, sparse/dense Location, ineligible recent and terminal history, off-location sessions",
        limitations:
          "ephemeral local PG17 fixture; no ingress/network/staging, no production capacity or SLA claims",
      },
      scenarios: scenarioEvidence,
      serial: results,
      concurrency,
    };
    if (process.env.ISSUE414_CAPTURE_PG_EVIDENCE === "enabled") {
      mkdirSync(resolve(evidencePath, ".."), { recursive: true });
      writeFileSync(evidencePath, JSON.stringify(document, null, 2) + "\n");
      console.log(
        `W8 PG17 source performance evidence saved: ${evidencePath} (12 serial groups, 18 concurrency groups)`,
      );
    } else {
      console.log(
        "W8 PG17 benchmark completed: 12 serial + 18 concurrency groups. Set ISSUE414_CAPTURE_PG_EVIDENCE=enabled to explicitly refresh tracked evidence.",
      );
    }
  }, 300_000);
});
