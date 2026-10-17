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
  application_name: "issue300_explain_rollback_only" });
await client.connect();
let inTransaction = false;
try {
  assert.equal((await client.query("SELECT current_database() AS name")).rows[0].name,
    "issue300_g2");
  const target = (await client.query(
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
     id uuid PRIMARY KEY) ON COMMIT DROP`);
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
       AND session.state='PARKED' LIMIT 900`,
    [target.org, target.loc, target.membership, target.slot],
  );
  const snapshot = (await client.query(
    "SELECT clock_timestamp() AS now, pg_current_snapshot()::text AS snapshot",
  )).rows[0];
  const params = [target.org, target.loc, "2026-10-16T11:00:00Z",
    "2026-10-16T12:00:00Z", null, null, null, null,
    snapshot.now, snapshot.snapshot, 101, null, null, null, known];
  const explain = await client.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${search.auditInvestigationFirstPageSql}`,
    params,
  );
  const plan = explain.rows[0]["QUERY PLAN"][0];
  const methods = [];
  function walk(node) {
    if (node["Sort Method"]) methods.push(node["Sort Method"]);
    for (const sub of node.Plans ?? []) walk(sub);
  }
  walk(plan.Plan);
  const measurements = [];
  for (let i = 0; i < 22; i += 1) {
    const start = performance.now();
    const result = await client.query(search.auditInvestigationFirstPageSql, params);
    assert.ok(result.rows.length <= 101);
    measurements.push(performance.now() - start);
  }
  const sorted = measurements.slice(2).sort((a, b) => a - b);
  const percentile = (q) => sorted[Math.min(sorted.length - 1,
    Math.ceil(sorted.length * q) - 1)].toFixed(2);
  globalThis.console.log(JSON.stringify({
    classification: "DISPOSABLE_SQL_FIXTURES_NOT_REAL_WRITERS",
    candidate: "task-owned G2 PostgreSQL 17.10",
    sessionFixtureCount: 3500, sourceFixtureCount: 900,
    executionMs: plan["Execution Time"], planningMs: plan["Planning Time"],
    buffers: { hits: plan.Plan["Shared Hit Blocks"],
      reads: plan.Plan["Shared Read Blocks"] },
    sortMethods: methods, p50Ms: percentile(0.5), p95Ms: percentile(0.95),
    samples: sorted.length, resultCap: 101,
    disclaimer: "Single-client hot-cache timing, not p95 under operational load or 100k/1m",
  }));
  await client.query("ROLLBACK");
  inTransaction = false;
  globalThis.console.log("PASS: performance fixture transaction rolled back");
} finally {
  if (inTransaction) await client.query("ROLLBACK").catch(() => undefined);
  await client.end();
}
