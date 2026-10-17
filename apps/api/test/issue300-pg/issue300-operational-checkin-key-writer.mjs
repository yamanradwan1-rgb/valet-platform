import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import pg from "pg";
import { generate } from "otplib";
import { seedIssue300Http } from "./issue300-http-seed.mjs";

// T01 operational proof: real check-in + condition completion + key A→B→C,
// not a direct-SQL claim about Session transitions or custody writers.
const raw = globalThis.process.env.ISSUE300_PG_TEST_URL;
if (!raw) throw new Error("Explicit task-owned G2 URL is required");
const u = new globalThis.URL(raw);
if (u.hostname !== "127.0.0.1" || u.port !== "55480" ||
    u.pathname !== "/issue300_g2" || u.search || u.hash)
  throw new Error("Refusing non-G2 target");
const api = "http://127.0.0.1:3162";
const db = new pg.Client({ connectionString: raw,
  application_name: "issue300_t01_actual_checkin_key_writer" });
async function post(path, token, body) {
  const response = await globalThis.fetch(api + path, {
    method: "POST",
    headers: { Origin: "http://127.0.0.1:3113",
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}
async function read(path, token) {
  const response = await globalThis.fetch(api + path, {
    headers: { Origin: "http://127.0.0.1:3113",
      Authorization: "Bearer " + token },
  });
  return { status: response.status, json: await response.json() };
}

await db.connect();
try {
  assert.equal((await db.query("SELECT current_database() AS db")).rows[0].db,
    "issue300_g2");
  const { ids, users } = await seedIssue300Http(db, { indirectAudit: false });
  // Only the following G2-only operational prerequisites use direct SQL:
  // accepting_intake, active Supervisor shift and available slot resources.
  await db.query(
    "UPDATE locations SET accepting_intake=true,updated_at=now() WHERE id=$1",
    [ids.location],
  );
  await db.query(
    `INSERT INTO shifts(id,organization_id,location_id,membership_id,
       status,started_at) VALUES($1,$2,$3,$4,'ACTIVE',now())`,
    [randomUUID(), ids.org, ids.location, users.supervisor.membershipId],
  );
  const slots = ["A", "B", "C"].map((letter) => ({
    id: randomUUID(), code: "G2-" + letter + "-" + randomUUID().slice(0, 8),
  }));
  for (const slot of slots) {
    await db.query(
      `INSERT INTO key_slots(id,organization_id,location_id,code,updated_at)
       VALUES($1,$2,$3,$4,now())`,
      [slot.id, ids.org, ids.location, slot.code],
    );
  }
  const staff = await post("/v1/staff/auth/login", null,
    { email: users.supervisor.email, password: users.supervisor.password });
  assert.equal(staff.status, 200, JSON.stringify(staff.json));
  const token = staff.json.accessToken;
  const intake = await post("/v1/staff/check-in/intakes", token, {
    intakeOperationId: "issue300-t01-" + randomUUID(),
    targetLocationId: ids.location,
    vehicleIdentity: { mode: "TEMPORARY_DESCRIPTOR",
      temporaryDescriptor: "G2 T01 real check-in " + randomUUID() },
  });
  assert.equal(intake.status, 201, JSON.stringify(intake.json));
  assert.equal(intake.json.state, "CHECKING_IN");
  assert.equal(intake.json.version, 1);
  const sessionId = intake.json.valetSessionId;
  assert.ok(sessionId);
  const root = "/v1/staff/check-in/sessions/" + sessionId;
  const condition = await post(root + "/condition-completion", token, {});
  assert.equal(condition.status, 200, JSON.stringify(condition.json));
  const complete = await post(root + "/complete", token,
    { expectedVersion: intake.json.version });
  assert.equal(complete.status, 200, JSON.stringify(complete.json));
  const parked = (await db.query(
    "SELECT state::text AS state,version FROM valet_sessions WHERE id=$1",
    [sessionId],
  )).rows[0];
  assert.equal(parked.state, "AWAITING_PARKING");
  assert.equal(parked.version, 2);
  let version = parked.version;
  for (let i = 0; i < slots.length; i += 1) {
    const result = await post("/v1/staff/valet-sessions/" + sessionId +
      "/key-slot/assign", token, {
      expectedVersion: version, keySlotCode: slots[i].code,
    });
    assert.equal(result.status, 200, JSON.stringify(result.json));
    assert.equal(result.json.keySlotCode, slots[i].code);
    assert.equal(result.json.version, version + 1);
    version = result.json.version;
    // Distinct millisecond boundaries for exact [from,to) history assertions.
    await sleep(35);
  }
  assert.equal(version, 5);
  const current = (await db.query(
    "SELECT key_slot_id,version FROM valet_sessions WHERE id=$1",
    [sessionId],
  )).rows[0];
  assert.equal(current.key_slot_id, slots[2].id);
  assert.equal(current.version, 5);
  const custody = (await db.query(
    `SELECT id,event_type::text AS type,key_slot_id AS slot,
       actor_membership_id AS actor,
       occurred_at AS time,pagination_birth_xid::text AS birth
     FROM key_custody_events WHERE valet_session_id=$1
     ORDER BY occurred_at,id`, [sessionId],
  )).rows;
  assert.equal(custody.length, 5);
  assert.ok(custody.every((event) => event.birth));
  assert.ok(custody.every((event) =>
    event.actor === users.supervisor.membershipId));
  const typesFor = (slot) => custody.filter((event) => event.slot === slot.id)
    .map((event) => event.type).sort();
  assert.deepEqual(typesFor(slots[0]), ["SLOT_ASSIGNED", "SLOT_CLEARED"]);
  assert.deepEqual(typesFor(slots[1]), ["SLOT_ASSIGNED", "SLOT_CLEARED"]);
  assert.deepEqual(typesFor(slots[2]), ["SLOT_ASSIGNED"]);
  const audits = (await db.query(
    `SELECT event_type::text AS type,pagination_birth_xid::text AS birth
     FROM audit_events WHERE valet_session_id=$1
       AND event_type IN ('VALET_SESSION_KEY_SLOT_ASSIGNED',
         'VALET_SESSION_KEY_SLOT_REASSIGNED')`, [sessionId],
  )).rows;
  assert.equal(audits.length, 3);
  assert.ok(audits.every((item) => item.birth));
  assert.equal(audits.filter((item) =>
    item.type === "VALET_SESSION_KEY_SLOT_REASSIGNED").length, 2);
  globalThis.console.log("PASS T01 G2 real Supervisor domain writers: intake, " +
    "condition completion, check-in, key A→B→C; five independent born-XID " +
    "custody rows, three audited slot transitions, current slot C");

  const admin = await post("/v1/staff/auth/login", null,
    { email: users.admin.email, password: users.admin.password });
  assert.equal(admin.status, 200);
  const enrollment = await post("/v1/staff/auth/mfa/enrollment/begin",
    admin.json.accessToken, {});
  assert.equal(enrollment.status, 200);
  const code = await generate({ strategy: "totp", algorithm: "sha1",
    digits: 6, period: 30,
    secret: enrollment.json.provisioning.secretBase32 });
  assert.equal((await post("/v1/staff/auth/mfa/enrollment/confirm",
    admin.json.accessToken,
    { factorId: enrollment.json.factorId, code })).status, 200);
  const history = "/v1/staff/management/organizations/" + ids.org +
    "/locations/" + ids.location + "/audit-investigations";
  const slotA = custody.find((event) =>
    event.slot === slots[0].id && event.type === "SLOT_ASSIGNED");
  const slotB = custody.find((event) =>
    event.slot === slots[1].id && event.type === "SLOT_ASSIGNED");
  assert.ok(slotA?.time && slotB?.time);
  assert.ok(slotA.time.valueOf() < slotB.time.valueOf());
  const from = new Date(slotA.time.valueOf() - 1000).toISOString();
  const to = slotB.time.toISOString();
  const result = await read(history + "/sessions?from=" +
    encodeURIComponent(from) + "&to=" + encodeURIComponent(to) +
    "&keySlotId=" + slots[0].id + "&limit=100", admin.json.accessToken);
  assert.equal(result.status, 200, JSON.stringify(result.json));
  const historic = result.json.items.find((item) => item.sessionId === sessionId);
  assert.ok(historic, "Historic slot A must qualify although CURRENT slot is C");
  assert.equal(historic.currentKeySlot.keySlotId, slots[2].id);
  assert.equal(historic.currentKeySlot.code.value, slots[2].code);
  assert.equal(historic.currentStateBasis, "CURRENT");
  assert.ok(historic.matchReasons.some((reason) =>
    reason.source === "KEY_CUSTODY" && reason.matchedBy === "KEY_SLOT" &&
    reason.eventId === slotA.id));
  const wrongCurrentSlot = await read(history + "/sessions?from=" +
    encodeURIComponent(from) + "&to=" + encodeURIComponent(to) +
    "&keySlotId=" + slots[2].id + "&sessionId=" + sessionId +
    "&limit=100", admin.json.accessToken);
  assert.equal(wrongCurrentSlot.status, 200,
    JSON.stringify(wrongCurrentSlot.json));
  assert.equal(wrongCurrentSlot.json.items.length, 0,
    "Current C must NOT be substituted as historical slot A");
  const timeline = await read(history + "/sessions/" + sessionId +
    "/timeline?limit=100", admin.json.accessToken);
  assert.equal(timeline.status, 200, JSON.stringify(timeline.json));
  const custodyKeys = timeline.json.items.filter((event) =>
    event.key.source === "KEY_CUSTODY").map((event) => event.key.eventId).sort();
  assert.deepEqual(custodyKeys, custody.map((event) => event.id).sort());
  globalThis.console.log("PASS T01 G2 real CA/MFA historical A-window Search " +
    "and Timeline readback: slot A event retained after physical assignment C");
  globalThis.console.log("SCOPE: SQL created prerequisite Shift/slots/policy; " +
    "real check-in and key writers proven, parking/retrieval/handoff still GAP");
} finally {
  await db.end();
}
