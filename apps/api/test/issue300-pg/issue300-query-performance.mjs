import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import pg from "pg";
import ts from "typescript";
import vm from "node:vm";

const raw = globalThis.process.env.ISSUE300_PG_TEST_URL;
if (!raw) throw new Error("Require explicit task-owned PostgreSQL URL");
const address = new globalThis.URL(raw);
if (address.hostname !== "127.0.0.1" || address.port !== "55480" ||
    address.pathname !== "/issue300_g2" || address.search || address.hash)
  throw new Error("Refusing non-task PostgreSQL");
const src = join(dirname(fileURLToPath(import.meta.url)),
  "../../src/modules/management/audit-investigation/search");

function load(file, stubs = {}) {
  const output = ts.transpileModule(readFileSync(join(src, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const context = { exports: {}, require(name) {
    if (!(name in stubs)) throw new Error(`Unrecognized ${name}`);
    return stubs[name];
  } };
  vm.runInNewContext(output.outputText, context);
  return context.exports;
}

const known = ["VALET_SESSION_PARKED", "INCIDENT_OPENED"];
const witnesses = load("search-witness-sql.ts");
const search = load("search-page-query.ts", {
  "./search-witness-sql": witnesses,
  "../../management-audit-event-catalog": { managementAuditKnownEventTypes: known },
});
const client = new pg.Client({ connectionString: raw,
  application_name: "issue300_explain_committed_disposable" });
await client.connect();
let inTransaction = false;
let committedFixture = false;
let target;
let cleanupError;
try {
  assert.equal((await client.query("SELECT current_database() AS name")).rows[0].name,
    "issue300_g2");
  target = (await client.query(
    `SELECT l.organization_id AS org, l.id AS loc,
       (SELECT id FROM organization_memberships m
        WHERE m.organization_id = l.organization_id LIMIT 1) AS membership,
       (SELECT id FROM key_slots k WHERE k.organization_id = l.organization_id
        AND k.location_id = l.id LIMIT 1) AS slot
     FROM locations l JOIN organizations o ON o.id=l.organization_id
     WHERE o.name='Task Issue300' LIMIT 1`,
  )).rows[0];
  if (!target?.org || !target?.loc || !target?.membership || !target?.slot)
    throw new Error("No test Location; seed isolated auth fixtures first");
  await client.query("BEGIN");
  inTransaction = true;
  await client.query(`CREATE TEMP TABLE issue300_perf_vehicles(
     id uuid PRIMARY KEY) ON COMMIT PRESERVE ROWS`);
  await client.query(`INSERT INTO issue300_perf_vehicles(id)
     SELECT gen_random_uuid() FROM generate_series(1, 3500)`);
  await client.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     SELECT id,$1::uuid,'perf TEST ONLY',now() FROM issue300_perf_vehicles`,
    [target.org],
  );
  await client.query(
    `INSERT INTO valet_sessions(id,organization_id,location_id,vehicle_id,
       state,checked_in_by_membership_id,customer_access_token_hash,
       customer_access_expires_at,updated_at)
     SELECT gen_random_uuid(),$1::uuid,$2::uuid,id,'PARKED',$3::uuid,
       'disabled-perf:' || id::text,now()+interval '1 day',now()
     FROM issue300_perf_vehicles`,
    [target.org, target.loc, target.membership],
  );
  await client.query(
    `INSERT INTO key_custody_events(id,organization_id,location_id,
       valet_session_id,key_slot_id,actor_membership_id,event_type,occurred_at)
     SELECT gen_random_uuid(),$1::uuid,$2::uuid,session.id,$4::uuid,$3::uuid,
       'CHECKED_OUT','2026-10-16T11:30:00Z'
     FROM valet_sessions session
     WHERE session.organization_id=$1 AND session.location_id=$2
       AND session.vehicle_id IN (SELECT id FROM issue300_perf_vehicles)
       AND session.state='PARKED' LIMIT 900`,
    [target.org, target.loc, target.membership, target.slot],
  );
  // Commit the strictly task-owned fixture before S0: otherwise INSERT birth
  // XIDs are in-progress relative to the snapshot and the query measures a
  // zero-match case, not the cost of 900 historical source witnesses.
  await client.query("COMMIT");
  inTransaction = false;
  committedFixture = true;
  const snapshot = (await client.query(
    "SELECT clock_timestamp() AS now, pg_current_snapshot()::text AS snapshot",
  )).rows[0];
  const params = [target.org, target.loc, "2026-10-16T11:00:00Z",
    "2026-10-16T12:00:00Z", null, null, null, null,
    snapshot.now, snapshot.snapshot, 101, null, null, null, known,
    null, null];
  const explain = await client.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${search.auditInvestigationFirstPageSql}`,
    params,
  );
  const plan = explain.rows[0]["QUERY PLAN"][0];
  assert.equal(plan.Plan["Actual Rows"], 101,
    "Real committed fixture must fill the 101-row bounded first page");
  const methods = [];
  const expensiveNodes = [];
  function walk(node, parent = null) {
    if (node["Sort Method"]) methods.push(node["Sort Method"]);
    const childHits = (node.Plans ?? []).reduce(
      (total, child) => total + (child["Shared Hit Blocks"] ?? 0), 0);
    // EXPLAIN's descendant/CTE buffer counters are inclusive and can be
    // repeated; these are *estimates*, never additive self-work attribution.
    const apparentLocalHits = Math.max(0,
      (node["Shared Hit Blocks"] ?? 0) - childHits);
    expensiveNodes.push({
      node: node["Node Type"], parent,
      relation: node["Relation Name"] ?? null,
      index: node["Index Name"] ?? null,
      loops: node["Actual Loops"], rows: node["Actual Rows"],
      timeMs: node["Actual Total Time"], apparentLocalHits,
      inclusiveHits: node["Shared Hit Blocks"] ?? 0,
      join: node["Join Type"] ?? null,
      indexCondition: node["Index Cond"] ?? null,
      filter: node.Filter ?? null,
      rowsRemovedByFilter: node["Rows Removed by Filter"] ?? null,
    });
    for (const sub of node.Plans ?? []) walk(sub, node["Node Type"]);
  }
  walk(plan.Plan);
  const measurements = [];
  for (let i = 0; i < 22; i += 1) {
    const start = performance.now();
    const result = await client.query(search.auditInvestigationFirstPageSql, params);
    assert.equal(result.rows.length, 101);
    measurements.push(performance.now() - start);
  }
  const sorted = measurements.slice(2).sort((a, b) => a - b);
  const percentile = (q) => sorted[Math.min(sorted.length - 1,
    Math.ceil(sorted.length * q) - 1)].toFixed(2);
  globalThis.console.log(JSON.stringify({
    classification: "DISPOSABLE_SQL_FIXTURES_NOT_REAL_WRITERS",
    candidate: "task-owned G2 PostgreSQL 17.10",
    sessionFixtureCount: 3500, sourceFixtureCount: 900,
    committedFixturesVisibleAtSnapshot: true,
    executionMs: plan["Execution Time"], planningMs: plan["Planning Time"],
    buffers: { hits: plan.Plan["Shared Hit Blocks"],
      reads: plan.Plan["Shared Read Blocks"] },
    sortMethods: methods, p50Ms: percentile(0.5), p95Ms: percentile(0.95),
    samples: sorted.length, resultCap: 101,
    hotspotNodes: expensiveNodes.sort((a, b) =>
      b.apparentLocalHits - a.apparentLocalHits ||
      b.timeMs - a.timeMs).slice(0, 10),
    bufferAttributionCaveat: "EXPLAIN Shared Hit Blocks inclusive/nonadditive (CTE counters may repeat); hotspotNodes show apparent-local estimates only",
    disclaimer: "Single-client hot-cache timing, not p95 under operational load or 100k/1m",
  }));
} finally {
  if (inTransaction) await client.query("ROLLBACK").catch(() => undefined);
  if (committedFixture && target?.org) {
    // Delete ONLY randomly generated test Session/Vehicle IDs, using this
    // connection's temporary UUID-key table, and validate G2 identity again.
    assert.equal((await client.query("SELECT current_database() AS db")).rows[0].db,
      "issue300_g2");
    await client.query("BEGIN");
    try {
      await client.query(
        `DELETE FROM key_custody_events WHERE organization_id=$1 AND
          valet_session_id IN (SELECT s.id FROM valet_sessions s JOIN
          issue300_perf_vehicles v ON v.id=s.vehicle_id)`, [target.org],
      );
      await client.query(
        `DELETE FROM valet_sessions WHERE organization_id=$1 AND
          vehicle_id IN (SELECT id FROM issue300_perf_vehicles)`, [target.org],
      );
      await client.query(
        `DELETE FROM vehicles WHERE organization_id=$1 AND
          id IN (SELECT id FROM issue300_perf_vehicles)`, [target.org],
      );
      await client.query("COMMIT");
      globalThis.console.log("PASS: 3,500 committed, random G2-only perf fixtures removed by exact UUID set");
    } catch (error) {
      await client.query("ROLLBACK");
      cleanupError = error;
    }
  }
  await client.end();
}
if (cleanupError) throw cleanupError;
