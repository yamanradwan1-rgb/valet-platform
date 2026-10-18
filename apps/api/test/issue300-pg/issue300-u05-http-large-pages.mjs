import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { generate } from "otplib";
import { seedIssue300Http } from "./issue300-http-seed.mjs";

// R06: 100+ real signed HTTP search results and 100+ same-Session events.
// The source UUID is deliberately identical in all four distinct tables.
const raw = globalThis.process.env.ISSUE300_PG_TEST_URL;
if (!raw) throw new Error("Explicit owned G2 URL required");
const u = new globalThis.URL(raw);
if (u.hostname !== "127.0.0.1" || u.port !== "55480" ||
    u.pathname !== "/issue300_g2" || u.search || u.hash)
  throw new Error("Refusing non-G2 database");
const client = new pg.Client({ connectionString: raw,
  application_name: "issue300_r06_large_http_pages" });
const sessions = Array.from({ length: 105 }, () => randomUUID());
const vehicles = sessions.map(() => randomUUID());
const audits = sessions.map(() => randomUUID());
const custody = Array.from({ length: 104 }, () => randomUUID());
const shared = randomUUID();
custody.push(shared);
let committed = false;
let fixtureOpen = false;
let cleanupError;

async function call(path, token, body) {
  const response = await globalThis.fetch("http://127.0.0.1:3162" + path, {
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    headers: { Origin: "http://127.0.0.1:3113",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}) },
  });
  const data = await response.text();
  return { status: response.status, json: data ? JSON.parse(data) : null };
}
async function pages(path, token, expected) {
  let page = await call(path, token);
  assert.equal(page.status, 200, JSON.stringify(page.json));
  const snapshotAt = page.json.snapshotAt;
  const items = [];
  for (let i = 0; i < 30; i += 1) {
    assert.equal(page.status, 200, JSON.stringify(page.json));
    assert.equal(page.json.snapshotAt, snapshotAt);
    assert.ok(page.json.items.length <= 11);
    items.push(...page.json.items);
    if (!page.json.nextCursor) {
      assert.equal(items.length, expected);
      return items;
    }
    page = await call(path + "&cursor=" +
      encodeURIComponent(page.json.nextCursor), token);
  }
  throw new Error("Unbounded signed page continuation");
}

await client.connect();
try {
  assert.equal((await client.query("SELECT current_database() AS db")).rows[0].db,
    "issue300_g2");
  const { ids, users } = await seedIssue300Http(client, { indirectAudit: false });
  const actor = users.admin.membershipId;
  await client.query("BEGIN");
  fixtureOpen = true;
  await client.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     SELECT id,$2,'G2 R06 ONLY',now() FROM unnest($1::uuid[]) AS id`,
    [vehicles, ids.org],
  );
  await client.query(
    `INSERT INTO valet_sessions(id,organization_id,location_id,vehicle_id,
       state,checked_in_by_membership_id,customer_access_token_hash,
       customer_access_expires_at,updated_at)
     SELECT s.id,$3,$4,s.vehicle,'PARKED',$5,
       'r06:' || s.id::text,now()+interval '1 day',now()
     FROM unnest($1::uuid[],$2::uuid[]) AS s(id,vehicle)`,
    [sessions, vehicles, ids.org, ids.location, actor],
  );
  await client.query(
    `INSERT INTO audit_events(id,organization_id,location_id,
       valet_session_id,actor_membership_id,actor_type,event_type,
       entity_type,entity_id,metadata_json,occurred_at)
     SELECT x.audit,$3,$4,x.session,$5,'MEMBERSHIP',
       'VALET_SESSION_PARKED','ValetSession',x.session,
       '{}'::jsonb,'2026-10-16T11:40:00Z'::timestamptz
     FROM unnest($1::uuid[],$2::uuid[]) AS x(audit,session)`,
    [audits, sessions, ids.org, ids.location, actor],
  );
  await client.query(
    `INSERT INTO key_custody_events(id,organization_id,location_id,
       valet_session_id,key_slot_id,actor_membership_id,event_type,occurred_at)
     SELECT x.id,$2,$3,$4,$5,$6,'CHECKED_OUT',
       '2026-10-16T11:12:00Z'::timestamptz
     FROM unnest($1::uuid[]) AS x(id)`,
    [custody, ids.org, ids.location, ids.session, ids.slot, actor],
  );
  await client.query(
    `INSERT INTO audit_events(id,organization_id,location_id,
       valet_session_id,actor_membership_id,actor_type,event_type,
       entity_type,entity_id,metadata_json,occurred_at)
     VALUES($1,$2,$3,$4,$5,'MEMBERSHIP','VALET_SESSION_PARKED',
       'ValetSession',$4,'{}'::jsonb,'2026-10-16T11:12:00Z')`,
    [shared, ids.org, ids.location, ids.session, actor],
  );
  await client.query(
    `INSERT INTO dispatch_events(id,organization_id,location_id,
       valet_session_id,task_id,event_type,new_assignee_membership_id,occurred_at)
     VALUES($1,$2,$3,$4,$5,'ASSIGNED',$6,'2026-10-16T11:12:00Z')`,
    [shared, ids.org, ids.location, ids.session, ids.task, actor],
  );
  await client.query(
    `INSERT INTO incidents(id,organization_id,location_id,valet_session_id,
       status,severity,type,description,reported_by_membership_id,created_at)
     VALUES($1,$2,$3,$4,'OPEN','LOW','KEY_MISSING','G2 R06 private',$5,
       '2026-10-16T11:12:00Z')`,
    [shared, ids.org, ids.location, ids.session, actor],
  );
  // Track exact random IDs *before* commit acknowledgement. If a network
  // error follows server-side COMMIT, cleanup still attempts owned IDs.
  committed = true;
  await client.query("COMMIT");
  fixtureOpen = false;

  const login = await call("/v1/staff/auth/login", null,
    { email: users.admin.email, password: users.admin.password });
  assert.equal(login.status, 200, JSON.stringify(login.json));
  const token = login.json.accessToken;
  const begin = await call("/v1/staff/auth/mfa/enrollment/begin", token, {});
  assert.equal(begin.status, 200);
  const otp = await generate({ strategy: "totp", algorithm: "sha1",
    digits: 6, period: 30, secret: begin.json.provisioning.secretBase32 });
  assert.equal((await call("/v1/staff/auth/mfa/enrollment/confirm", token,
    { factorId: begin.json.factorId, code: otp })).status, 200);
  const base = "/v1/staff/management/organizations/" + ids.org +
    "/locations/" + ids.location + "/audit-investigations";
  const search = await pages(base + "/sessions?from=2026-10-16T11%3A00%3A00Z" +
    "&to=2026-10-16T12%3A00%3A00Z&limit=11", token, 106);
  assert.equal(new Set(search.map((item) => item.sessionId)).size, 106);
  const ordered = (await client.query(
    "SELECT id FROM valet_sessions WHERE id=ANY($1::uuid[]) ORDER BY id DESC",
    [sessions],
  )).rows.map((row) => row.id);
  assert.deepEqual(search.slice(0, 105).map((item) => item.sessionId), ordered);
  assert.equal(search[105].sessionId, ids.session);
  globalThis.console.log("PASS U05-R06 Search: 106 unique Sessions, " +
    "105 equal-timestamp ties by PostgreSQL UUID DESC and signed pages");

  const timeline = await pages(base + "/sessions/" + ids.session +
    "/timeline?limit=11", token, 112);
  const keys = timeline.map((item) => item.key.source + ":" + item.key.eventId);
  assert.equal(new Set(keys).size, 112);
  const tie = timeline.filter((item) =>
    item.occurredAt === "2026-10-16T11:12:00.000Z");
  assert.equal(tie.length, 108);
  const custodyOrder = (await client.query(
    "SELECT id FROM key_custody_events WHERE id=ANY($1::uuid[]) ORDER BY id",
    [custody],
  )).rows.map((row) => row.id);
  assert.deepEqual(tie.map((item) => item.key.source + ":" + item.key.eventId), [
    "AUDIT:" + shared,
    ...custodyOrder.map((id) => "KEY_CUSTODY:" + id),
    "DISPATCH:" + shared,
    "INCIDENT:" + shared,
  ]);
  assert.equal(tie.filter((item) => item.key.eventId === shared).length, 4);
  globalThis.console.log("PASS U05-R06 Timeline: 112 events, " +
    "108 equal-time ties in source-rank and database UUID order; " +
    "same UUID across sources stays four distinct facts");
} finally {
  try {
    if (fixtureOpen) await client.query("ROLLBACK").catch(() => undefined);
    if (committed) {
      await client.query("BEGIN");
      try {
      await client.query("DELETE FROM incidents WHERE id=$1", [shared]);
      await client.query("DELETE FROM dispatch_events WHERE id=$1", [shared]);
      await client.query("DELETE FROM key_custody_events WHERE id=ANY($1::uuid[])",
        [custody]);
      await client.query("DELETE FROM audit_events WHERE id=ANY($1::uuid[])",
        [[...audits, shared]]);
      await client.query("DELETE FROM valet_sessions WHERE id=ANY($1::uuid[])",
        [sessions]);
      await client.query("DELETE FROM vehicles WHERE id=ANY($1::uuid[])",
        [vehicles]);
        await client.query("COMMIT");
        globalThis.console.log("PASS U05-R06 G2 synthetic cleanup by exact UUIDs");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        cleanupError = error;
      }
    }
  } finally {
    await client.end();
  }
}
if (cleanupError) throw cleanupError;
