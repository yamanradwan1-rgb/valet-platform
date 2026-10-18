import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { generate } from "otplib";
import { seedIssue300Http } from "./issue300-http-seed.mjs";

// R01/R02: two actual PG writer connections and signed HTTP continuation,
// against only the task-owned disposable G2 API/database. No domain API writes
// are claimed here: the held insertions deliberately model adversarial SQL.
const raw = globalThis.process.env.ISSUE300_PG_TEST_URL;
if (!raw) throw new Error("Explicit G2 database URL required");
const u = new globalThis.URL(raw);
if (u.hostname !== "127.0.0.1" || u.port !== "55480" ||
    u.pathname !== "/issue300_g2" || u.search || u.hash)
  throw new Error("Refusing non-G2 database");

const api = "http://127.0.0.1:3162";
const db = new pg.Client({ connectionString: raw,
  application_name: "issue300_r01_http_reader_fixture" });
const writer = new pg.Client({ connectionString: raw,
  application_name: "issue300_r01_held_writer" });
const created = [];
const searchControl = {
  vehicle: randomUUID(), session: randomUUID(), audit: randomUUID(),
};
let searchControlCreated = false;
let held = false;
let cleanupError;
const sources = ["AUDIT", "KEY_CUSTODY", "DISPATCH", "INCIDENT"];

async function call(path, token, body) {
  const response = await globalThis.fetch(api + path, {
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    headers: { Origin: "http://127.0.0.1:3113",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}

async function insert(client, source, id, seed, users, occurredAt) {
  const common = [id, seed.org, seed.location, seed.session];
  const actor = users.admin.membershipId;
  switch (source) {
    case "AUDIT":
      await client.query(
        `INSERT INTO audit_events(id,organization_id,location_id,
          valet_session_id,actor_membership_id,actor_type,event_type,
          entity_type,entity_id,metadata_json,occurred_at,created_at)
         VALUES($1,$2,$3,$4,$5,'MEMBERSHIP','VALET_SESSION_PARKED',
          'ValetSession',$4,'{}'::jsonb,$6,$6)`,
        [...common, actor, occurredAt],
      );
      break;
    case "KEY_CUSTODY":
      await client.query(
        `INSERT INTO key_custody_events(id,organization_id,location_id,
          valet_session_id,key_slot_id,actor_membership_id,event_type,
          occurred_at,created_at)
         VALUES($1,$2,$3,$4,$5,$6,'CHECKED_OUT',$7,$7)`,
        [...common, seed.slot, actor, occurredAt],
      );
      break;
    case "DISPATCH":
      await client.query(
        `INSERT INTO dispatch_events(id,organization_id,location_id,
          valet_session_id,task_id,event_type,actor_membership_id,
          new_assignee_membership_id,occurred_at,created_at)
         VALUES($1,$2,$3,$4,$5,'ASSIGNED',$6,$6,$7,$7)`,
        [...common, seed.task, actor, occurredAt],
      );
      break;
    case "INCIDENT":
      await client.query(
        `INSERT INTO incidents(id,organization_id,location_id,valet_session_id,
          status,severity,type,description,reported_by_membership_id,created_at)
         VALUES($1,$2,$3,$4,'OPEN','LOW','KEY_MISSING',
          'Private task-only delayed SQL proof',$5,$6)`,
        [...common, actor, occurredAt],
      );
      break;
    default:
      throw new Error("Unknown source type");
  }
}

async function readAllPages(path, token, first) {
  const expectedSnapshot = first.json.snapshotAt;
  const items = [];
  let page = first;
  for (let i = 0; i < 30; i += 1) {
    assert.equal(page.status, 200, JSON.stringify(page.json));
    assert.equal(page.json.snapshotAt, expectedSnapshot);
    items.push(...page.json.items);
    if (!page.json.nextCursor) return items;
    page = await call(path + "&cursor=" +
      encodeURIComponent(page.json.nextCursor), token);
  }
  throw new Error("Unbounded timeline continuation");
}

try {
  await db.connect();
  await writer.connect();
  const identity = (await db.query(
    "SELECT current_database() AS db, inet_server_port() AS port",
  )).rows[0];
  assert.equal(identity.db, "issue300_g2");
  assert.equal(identity.port, 5432); // inside isolated Docker PG, not host :5432
  const { ids, users } = await seedIssue300Http(db, { indirectAudit: false });
  const login = await call("/v1/staff/auth/login", null,
    { email: users.admin.email, password: users.admin.password });
  assert.equal(login.status, 200, JSON.stringify(login.json));
  const token = login.json.accessToken;
  const begin = await call("/v1/staff/auth/mfa/enrollment/begin", token, {});
  assert.equal(begin.status, 200);
  const otp = await generate({ strategy: "totp", algorithm: "sha1",
    digits: 6, period: 30, secret: begin.json.provisioning.secretBase32 });
  assert.equal((await call("/v1/staff/auth/mfa/enrollment/confirm",
    token, { factorId: begin.json.factorId, code: otp })).status, 200);
  // One additional committed Session makes actual Search page1/next-page
  // possible. Its high timestamp ensures the held source always belongs to
  // a later page's Session aggregate, not the already-returned first row.
  await db.query("BEGIN");
  try {
    await db.query(
      `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
       VALUES($1,$2,'G2 HELD SEARCH CONTROL',now())`,
      [searchControl.vehicle, ids.org],
    );
    await db.query(
      `INSERT INTO valet_sessions(id,organization_id,location_id,vehicle_id,
         state,checked_in_by_membership_id,customer_access_token_hash,
         customer_access_expires_at,updated_at)
       VALUES($1,$2,$3,$4,'PARKED',$5,$6,now()+interval '1 day',now())`,
      [searchControl.session, ids.org, ids.location, searchControl.vehicle,
        users.admin.membershipId, "held-search-control:" + randomUUID()],
    );
    await db.query(
      `INSERT INTO audit_events(id,organization_id,location_id,
         valet_session_id,actor_membership_id,actor_type,event_type,
         entity_type,entity_id,metadata_json,occurred_at)
       VALUES($1,$2,$3,$4,$5,'MEMBERSHIP','VALET_SESSION_PARKED',
         'ValetSession',$4,'{}'::jsonb,'2026-10-16T11:30:00Z')`,
      [searchControl.audit, ids.org, ids.location, searchControl.session,
        users.admin.membershipId],
    );
    await db.query("COMMIT");
    searchControlCreated = true;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
  const route = `/v1/staff/management/organizations/${ids.org}` +
    `/locations/${ids.location}/audit-investigations/sessions/` +
    `${ids.session}/timeline?limit=1`;
  const fullRoute = route.replace("limit=1", "limit=100");
  const searchRoute = `/v1/staff/management/organizations/${ids.org}` +
    `/locations/${ids.location}/audit-investigations/sessions` +
    `?from=2026-10-16T11%3A00%3A00Z&to=2026-10-16T12%3A00%3A00Z` +
    `&membershipId=${users.admin.membershipId}&limit=1`;
  const fullSearch = searchRoute.replace("limit=1", "limit=100");

  for (const source of sources) {
    const baseline = await call(fullSearch, token);
    assert.equal(baseline.status, 200, JSON.stringify(baseline.json));
    const original = baseline.json.items.find((item) =>
      item.sessionId === ids.session);
    assert.ok(original);
    const beforeId = randomUUID();
    const lateId = randomUUID();
    // Begin the delayed transaction BEFORE the control commits, so its
    // transaction start time is no substitute for snapshot visibility.
    await writer.query("BEGIN");
    held = true;
    await insert(writer, source, lateId, ids, users,
      "2026-10-16T11:13:00Z");
    // Register even if COMMIT has an ambiguous transport failure: cleanup
    // by this exact UUID is safe whether the transaction committed or not.
    created.push({ source, id: lateId });
    await insert(db, source, beforeId, ids, users,
      "2026-10-16T11:12:00Z");
    created.push({ source, id: beforeId });

    const first = await call(route, token);
    assert.equal(first.status, 200, JSON.stringify(first.json));
    assert.ok(first.json.nextCursor);
    assert.equal(first.json.items.length, 1);
    assert.equal(first.json.items[0].key.source, "KEY_CUSTODY");
    const searchFirst = await call(searchRoute, token);
    assert.equal(searchFirst.status, 200, JSON.stringify(searchFirst.json));
    assert.equal(searchFirst.json.items.length, 1);
    assert.equal(searchFirst.json.items[0].sessionId, searchControl.session);
    assert.ok(searchFirst.json.nextCursor);
    await writer.query("COMMIT");
    held = false;

    const oldItems = await readAllPages(route, token, first);
    const oldKeys = oldItems.map((item) => item.key.source + ":" + item.key.eventId);
    assert.equal(new Set(oldKeys).size, oldKeys.length);
    assert.ok(oldKeys.includes(source + ":" + beforeId),
      `${source}: control committed BEFORE snapshot should be included`);
    assert.ok(!oldKeys.includes(source + ":" + lateId),
      `${source}: writer committed AFTER snapshot must not phantom on next page`);
    const fresh = await call(fullRoute, token);
    assert.equal(fresh.status, 200, JSON.stringify(fresh.json));
    assert.ok(fresh.json.items.some((event) =>
      event.key.source === source && event.key.eventId === lateId));
    const oldSearch = await readAllPages(searchRoute, token, searchFirst);
    const unchanged = oldSearch.find((item) => item.sessionId === ids.session);
    assert.ok(unchanged);
    // The control row was committed AFTER the baseline query but BEFORE S0.
    assert.equal(unchanged.matchingRecordCount,
      original.matchingRecordCount + 1);
    assert.ok(unchanged.matchReasons.some((reason) =>
      reason.source === source && reason.eventId === beforeId));
    assert.ok(!unchanged.matchReasons.some((reason) =>
      reason.source === source && reason.eventId === lateId));
    const newSearch = await call(fullSearch, token);
    assert.equal(newSearch.status, 200, JSON.stringify(newSearch.json));
    const updated = newSearch.json.items.find((item) =>
      item.sessionId === ids.session);
    assert.equal(updated.matchingRecordCount,
      original.matchingRecordCount + 2);
    assert.ok(updated.matchReasons.some((reason) =>
      reason.source === source && reason.eventId === lateId));
    globalThis.console.log(`PASS U05 R01/R02 signed HTTP ${source}: ` +
      "committed control admitted, held earlier-BEGIN/later-COMMIT excluded " +
      "across Timeline and Search pages; fresh snapshot admits late fact");
  }
} finally {
  if (held) await writer.query("ROLLBACK").catch(() => undefined);
  // Never clean unrelated records or reinterpret these SQL inserts as real
  // operational domain writers. Remove only our own 8 exact random UUIDs.
  for (const row of created.reverse()) {
    const table = { AUDIT: "audit_events", KEY_CUSTODY: "key_custody_events",
      DISPATCH: "dispatch_events", INCIDENT: "incidents" }[row.source];
    try {
      await db.query(`DELETE FROM ${table} WHERE id=$1`, [row.id]);
    } catch (error) {
      cleanupError ??= error;
    }
  }
  if (searchControlCreated) {
    try {
      await db.query("DELETE FROM audit_events WHERE id=$1", [searchControl.audit]);
      await db.query("DELETE FROM valet_sessions WHERE id=$1", [searchControl.session]);
      await db.query("DELETE FROM vehicles WHERE id=$1", [searchControl.vehicle]);
    } catch (error) {
      cleanupError ??= error;
    }
  }
  await Promise.allSettled([writer.end(), db.end()]);
}
if (cleanupError) throw cleanupError;
