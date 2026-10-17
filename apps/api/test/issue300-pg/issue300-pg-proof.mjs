import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import pg from "pg";
import ts from "typescript";

import { prepareIssue300SqlWitnesses } from "./issue300-pg-fixture.mjs";

const urlText = globalThis.process.env.ISSUE300_PG_TEST_URL;
if (!urlText) throw new Error("Explicit ISSUE300_PG_TEST_URL required; no fallback database");
const url = new globalThis.URL(urlText);
if (url.hostname !== "127.0.0.1" || url.port !== "55480" ||
    url.pathname !== "/issue300_g2" || url.search || url.hash) {
  throw new Error("Refusing unknown/non-owned Issue300 PostgreSQL target");
}
const root = join(dirname(fileURLToPath(import.meta.url)), "../../src/modules/management/audit-investigation");
function loadTs(relative, stubs = {}) {
  const file = join(root, relative);
  const source = readFileSync(file, "utf8");
  const output = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const context = {
    exports: {},
    require(name) {
      if (!(name in stubs)) throw new Error("Unexpected runtime import " + name);
      return stubs[name];
    },
  };
  vm.runInNewContext(output.outputText, context, { filename: file });
  return context.exports;
}

const witness = loadTs("search/search-witness-sql.ts");
const known = ["VALET_SESSION_PARKED", "INCIDENT_OPENED"];
const search = loadTs("search/search-page-query.ts", {
  "./search-witness-sql": witness,
  "../../management-audit-event-catalog": { managementAuditKnownEventTypes: known },
});
const timeline = loadTs("timeline/timeline-source-query.ts");
const selectors = loadTs("search/search-selector-query.ts", {
  "../../management-audit-event-catalog": { managementAuditKnownEventTypes: known },
});
const client = new pg.Client({ connectionString: urlText, application_name: "issue300_g2_probe" });

function boundSearch(ids, snapshot, { slot = null, member = null, location = ids.location } = {}) {
  return [
    ids.org, location, "2026-10-16T11:00:00.000Z", "2026-10-16T12:00:00.000Z",
    slot, member, null, null, snapshot.now, snapshot.snapshot, 101,
    null, null, null, known,
  ];
}

await client.connect();
let transactionOpen = false;
try {
  const connection = await client.query(
    "SELECT current_database() AS db,current_user AS usr,current_setting('server_version') AS version",
  );
  assert.equal(connection.rows[0].db, "issue300_g2");
  assert.equal(connection.rows[0].usr, "issue300_owner");
  await client.query("BEGIN");
  transactionOpen = true;
  const { ids } = await prepareIssue300SqlWitnesses(client);
  const snapshotRow = await client.query(
    "SELECT clock_timestamp() AS now, pg_current_snapshot()::text AS snapshot",
  );
  const snap = snapshotRow.rows[0];
  const rows = (args) => client.query(search.auditInvestigationFirstPageSql, args)
    .then((result) => result.rows);

  const independent = await rows(boundSearch(ids, snap, {
    slot: ids.slot, member: ids.member,
  }));
  assert.deepEqual(independent.map((row) => row.sessionId), [ids.session]);
  assert.ok(independent[0].matchingRecordCount >= 2);
  assert.equal(independent[0].keySlotId, null);
  assert.equal(independent[0].hasVisibleIncident, true);
  assert.equal(independent[0].matchedIncidentCount, 0);
  assert.ok(independent[0].reasons.some((row) => row.matchedBy === "KEY_SLOT"));
  assert.ok(independent[0].reasons.some((row) => row.matchedBy === "EMPLOYEE"));
  globalThis.console.log("PASS PostgreSQL: T01/T30 separate in-window historical slot/employee witnesses; current slot NULL");

  const wrongMember = await rows(boundSearch(ids, snap, { member: ids.badMember }));
  assert.equal(wrongMember.length, 0);
  globalThis.console.log("PASS PostgreSQL: contradictory Task/Incident Audit entity links excluded");
  const unknownMember = await rows(boundSearch(ids, snap, { member: ids.unknownMember }));
  assert.equal(unknownMember.length, 0);
  globalThis.console.log("PASS PostgreSQL: UNKNOWN Audit actor cannot qualify employee witness");

  const metaMember = await rows(boundSearch(ids, snap, { member: ids.metaMember }));
  // This SQL fixture runs before COMMIT, so Audit pagination_birth_xid is
  // still in-progress relative to pg_current_snapshot(). Its Audit arm must
  // remain invisible. The committed metadata-only Search positive is tested
  // separately via actual guarded HTTP, not faked with a NULL birth marker.
  assert.equal(metaMember.length, 0);
  globalThis.console.log("PASS PostgreSQL: in-progress birth XID is excluded by Search snapshot");

  const locationWrong = await rows(boundSearch(ids, snap, {
    member: ids.member, location: ids.secondLocation,
  }));
  assert.equal(locationWrong.length, 0);
  globalThis.console.log("PASS PostgreSQL: wrong Location cannot read Session evidence");

  const endpointMiss = await rows([
    ids.org, ids.location, "2026-10-16T11:04:00.000Z", "2026-10-16T11:08:00.000Z",
    ids.slot, ids.member, null, null, snap.now, snap.snapshot, 101,
    null, null, null, known,
  ]);
  assert.equal(endpointMiss.length, 0);
  globalThis.console.log("PASS PostgreSQL: [from,to) exclusive upper boundary when employee is at 'to'");

  const events = await client.query(timeline.timelineSourceSql, [
    ids.org, ids.location, ids.session, 101, null, null,
  ]);
  const keys = new Set(events.rows.map((item) => item.source + ":" + item.id));
  for (const kind of ["KEY_CUSTODY", "DISPATCH", "AUDIT", "INCIDENT"]) {
    assert.ok(events.rows.some((item) => item.source === kind));
  }
  assert.ok(keys.has("AUDIT:" + ids.audit));
  assert.ok(keys.has("AUDIT:" + ids.metadataAudit));
  assert.ok(!keys.has("AUDIT:" + ids.badMetadataAudit));
  assert.ok(!keys.has("AUDIT:" + ids.badTaskAudit));
  assert.ok(!keys.has("AUDIT:" + ids.badIncidentAudit));
  assert.equal(keys.size, events.rows.length);
  const rank = { AUDIT: 0, KEY_CUSTODY: 1, DISPATCH: 2, INCIDENT: 3 };
  for (let i = 1; i < events.rows.length; i += 1) {
    const prev = events.rows[i - 1];
    const cur = events.rows[i];
    const prevOrder = [prev.occurredAt.getTime(), rank[prev.source], prev.id];
    const curOrder = [cur.occurredAt.getTime(), rank[cur.source], cur.id];
    assert.ok(prevOrder[0] < curOrder[0] ||
      (prevOrder[0] === curOrder[0] && (prevOrder[1] < curOrder[1] ||
      (prevOrder[1] === curOrder[1] && prevOrder[2] < curOrder[2]))));
  }
  assert.ok(!JSON.stringify(events.rows).includes("PRIVATE TEST DESCRIPTION MUST NOT APPEAR"));
  globalThis.console.log("PASS PostgreSQL: timeline same Session, distinct source keys, excluded bad Audit aliases");

  // A single authorized Location with >20 actual historical participants must
  // be traversable without inventing a current assignee or merging duplicate names.
  const createdMembers = new Set();
  for (let i = 0; i < 25; i += 1) {
    const user = randomUUID();
    const member = randomUUID();
    const auditId = randomUUID();
    createdMembers.add(member);
    await client.query(
      `INSERT INTO users(id,email,password_hash,updated_at)
       VALUES($1,$2,'test-only-hash',now())`,
      [user, `${user}@issue300.invalid`],
    );
    await client.query(
      `INSERT INTO organization_memberships(id,organization_id,user_id,role,status,
        first_name,last_name,updated_at)
       VALUES($1,$2,$3,'VALET_EMPLOYEE','INACTIVE','Duplicate','Name',now())`,
      [member, ids.org, user],
    );
    await client.query(
      `INSERT INTO audit_events(id,organization_id,location_id,valet_session_id,
        actor_membership_id,actor_type,event_type,entity_type,entity_id,
        metadata_json,occurred_at)
       VALUES($1,$2,$3,$4,$5,'MEMBERSHIP','VALET_SESSION_PARKED',
        'ValetSession',$4,'{}'::jsonb,'2026-10-16T11:35:00Z')`,
      [auditId, ids.org, ids.location, ids.session, member],
    );
  }
  const memberSql = selectors.auditInvestigationSelectorStatements.memberSql;
  const first = await client.query(memberSql, [ids.org, ids.location, null, 21, null, known]);
  assert.equal(first.rows.length, 21);
  const last = first.rows[19].id;
  const next = await client.query(memberSql, [ids.org, ids.location, null, 21, last, known]);
  const combined = [...first.rows.slice(0, 20), ...next.rows];
  assert.equal(new Set(combined.map((row) => row.id)).size, combined.length);
  assert.ok(combined.length >= 25);
  assert.ok([...createdMembers].every((id) => combined.some((row) => row.id === id)));
  globalThis.console.log("PASS PostgreSQL: >20 member UUID keyset, inactive participants, duplicate CURRENT names");

  await client.query("ROLLBACK");
  transactionOpen = false;
  globalThis.console.log("PASS PostgreSQL: isolated fixture transaction rolled back, no rows persisted");
} finally {
  if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
  await client.end();
}
