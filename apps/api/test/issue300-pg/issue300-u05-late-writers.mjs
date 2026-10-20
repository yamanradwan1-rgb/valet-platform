import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import ts from "typescript";
import vm from "node:vm";

const conn = globalThis.process.env.ISSUE300_PG_TEST_URL;
if (!conn) throw new Error("Explicit dedicated G2 connection required");
const u = new globalThis.URL(conn);
if (u.hostname !== "127.0.0.1" || u.port !== "55480" ||
    u.pathname !== "/issue300_g2" || u.search || u.hash)
  throw new Error("Refuse cross-database test");
const dir = join(dirname(fileURLToPath(import.meta.url)),
  "../../src/modules/management/audit-investigation/search");
function load(name, stubs = {}) {
  const source = ts.transpileModule(readFileSync(join(dir, name), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const ctx = { exports: {}, require(key) {
    if (!(key in stubs)) throw new Error(`Missing isolated source stub ${key}`);
    return stubs[key];
  } };
  vm.runInNewContext(source.outputText, ctx);
  return ctx.exports;
}
const known = ["VALET_SESSION_PARKED", "INCIDENT_OPENED"];
const witnesses = load("search-witness-sql.ts");
const search = load("search-page-query.ts", {
  "./search-witness-sql": witnesses,
  "../../management-audit-event-catalog": { managementAuditKnownEventTypes: known },
});
const writer = new pg.Client({ connectionString: conn,
  application_name: "issue300_u05_delayed_writer_A" });
const reader = new pg.Client({ connectionString: conn,
  application_name: "issue300_u05_reader_B" });
const later = new pg.Client({ connectionString: conn,
  application_name: "issue300_u05_followup_reader_C" });
let pending = false;
let inserted = false;
const ids = { audit: randomUUID(), custody: randomUUID(),
  dispatch: randomUUID(), incident: randomUUID() };
await Promise.all([writer.connect(), reader.connect(), later.connect()]);
try {
  assert.equal((await reader.query("SELECT current_database() AS db")).rows[0]?.db,
    "issue300_g2");
  const row = (await reader.query(
    `SELECT s.organization_id AS org,s.location_id AS loc,s.id AS session,
       s.checked_in_by_membership_id AS actor,t.id AS task,k.id AS slot
     FROM valet_sessions s
     JOIN tasks t ON t.organization_id=s.organization_id
       AND t.location_id=s.location_id AND t.valet_session_id=s.id
     JOIN key_slots k ON k.organization_id=s.organization_id
       AND k.location_id=s.location_id
     JOIN organizations org ON org.id=s.organization_id
     WHERE org.name='Task Issue300' ORDER BY s.created_at DESC LIMIT 1`,
  )).rows[0];
  assert.ok(row?.org && row?.loc && row?.session && row?.task && row?.slot);
  const start = "2026-10-16T11:00:00Z";
  const end = "2026-10-16T12:00:00Z";
  const source = async (client, anchor) => {
    const values = [row.org, row.loc, start, end, null, null,
      null, null, anchor.now, anchor.snapshot, 101, null, null,
      row.session, known, null, null];
    return (await client.query(search.auditInvestigationFirstPageSql, values)).rows[0];
  };
  await writer.query("BEGIN");
  pending = true;
  const xid = (await writer.query("SELECT pg_current_xact_id()::text AS xid")).rows[0].xid;
  await writer.query(
    `INSERT INTO key_custody_events(id,organization_id,location_id,
        valet_session_id,key_slot_id,actor_membership_id,event_type,
        occurred_at,created_at)
     VALUES($1,$2,$3,$4,$5,$6,'CHECKED_OUT',$7,$7)`,
    [ids.custody,row.org,row.loc,row.session,row.slot,row.actor,start],
  );
  await writer.query(
    `INSERT INTO dispatch_events(id,organization_id,location_id,
        task_id,valet_session_id,event_type,actor_membership_id,
        new_assignee_membership_id,occurred_at,created_at)
     VALUES($1,$2,$3,$4,$5,'ASSIGNED',$6,$6,$7,$7)`,
    [ids.dispatch,row.org,row.loc,row.task,row.session,row.actor,start],
  );
  await writer.query(
    `INSERT INTO incidents(id,organization_id,location_id,valet_session_id,
        status,severity,type,description,reported_by_membership_id,created_at)
     VALUES($1,$2,$3,$4,'OPEN','LOW','G2_LATE_COMMIT',
        'G2 test-only redacted',$5,$6)`,
    [ids.incident,row.org,row.loc,row.session,row.actor,start],
  );
  await writer.query(
    `INSERT INTO audit_events(id,organization_id,location_id,
        valet_session_id,actor_membership_id,actor_type,event_type,
        entity_type,entity_id,metadata_json,occurred_at,created_at)
     VALUES($1,$2,$3,$4,$5,'MEMBERSHIP','VALET_SESSION_PARKED',
        'ValetSession',$4,'{}'::jsonb,$6,$6)`,
    [ids.audit,row.org,row.loc,row.session,row.actor,start],
  );
  const initial = (await reader.query(
    "SELECT clock_timestamp() AS now, pg_current_snapshot()::text AS snapshot",
  )).rows[0];
  const baseline = await source(reader, initial);
  assert.ok(baseline?.sessionId === row.session);
  const baselineReasons = new Set(baseline.reasons.map((x) => x.eventId));
  assert.ok(Object.values(ids).every((id) => !baselineReasons.has(id)));
  await writer.query("COMMIT");
  pending = false;
  inserted = true;
  const old = await source(later, initial);
  assert.equal(old?.matchingRecordCount, baseline.matchingRecordCount);
  const oldReasons = new Set(old.reasons.map((x) => x.eventId));
  assert.ok(Object.values(ids).every((id) => !oldReasons.has(id)));
  const current = (await later.query(
    "SELECT clock_timestamp() AS now, pg_current_snapshot()::text AS snapshot",
  )).rows[0];
  const admitted = await source(later, current);
  assert.equal(admitted?.matchingRecordCount, baseline.matchingRecordCount + 4);
  const markers = await later.query(
    `SELECT source,birth,pg_visible_in_snapshot(birth,$5::pg_snapshot) AS old,
       pg_visible_in_snapshot(birth,$6::pg_snapshot) AS current
     FROM (SELECT 'AUDIT' AS source,pagination_birth_xid AS birth FROM audit_events WHERE id=$1
     UNION ALL SELECT 'KEY_CUSTODY',pagination_birth_xid FROM key_custody_events WHERE id=$2
     UNION ALL SELECT 'DISPATCH',pagination_birth_xid FROM dispatch_events WHERE id=$3
     UNION ALL SELECT 'INCIDENT',pagination_birth_xid FROM incidents WHERE id=$4) rows`,
    [ids.audit,ids.custody,ids.dispatch,ids.incident,initial.snapshot,current.snapshot],
  );
  assert.equal(markers.rows.length, 4);
  assert.ok(markers.rows.every((e) => e.birth && e.birth.toString() === xid &&
    e.old === false && e.current === true));
  globalThis.console.log("PASS U05-R01/R03 subset: 3 distinct G2 DB connections; one delayed COMMIT with all four source types, old occurredAt/createdAt; S0 excludes all four after commit; later S1 admits all four; same source transaction xid8; no fabricated metadata");
} finally {
  if (pending) await writer.query("ROLLBACK").catch(() => undefined);
  if (inserted) {
    for (const [table, id] of [
      ["audit_events", ids.audit], ["key_custody_events", ids.custody],
      ["dispatch_events", ids.dispatch], ["incidents", ids.incident],
    ]) {
      // Only these four random task-owned records; never remove legacy/user
      // fixtures or use broad cleanup predicates.
      await later.query(`DELETE FROM ${table} WHERE id=$1`, [id]);
    }
    globalThis.console.log("PASS G2 cleanup: four test-only records removed by exact UUID");
  }
  await Promise.all([writer.end(), reader.end(), later.end()]);
}
