import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { generate } from "otplib";
import { seedIssue300Http } from "./issue300-http-seed.mjs";

const raw = globalThis.process.env.ISSUE300_PG_TEST_URL;
if (!raw) throw new Error("Dedicated G2 PostgreSQL connection required");
const target = new globalThis.URL(raw);
if (target.hostname !== "127.0.0.1" || target.port !== "55480" ||
    target.pathname !== "/issue300_g2" || target.search || target.hash)
  throw new Error("Refuse to execute writers on non-owned database");

const client = new pg.Client({ connectionString: raw,
  application_name: "issue300_real_incident_writer_HTTP_G2" });
const api = "http://127.0.0.1:3162";
const request = async (path, token, body) => {
  const response = await globalThis.fetch(api + path, {
    method: "POST",
    headers: { Origin: "http://127.0.0.1:3113",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const content = await response.text();
  return { status: response.status,
    json: (() => { try { return JSON.parse(content); } catch { return null; } })() };
};

await client.connect();
try {
  assert.equal((await client.query("SELECT current_database() AS name")).rows[0].name,
    "issue300_g2");
  const { ids, users } = await seedIssue300Http(client);
  // Shift setup is an explicitly labelled DIRECT SQL TEST FIXTURE, not a
  // shift writer proof. The Incident action itself is a real HTTP domain writer.
  await client.query(
    `INSERT INTO shifts(id,organization_id,location_id,membership_id,
       status,started_at)
     VALUES($1,$2,$3,$4,'ACTIVE',now())`,
    [randomUUID(),ids.org,ids.location,users.supervisor.membershipId],
  );
  const login = await request("/v1/staff/auth/login", null, {
    email: users.supervisor.email, password: users.supervisor.password,
  });
  assert.equal(login.status,200,JSON.stringify(login.json));
  const token = login.json?.accessToken;
  assert.match(token, /^vsa1\.[A-Za-z0-9_-]{43}$/);

  const before = (await client.query(
    `SELECT (SELECT to_jsonb(s) FROM valet_sessions s WHERE s.id=$1) AS session,
      (SELECT to_jsonb(t) FROM tasks t WHERE t.id=$2) AS task,
      (SELECT count(*)::int FROM key_custody_events WHERE valet_session_id=$1) AS custody,
      (SELECT count(*)::int FROM dispatch_events WHERE valet_session_id=$1) AS dispatch`,
    [ids.session,ids.task],
  )).rows[0];
  const incidentId = randomUUID();
  const body = { incidentId, type: "KEY_MISSING", severity: "HIGH",
    description: "PRIVATE G2 Incident Writer Proof — not an investigation display field" };
  const endpoint = `/v1/staff/valet-sessions/${ids.session}/incidents`;
  const creation = await request(endpoint, token, body);
  assert.equal(creation.status,200,JSON.stringify(creation.json));
  assert.equal(creation.json?.incidentId,incidentId);
  assert.equal(creation.json?.reportedByMembershipId,users.supervisor.membershipId);
  const retry = await request(endpoint, token, body);
  assert.equal(retry.status,200);
  assert.deepEqual(retry.json,creation.json);

  const evidence = (await client.query(
    `SELECT i.id, i.pagination_birth_xid::text AS birth,
      i.created_at AS incident_created, a.id AS audit_id,
      a.pagination_birth_xid::text AS audit_birth,
      a.event_type::text AS audit_type,
      a.entity_type, a.valet_session_id,
      (SELECT count(*)::int FROM incidents WHERE id=$1) AS incident_count,
      (SELECT count(*)::int FROM audit_events
        WHERE entity_type='INCIDENT' AND entity_id=$1) AS audit_count
     FROM incidents i JOIN audit_events a ON a.organization_id=i.organization_id
       AND a.location_id=i.location_id AND a.entity_id=i.id
     WHERE i.id=$1`, [incidentId],
  )).rows;
  assert.equal(evidence.length,1);
  assert.ok(evidence[0].birth && evidence[0].audit_birth);
  assert.equal(evidence[0].incident_count,1);
  assert.equal(evidence[0].audit_count,1);
  assert.equal(evidence[0].audit_type,"INCIDENT_OPENED");
  assert.equal(evidence[0].entity_type,"INCIDENT");
  assert.equal(evidence[0].valet_session_id,ids.session);

  const after = (await client.query(
    `SELECT (SELECT to_jsonb(s) FROM valet_sessions s WHERE s.id=$1) AS session,
      (SELECT to_jsonb(t) FROM tasks t WHERE t.id=$2) AS task,
      (SELECT count(*)::int FROM key_custody_events WHERE valet_session_id=$1) AS custody,
      (SELECT count(*)::int FROM dispatch_events WHERE valet_session_id=$1) AS dispatch`,
    [ids.session,ids.task],
  )).rows[0];
  assert.deepEqual(after,before);
  globalThis.console.log("PASS Issue300 G2 ACTUAL Incident HTTP domain writer: Supervisor Argon2 login + active Shift SQL setup, real creation idempotency, exactly one INCIDENT and one AUDIT, both DB birth-XID, NO Session/Task/Custody/Dispatch mutation");

  const adminLogin = await request("/v1/staff/auth/login",null,
    { email:users.admin.email,password:users.admin.password });
  assert.equal(adminLogin.status,200);
  const adminToken = adminLogin.json.accessToken;
  const begin = await request("/v1/staff/auth/mfa/enrollment/begin",adminToken,{});
  assert.equal(begin.status,200);
  const code = await generate({ strategy:"totp",algorithm:"sha1",digits:6,
    period:30,secret:begin.json.provisioning.secretBase32 });
  const confirm = await request("/v1/staff/auth/mfa/enrollment/confirm",adminToken,
    { factorId:begin.json.factorId,code });
  assert.equal(confirm.status,200);
  const base = `/v1/staff/management/organizations/${ids.org}/locations/`+
    `${ids.location}/audit-investigations/sessions/${ids.session}`;
  const safeGet = async (url) => {
    const result = await globalThis.fetch(api+url,{ headers:{
      Origin:"http://127.0.0.1:3113",Authorization:`Bearer ${adminToken}` } });
    return { status:result.status,json:await result.json() };
  };
  const timeline = await safeGet(base+"/timeline?limit=100");
  assert.equal(timeline.status,200,JSON.stringify(timeline.json));
  assert.ok(timeline.json.items.some((event) =>
    event.key?.source==="INCIDENT" && event.key?.eventId===incidentId));
  assert.ok(timeline.json.items.some((event) =>
    event.key?.source==="AUDIT" && event.key?.eventId===evidence[0].audit_id));
  const detail = await safeGet(base+"/events/INCIDENT/"+incidentId);
  assert.equal(detail.status,200);
  assert.ok(!JSON.stringify(timeline.json).includes(body.description));
  assert.ok(!JSON.stringify(detail.json).includes(body.description));
  globalThis.console.log("PASS Issue300 actual-writer readback: MFA-authenticated Company Admin sees separate Incident+Audit events and safe Incident detail; source free-text never exposed");
  globalThis.console.log("SCOPE NOTE: Shift/Session fixtures were direct SQL, not actual check-in/handoff/task writer proof; T01 full writer matrix and U05 R09 remain GAP");
} finally {
  await client.end();
}
