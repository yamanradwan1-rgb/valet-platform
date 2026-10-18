import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import pg from "pg";
import ts from "typescript";

const raw = globalThis.process.env.ISSUE300_PG_TEST_URL;
if (!raw) throw new Error("Dedicated G2 URL is required");
const uri = new globalThis.URL(raw);
if (uri.hostname !== "127.0.0.1" || uri.port !== "55480" ||
    uri.pathname !== "/issue300_g2" || uri.search || uri.hash)
  throw new Error("Refusing non-G2 database");
const sourceDir = join(dirname(fileURLToPath(import.meta.url)),
  "../../src/modules/management/audit-investigation");
function load(relative, deps = {}) {
  const output = ts.transpileModule(readFileSync(join(sourceDir, relative), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = { exports: {}, require(name) {
    if (!(name in deps)) throw new Error("Unexpected module " + name);
    return deps[name];
  } };
  vm.runInNewContext(output, context);
  return context.exports;
}
const catalog = ["VALET_SESSION_PARKED", "INCIDENT_OPENED"];
const witnesses = load("search/search-witness-sql.ts");
const search = load("search/search-page-query.ts", {
  "./search-witness-sql": witnesses,
  "../../management-audit-event-catalog": { managementAuditKnownEventTypes: catalog },
});
const timeline = load("timeline/timeline-source-query.ts");
const ids = Object.fromEntries(["vehicle", "session", "task", "incident",
  "auditTask", "auditIncident", "auditConflict", "auditNullMeta",
  "secondTask", "auditDifferentValidTask", "auditUnknownType",
  "retrievalTask", "auditWrongTaskType", "auditCanonical",
  "auditNullDirectCanonical", "auditLegacyTaskPositive"]
  .map((key) => [key, randomUUID()]));
const db = new pg.Client({ connectionString: raw,
  application_name: "issue300_option_b_late_parent_proof" });
await db.connect();
const writer = new pg.Client({ connectionString: raw,
  application_name: "issue300_option_b_held_parent_writer" });
let open = false;
let inserted = false;
let writerOpen = false;
let writerConnected = false;
async function expectImmutable(statement, args = []) {
  await db.query("SAVEPOINT option_b_immutable");
  let error;
  try { await db.query(statement, args); } catch (caught) { error = caught; }
  await db.query("ROLLBACK TO SAVEPOINT option_b_immutable");
  await db.query("RELEASE SAVEPOINT option_b_immutable");
  assert.equal(error?.code, "23514", "Association update must fail in DB trigger");
  assert.match(String(error?.message), /ISSUE300_.*IMMUTABLE/);
}
const window = ["2026-10-16T11:00:00Z", "2026-10-16T12:00:00Z"];
try {
  await writer.connect(); writerConnected = true;
  assert.equal((await db.query("SELECT current_database() AS name")).rows[0].name,
    "issue300_g2");
  const migrated = await db.query(`SELECT count(*)::int AS total FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`);
  assert.equal(migrated.rows[0].total, 96);
  const legacyTask = (await db.query(`SELECT
    count(*) FILTER (WHERE pagination_birth_xid IS NULL)::int AS preserved
    FROM tasks`)).rows[0];
  assert.ok(legacyTask.preserved > 0,
    "At least one genuine pre-cutover Task must retain an unknown legacy XID");
  const fixture = (await db.query(`SELECT s.organization_id AS org,
      s.location_id AS loc,s.checked_in_by_membership_id AS actor
    FROM valet_sessions s JOIN organizations org ON org.id=s.organization_id
    WHERE org.name='Task Issue300' ORDER BY s.created_at,s.id LIMIT 1`)).rows[0];
  assert.ok(fixture?.org && fixture?.loc && fixture?.actor);
  const { org, loc, actor } = fixture;
  const snapshot = async () => (await db.query(
    "SELECT clock_timestamp() AS now,pg_current_snapshot()::text AS x"))
    .rows[0];
  const searchAt = async (s) => (await db.query(
    search.auditInvestigationFirstPageSql,
    [org,loc,...window,null,null,null,null,s.now,s.x,101,null,null,
      ids.session,catalog,null,null])).rows;
  const timelineAt = async (s) => (await db.query(timeline.timelineSourceSql,
    [org,loc,ids.session,101,null,null,s.x,s.now,null,null,null])).rows;

  await db.query("BEGIN"); open = true;
  await db.query(`INSERT INTO vehicles(id,organization_id,make,model,
    temporary_descriptor,updated_at) VALUES ($1,$2,'G2','OptionB','LOCAL',now())`,
  [ids.vehicle,org]);
  await db.query(`INSERT INTO valet_sessions(id,organization_id,location_id,
    vehicle_id,state,checked_in_by_membership_id,customer_access_token_hash,
    customer_access_expires_at,updated_at)
    VALUES($1,$2,$3,$4,'PARKED',$5,$6,now()+interval '1 day',now())`,
  [ids.session,org,loc,ids.vehicle,actor,"issue300-option-b:"+randomUUID()]);
  for (const [auditId,kind,entity,eventType] of [
    [ids.auditTask,"Task",ids.task,"VALET_SESSION_PARKED"],
    [ids.auditIncident,"Incident",ids.incident,"INCIDENT_OPENED"],
  ]) await db.query(`INSERT INTO audit_events(id,organization_id,location_id,
      actor_membership_id,actor_type,event_type,entity_type,entity_id,
      metadata_json,occurred_at)
      VALUES($1,$2,$3,$4,'MEMBERSHIP',$5,$6,$7,'{}'::jsonb,$8)`,
    [auditId,org,loc,actor,eventType,kind,entity,"2026-10-16T11:32:00Z"]);
  inserted = true;
  await db.query("COMMIT"); open = false;

  const s0 = await snapshot();
  assert.equal((await searchAt(s0)).length, 0);
  assert.equal((await timelineAt(s0)).length, 0);
  // The parent transaction is intentionally OPEN on a second connection
  // when the reader captures S_held; commit must never retroactively change it.
  await writer.query("BEGIN"); writerOpen = true;
  await writer.query(`INSERT INTO tasks(id,organization_id,location_id,
    valet_session_id,task_type,status,updated_at,pagination_birth_xid)
    VALUES($1,$2,$3,$4,'PARKING','QUEUED',now(),'1'::xid8)`,
    [ids.task,org,loc,ids.session]);
  await writer.query(`INSERT INTO incidents(id,organization_id,location_id,
    valet_session_id,status,severity,type,description,reported_by_membership_id)
    VALUES($1,$2,$3,$4,'OPEN','LOW','OPTION_B_PROOF','G2 ONLY',$5)`,
    [ids.incident,org,loc,ids.session,actor]);
  const parentMarkers = (await writer.query(`SELECT
    (SELECT pagination_birth_xid::text FROM tasks WHERE id=$1) AS task,
    (SELECT pagination_birth_xid::text FROM incidents WHERE id=$2) AS incident`,
    [ids.task,ids.incident])).rows[0];
  assert.ok(parentMarkers.task && parentMarkers.incident);
  assert.notEqual(parentMarkers.task,"1",
    "DB INSERT trigger must ignore a forged Task birth transaction");
  const sHeld = await snapshot();
  assert.equal((await searchAt(sHeld)).length, 0,
    "New Task/Incident parent must remain invisible while writer holds BEGIN");
  assert.equal((await timelineAt(sHeld)).length, 0);
  await writer.query("COMMIT"); writerOpen = false;

  assert.equal((await searchAt(s0)).length, 0,
    "Old S0 must not gain a newly committed Task/Incident parent");
  assert.equal((await timelineAt(s0)).length, 0,
    "Old S0 must not gain a newly committed parent in timeline");
  assert.equal((await searchAt(sHeld)).length, 0,
    "Captured snapshot cannot gain previously uncommitted parents after COMMIT");
  assert.equal((await timelineAt(sHeld)).length, 0);
  const s1 = await snapshot();
  const newSearch = await searchAt(s1);
  const newTimeline = await timelineAt(s1);
  assert.equal(newSearch.length,1);
  assert.deepEqual(new Set(newSearch[0].reasons.map((r) => r.eventId)),
    new Set([ids.auditTask,ids.auditIncident]));
  for (const id of [ids.auditTask,ids.auditIncident])
    assert.ok(newTimeline.some((r) => r.source === "AUDIT" && r.id === id));
  assert.ok(newTimeline.some((r) => r.source === "INCIDENT" &&
    r.id === ids.incident));
  globalThis.console.log("PASS B-R03: two connections with held Task/Incident COMMIT preserve S0/S-held; fresh S1 admits canonical references");

  // Conflicting Task entity and PARKED JSON hint cannot be certified by one
  // joined Task. JSON null is also a present but invalid historical hint.
  await db.query("BEGIN"); open = true;
  await db.query(`INSERT INTO tasks(id,organization_id,location_id,
      valet_session_id,task_type,status,updated_at)
      VALUES($1,$2,$3,$4,'PARKING','COMPLETED',now())`,
    [ids.secondTask,org,loc,ids.session]);
  await db.query(`INSERT INTO tasks(id,organization_id,location_id,
      valet_session_id,task_type,status,updated_at)
      VALUES($1,$2,$3,$4,'RETRIEVAL','COMPLETED',now())`,
    [ids.retrievalTask,org,loc,ids.session]);
  for (const [id,badMetadata] of [
    [ids.auditConflict,{ taskId: randomUUID() }],
    [ids.auditNullMeta,{ taskId: null }],
    [ids.auditDifferentValidTask,{ taskId: ids.secondTask }],
  ]) await db.query(`INSERT INTO audit_events(id,organization_id,location_id,
      actor_membership_id,actor_type,event_type,entity_type,entity_id,
      metadata_json,occurred_at)
      VALUES($1,$2,$3,$4,'MEMBERSHIP','VALET_SESSION_PARKED',
        'Task',$5,$6::jsonb,$7)`,
    [id,org,loc,actor,ids.task,JSON.stringify(badMetadata),
      "2026-10-16T11:32:00Z"]);
  await db.query(`INSERT INTO audit_events(id,organization_id,location_id,
      actor_membership_id,actor_type,event_type,entity_type,entity_id,
      metadata_json,occurred_at)
      VALUES($1,$2,$3,$4,'MEMBERSHIP','VALET_SESSION_PARKED',
        'UNKNOWN_SOURCE',$5,$6::jsonb,$7)`,
    [ids.auditUnknownType,org,loc,actor,randomUUID(),
      JSON.stringify({ taskId: ids.task }),"2026-10-16T11:32:00Z"]);
  await db.query(`INSERT INTO audit_events(id,organization_id,location_id,
      actor_membership_id,actor_type,event_type,entity_type,entity_id,
      metadata_json,occurred_at)
      VALUES($1,$2,$3,$4,'MEMBERSHIP','VALET_SESSION_PARKED',
        'Task',$5,'{}'::jsonb,$6)`,
    [ids.auditWrongTaskType,org,loc,actor,ids.retrievalTask,
      "2026-10-16T11:32:00Z"]);
  // Exact real Parking writer shape: direct Session, matching Session entity,
  // a single verified same-Session PARKING Task reference.
  await db.query(`INSERT INTO audit_events(id,organization_id,location_id,
      valet_session_id,actor_membership_id,actor_type,event_type,
      entity_type,entity_id,metadata_json,occurred_at)
      VALUES($1,$2,$3,$4,$5,'MEMBERSHIP','VALET_SESSION_PARKED',
        'VALET_SESSION',$4,$6::jsonb,$7)`,
    [ids.auditCanonical,org,loc,ids.session,actor,
      JSON.stringify({ taskId: ids.task }),"2026-10-16T11:32:00Z"]);
  await db.query(`INSERT INTO audit_events(id,organization_id,location_id,
      actor_membership_id,actor_type,event_type,entity_type,entity_id,
      metadata_json,occurred_at)
      VALUES($1,$2,$3,$4,'MEMBERSHIP','VALET_SESSION_PARKED',
        'VALET_SESSION',$5,$6::jsonb,$7)`,
    [ids.auditNullDirectCanonical,org,loc,actor,ids.session,
      JSON.stringify({ taskId: ids.task }),"2026-10-16T11:32:00Z"]);
  await db.query(`INSERT INTO audit_events(id,organization_id,location_id,
      actor_membership_id,actor_type,event_type,entity_type,entity_id,
      metadata_json,occurred_at)
      VALUES($1,$2,$3,$4,'MEMBERSHIP','VALET_SESSION_PARKED',
        'Task',$5,$6::jsonb,$7)`,
    [ids.auditLegacyTaskPositive,org,loc,actor,ids.task,
      JSON.stringify({ taskId: ids.task }),"2026-10-16T11:32:00Z"]);
  await db.query("COMMIT"); open = false;
  const s2 = await snapshot();
  const filteredIds = (await searchAt(s2)).flatMap((r) =>
    r.reasons.map((reason) => reason.eventId));
  const timelineIds = (await timelineAt(s2)).map((r) => r.id);
  for (const id of [ids.auditCanonical,ids.auditNullDirectCanonical,
    ids.auditLegacyTaskPositive]) {
    assert.ok(filteredIds.includes(id),
      "Valid canonical or legacy PARKED reference must be searchable");
    assert.ok(timelineIds.includes(id),
      "Valid canonical or legacy PARKED reference must appear on timeline");
  }
  for (const id of [ids.auditConflict,ids.auditNullMeta,
    ids.auditDifferentValidTask,ids.auditUnknownType,ids.auditWrongTaskType]) {
    assert.ok(!filteredIds.includes(id));
    assert.ok(!timelineIds.includes(id));
  }
  globalThis.console.log("PASS B-PARKED: missing/null/conflicting valid Task and unknown entity references denied by Search and Timeline");

  await db.query("BEGIN"); open = true;
  await expectImmutable("UPDATE tasks SET valet_session_id=$2 WHERE id=$1",
    [ids.task,randomUUID()]);
  await expectImmutable("UPDATE tasks SET task_type='RETRIEVAL' WHERE id=$1",
    [ids.task]);
  await expectImmutable("UPDATE incidents SET valet_session_id=$2 WHERE id=$1",
    [ids.incident,randomUUID()]);
  await expectImmutable("UPDATE incidents SET reported_by_membership_id=$2 WHERE id=$1",
    [ids.incident,randomUUID()]);
  await expectImmutable("UPDATE valet_sessions SET vehicle_id=$2 WHERE id=$1",
    [ids.session,randomUUID()]);
  await expectImmutable("UPDATE audit_events SET entity_id=$2 WHERE id=$1",
    [ids.auditTask,randomUUID()]);
  await expectImmutable("UPDATE audit_events SET controlled_operator_ref='G2-TAMPER' WHERE id=$1",
    [ids.auditTask]);
  await expectImmutable("UPDATE audit_events SET idempotency_key='G2-TAMPER' WHERE id=$1",
    [ids.auditTask]);
  await expectImmutable("UPDATE valet_sessions SET checked_in_by_membership_id=$2 WHERE id=$1",
    [ids.session,randomUUID()]);
  await expectImmutable("UPDATE valet_sessions SET created_at=created_at+interval '1 second' WHERE id=$1",
    [ids.session]);
  await db.query("UPDATE tasks SET version=version+1 WHERE id=$1",[ids.task]);
  await db.query("UPDATE incidents SET status='INVESTIGATING' WHERE id=$1",
    [ids.incident]);
  await db.query("UPDATE valet_sessions SET version=version+1 WHERE id=$1",
    [ids.session]);
  await db.query("UPDATE tasks SET pagination_birth_xid='1'::xid8 WHERE id=$1",
    [ids.task]);
  assert.equal((await db.query(`SELECT pagination_birth_xid::text AS xid
    FROM tasks WHERE id=$1`,[ids.task])).rows[0].xid,parentMarkers.task);
  await db.query("ROLLBACK"); open = false;
  globalThis.console.log("PASS B-immutability: Task/Incident/Session/Audit reparenting and supplementary attribution frozen; projection updates allowed; Task birth unspoofable");
} finally {
  if (open) await db.query("ROLLBACK").catch(() => undefined);
  if (writerOpen) await writer.query("ROLLBACK").catch(() => undefined);
  let cleanupError;
  if (inserted) for (const [table,id] of [
    ["audit_events",ids.auditConflict],["audit_events",ids.auditNullMeta],
    ["audit_events",ids.auditDifferentValidTask],
    ["audit_events",ids.auditUnknownType],
    ["audit_events",ids.auditWrongTaskType],
    ["audit_events",ids.auditCanonical],
    ["audit_events",ids.auditNullDirectCanonical],
    ["audit_events",ids.auditLegacyTaskPositive],
    ["audit_events",ids.auditTask],["audit_events",ids.auditIncident],
    ["incidents",ids.incident],["tasks",ids.retrievalTask],
    ["tasks",ids.secondTask],["tasks",ids.task],
    ["valet_sessions",ids.session],["vehicles",ids.vehicle],
  ]) try { await db.query(`DELETE FROM ${table} WHERE id=$1`,[id]); }
    catch (error) { cleanupError ??= error; }
  const ended = await Promise.allSettled([
    db.end(),...(writerConnected ? [writer.end()] : []),
  ]);
  if (cleanupError) throw cleanupError;
  assert.ok(ended.every((r) => r.status === "fulfilled"), "Close both G2 clients");
}
