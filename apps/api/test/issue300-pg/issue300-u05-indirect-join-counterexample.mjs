import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import pg from "pg";
import ts from "typescript";

const raw = globalThis.process.env.ISSUE300_PG_TEST_URL;
if (!raw) throw new Error("Dedicated Issue300 G2 URL is required");
const u = new globalThis.URL(raw);
if (u.hostname !== "127.0.0.1" || u.port !== "55480" ||
    u.pathname !== "/issue300_g2" || u.search || u.hash)
  throw new Error("Refusing non-G2 database");

const folder = join(dirname(fileURLToPath(import.meta.url)),
  "../../src/modules/management/audit-investigation");
function load(relative, dependencies = {}) {
  const file = join(folder, relative);
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS },
  });
  const context = { exports: {}, require(key) {
    if (!(key in dependencies)) throw new Error("Unmocked module: " + key);
    return dependencies[key];
  } };
  vm.runInNewContext(compiled.outputText, context);
  return context.exports;
}
const known = ["VALET_SESSION_PARKED", "INCIDENT_OPENED"];
const witnesses = load("search/search-witness-sql.ts");
const search = load("search/search-page-query.ts", {
  "./search-witness-sql": witnesses,
  "../../management-audit-event-catalog": { managementAuditKnownEventTypes: known },
});
const timeline = load("timeline/timeline-source-query.ts");
const cohort = load("audit-investigation-u05-indirect-guard.ts");
const db = new pg.Client({ connectionString: raw,
  application_name: "issue300_u05_indirect_parent_phantom_oracle" });
await db.connect();
let committed = false;
let pending = false;
const ids = Object.fromEntries(["vehicle", "session", "task", "incident",
  "auditTask", "auditIncident"].map((name) => [name, randomUUID()]));
try {
  assert.equal((await db.query("SELECT current_database() AS db")).rows[0].db,
    "issue300_g2");
  const seed = (await db.query(
    `SELECT s.organization_id AS org, s.location_id AS loc,
       s.checked_in_by_membership_id AS actor
     FROM valet_sessions s JOIN organizations org ON org.id=s.organization_id
     WHERE org.name='Task Issue300' LIMIT 1`,
  )).rows[0];
  assert.ok(seed?.org && seed?.loc && seed?.actor);
  await db.query("BEGIN"); pending = true;
  await db.query(
    `INSERT INTO vehicles(id,organization_id,make,model,
       temporary_descriptor,updated_at)
     VALUES($1,$2,'G2','U05-INTEGRITY','G2 TEST ONLY',now())`,
    [ids.vehicle,seed.org],
  );
  await db.query(
    `INSERT INTO valet_sessions(id,organization_id,location_id,vehicle_id,
       state,checked_in_by_membership_id,customer_access_token_hash,
       customer_access_expires_at,updated_at)
     VALUES($1,$2,$3,$4,'PARKED',$5,$6,now()+interval '1 day',now())`,
    [ids.session,seed.org,seed.loc,ids.vehicle,seed.actor,
      "issue300-indirect-join:"+randomUUID()],
  );
  const when = "2026-10-16T11:32:00Z";
  for (const [id,entity,linked,kind] of [
    [ids.auditTask,"Task",ids.task,"VALET_SESSION_PARKED"],
    [ids.auditIncident,"Incident",ids.incident,"INCIDENT_OPENED"],
  ]) {
    await db.query(
      `INSERT INTO audit_events(id,organization_id,location_id,
         actor_membership_id,actor_type,event_type,entity_type,
         entity_id,metadata_json,occurred_at)
       VALUES($1,$2,$3,$4,'MEMBERSHIP',$5,$6,$7,'{}'::jsonb,$8)`,
      [id,seed.org,seed.loc,seed.actor,kind,entity,linked,when],
    );
  }
  await db.query("COMMIT"); pending = false; committed = true;
  const initial = (await db.query(
    `SELECT clock_timestamp() AS now, pg_current_snapshot()::text AS snapshot`,
  )).rows[0];
  const query = async () => (await db.query(search.auditInvestigationFirstPageSql, [
    seed.org,seed.loc,"2026-10-16T11:00:00Z","2026-10-16T12:00:00Z",
    null,null,null,null,initial.now,initial.snapshot,101,null,null,
    ids.session,known,null,null,
  ])).rows;
  const history = async () => (await db.query(timeline.timelineSourceSql, [
    seed.org,seed.loc,ids.session,101,null,null,initial.snapshot,
    initial.now,null,null,null,
  ])).rows;
  assert.equal((await query()).length,0);
  assert.equal((await history()).length,0);
  const scope = { organizationId: seed.org, locationId: seed.loc };
  const snapshot = { now: initial.now, database: initial.snapshot };
  await assert.rejects(
    cohort.requireU05StableIndirectCohort(db, scope, snapshot,
      { from: "2026-10-16T11:00:00Z", to: "2026-10-16T12:00:00Z" }),
    /U05_INDIRECT_TASK_INCIDENT_COHORT_UNPROVEN/,
  );
  await assert.rejects(cohort.requireU05StableIndirectCohort(db, scope, snapshot),
    /U05_INDIRECT_TASK_INCIDENT_COHORT_UNPROVEN/);
  // Both persisted Audit rows predate S0. Their source references did NOT
  // resolve at S0. Create the previously nonexistent entities after S0.
  await db.query("BEGIN"); pending = true;
  await db.query(
    `INSERT INTO tasks(id,organization_id,location_id,valet_session_id,
       task_type,status,updated_at)
     VALUES($1,$2,$3,$4,'PARKING','QUEUED',now())`,
    [ids.task,seed.org,seed.loc,ids.session],
  );
  await db.query(
    `INSERT INTO incidents(id,organization_id,location_id,valet_session_id,
       status,severity,type,description,reported_by_membership_id)
     VALUES($1,$2,$3,$4,'OPEN','LOW','U05_JOIN_RACE',
       'Test-only metadata, never return description',$5)`,
    [ids.incident,seed.org,seed.loc,ids.session,seed.actor],
  );
  await db.query("COMMIT"); pending = false;
  const after = await query();
  const correlated = (after[0]?.reasons ?? []).map((r) => r.eventId);
  const laterTimeline = await history();
  const newlyResolved = laterTimeline.filter((r) =>
    [ids.auditTask,ids.auditIncident].includes(r.id)).map((r) => r.id);
  assert.equal(after.length,1);
  assert.ok([ids.auditTask,ids.auditIncident].every((id) =>
    correlated.includes(id) && newlyResolved.includes(id)));
  assert.ok(!laterTimeline.some((r) => r.source === "INCIDENT" &&
    r.id === ids.incident));
  await assert.rejects(cohort.requireU05StableIndirectCohort(db, scope, snapshot),
    /U05_INDIRECT_TASK_INCIDENT_COHORT_UNPROVEN/);
  globalThis.console.log("PASS U05 P0 regression: old S0 can gain indirect Audit Task/Incident after later COMMIT; new snapshot cohort guard REFUSES both Search and Timeline pagination before and after link creation, rather than claiming stable pages.");
} finally {
  if (pending) await db.query("ROLLBACK").catch(() => undefined);
  if (committed) {
    // Exact randomly allocated task-only G2 records, in FK-safe order.
    for (const [table,id] of [
      ["audit_events",ids.auditTask],["audit_events",ids.auditIncident],
      ["incidents",ids.incident],["tasks",ids.task],
      ["valet_sessions",ids.session],["vehicles",ids.vehicle],
    ]) await db.query(`DELETE FROM ${table} WHERE id=$1`,[id]);
    globalThis.console.log("PASS G2 counterexample cleanup: six exact test UUIDs deleted");
  }
  await db.end();
}
