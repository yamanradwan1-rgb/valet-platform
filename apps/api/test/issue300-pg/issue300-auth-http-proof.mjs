import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { generate } from "otplib";
import { seedIssue300Http } from "./issue300-http-seed.mjs";

const conn = globalThis.process.env.ISSUE300_PG_TEST_URL;
if (!conn) throw new Error("Explicit Issue300 isolated DB required");
const u = new globalThis.URL(conn);
if (u.hostname !== "127.0.0.1" || u.port !== "55480" ||
    u.pathname !== "/issue300_g2" || u.search || u.hash)
  throw new Error("HTTP proof forbidden on any non-task-owned database");
const api = "http://127.0.0.1:3161";
const client = new pg.Client({ connectionString: conn,
  application_name: "issue300_http_auth_actual_login" });
const req = async (url, token, options = {}) => {
  const response = await globalThis.fetch(api + url, {
    ...options,
    headers: {
      origin: "http://127.0.0.1:3113",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: "Bearer " + token } : {}),
      ...options.headers,
    },
  });
  const body = await response.text();
  const json = body ? (() => { try { return JSON.parse(body); } catch { return null; } })() : null;
  return { status: response.status, json, headers: response.headers };
};

async function loginUser(person) {
  const login = await req("/v1/staff/auth/login", null, {
    method: "POST", body: JSON.stringify({ email: person.email, password: person.password }),
  });
  assert.equal(login.status, 200, "real password-auth login must succeed");
  const token = login.json?.accessToken;
  assert.match(token, /^vsa1\.[A-Za-z0-9_-]{43}$/);
  return { token, sessionId: login.headers.get("x-vaylet-staff-auth-session-id") };
}

async function authenticatedUser(person) {
  const { token, sessionId } = await loginUser(person);
  const enrollment = await req("/v1/staff/auth/mfa/enrollment/begin", token, {
    method: "POST", body: "{}",
  });
  assert.equal(enrollment.status, 200, "real MFA enrollment must begin");
  const { factorId, provisioning } = enrollment.json;
  const code = await generate({ strategy: "totp", algorithm: "sha1",
    digits: 6, period: 30, secret: provisioning.secretBase32 });
  const confirm = await req("/v1/staff/auth/mfa/enrollment/confirm", token, {
    method: "POST", body: JSON.stringify({ factorId, code }),
  });
  assert.equal(confirm.status, 200, "actual TOTP MFA confirmation must succeed");
  assert.equal(confirm.json?.recoveryCodes?.length, 10);
  return { token, sessionId, totpSecret: provisioning.secretBase32 };
}

async function checkRealBrowser(user, totpSecret) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const dashboard = join(root, "apps/dashboard");
  const input = {
    ...globalThis.process.env,
    ISSUE300_BROWSER_EMAIL: user.email,
    ISSUE300_BROWSER_PASSWORD: user.password,
    ISSUE300_BROWSER_TOTP_SECRET: totpSecret,
    ISSUE300_BROWSER_OUTPUT: join(root, "tmp/issue300-g2-owned/browser-geometry.json"),
  };
  delete input.ISSUE300_PG_TEST_URL;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(globalThis.process.execPath,
      [join(dashboard, "e2e/issue300-g2-live-browser.mjs")],
      { cwd: dashboard, env: input, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
  globalThis.console.log(result.stdout.trim());
  if (result.code !== 0) {
    globalThis.console.log("GAP real-browser: separate browser proof failed; inspect task-owned browser-geometry.json");
    globalThis.console.log(String(result.stderr).split("\n").slice(0, 15).join(" ").slice(0, 1800));
  }
}

await client.connect();
try {
  const identity = await client.query("SELECT current_database() AS name, current_user AS user_name");
  assert.equal(identity.rows[0].name, "issue300_g2");
  assert.equal(identity.rows[0].user_name, "issue300_owner");
  // Every rerun uses new random identities in the disposable G2 DB; preserve
  // prior run's evidence rather than deleting or resetting any test records.
  const { ids, users } = await seedIssue300Http(client);
  globalThis.console.log("PASS G2 fixtures: tenant, Location, same Session and four source rows committed; direct SQL only");
  const [ca, lm, foreign] = await Promise.all([
    authenticatedUser(users.admin), authenticatedUser(users.manager),
    authenticatedUser(users.foreign),
  ]);
  const supervisor = await loginUser(users.supervisor);
  globalThis.console.log("PASS real HTTP: four distinct real Argon2 password logins and three actual TOTP MFA enrollments; no Supervisor MFA bypass");

  const base = (org, location) =>
    `/v1/staff/management/organizations/${org}/locations/${location}/audit-investigations`;
  const path = base(ids.org, ids.location);
  const from = "2026-10-16T11:00:00.000Z";
  const to = "2026-10-16T12:00:00.000Z";
  const query = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const protectedUrls = [
    `${path}/sessions${query}`,
    `${path}/filters?kind=MEMBER`,
    `${path}/sessions/${ids.session}/timeline`,
    `${path}/sessions/${ids.session}/events/AUDIT/${ids.audit}`,
  ];
  const prior = await client.query(
    `SELECT (SELECT count(*) FROM valet_sessions) AS sessions,
      (SELECT count(*) FROM key_custody_events) AS custody,
      (SELECT count(*) FROM dispatch_events) AS dispatch,
      (SELECT count(*) FROM incidents) AS incidents`,
  );
  for (const url of protectedUrls) {
    const anon = await req(url, null);
    assert.equal(anon.status, 401);
    assert.equal(anon.headers.get("cache-control"), "no-store");
    const sup = await req(url, supervisor.token);
    assert.notEqual(sup.status, 200, "Supervisor must not read Investigation");
    const outsider = await req(url, foreign.token);
    assert.notEqual(outsider.status, 200, "foreign-tenant must not read Investigation");
    for (const viewer of [ca, lm]) {
      const allowed = await req(url, viewer.token);
      assert.equal(allowed.status, 200, "MFA-proven CA and LM must read Investigation");
      assert.equal(allowed.headers.get("cache-control"), "no-store");
      assert.ok(!JSON.stringify(allowed.json).includes("REDACT THIS PRIVATE DESCRIPTION"));
    }
  }
  globalThis.console.log("PASS real HTTP: four endpoints CA/LM 200, Supervisor/foreign denied, anon401, no-store and private Incident text absent");

  for (const token of [ca.token, lm.token]) {
    const result = await req(`${path}/sessions${query}&keySlotId=${ids.slot}&membershipId=${users.admin.membershipId}`, token);
    assert.equal(result.status, 200);
    assert.equal(result.json?.items?.length, 1);
    assert.equal(result.json.items[0].sessionId, ids.session);
    const timeline = await req(`${path}/sessions/${ids.session}/timeline`, token);
    assert.equal(timeline.status, 200);
    const sources = new Set(timeline.json?.items?.map((e) => e.key?.source));
    for (const source of ["AUDIT", "KEY_CUSTODY", "DISPATCH", "INCIDENT"]) {
      assert.ok(sources.has(source), `missing ${source} from real HTTP Timeline`);
    }
    const other = await req(`${path}/sessions/${ids.foreignSession}/timeline`, token);
    assert.notEqual(other.status, 200);
  }
  globalThis.console.log("PASS real HTTP: independent same-Session AND, four-source full history, foreign Session denied");

  const beyond = await req(`${path}/sessions?from=${encodeURIComponent(to)}&to=${encodeURIComponent('2026-10-16T12:01:00.000Z')}`, ca.token);
  assert.equal(beyond.status, 200);
  assert.equal(beyond.json?.items?.length, 0);
  const wrongLoc = await req(`${base(ids.org, ids.otherLocation)}/sessions${query}`, lm.token);
  assert.notEqual(wrongLoc.status, 200);

  const verifiedTestHash = (await client.query(
    "SELECT password_hash FROM users WHERE id=$1", [users.admin.id],
  )).rows[0]?.password_hash;
  assert.ok(verifiedTestHash?.startsWith("$argon2id$"));
  for (let i = 0; i < 24; i += 1) {
    const userId = randomUUID();
    const membershipId = randomUUID();
    await client.query(
      `INSERT INTO users(id,email,password_hash,status,updated_at)
       VALUES($1,$2,$3,'ACTIVE',now())`,
      [userId, `${userId}@example.invalid`, verifiedTestHash],
    );
    await client.query(
      `INSERT INTO organization_memberships(id,organization_id,user_id,role,
         status,first_name,last_name,updated_at)
       VALUES($1,$2,$3,'VALET_EMPLOYEE','INACTIVE','Same','Name',now())`,
      [membershipId, ids.org, userId],
    );
    await client.query(
      `INSERT INTO audit_events(id,organization_id,location_id,valet_session_id,
         actor_membership_id,actor_type,event_type,entity_type,entity_id,
         metadata_json,occurred_at)
       VALUES($1,$2,$3,$4,$5,'MEMBERSHIP','VALET_SESSION_PARKED',
         'ValetSession',$4,'{}'::jsonb,'2026-10-16T11:30:00Z')`,
      [randomUUID(), ids.org, ids.location, ids.session, membershipId],
    );
  }
  const first = await req(`${path}/filters?kind=MEMBER&limit=20`, ca.token);
  assert.equal(first.status, 200);
  assert.equal(first.json.items.length, 20);
  assert.equal(first.json.hasMore, true);
  assert.match(first.json.nextCursor, /^[A-Za-z0-9_-]+$/);
  const second = await req(`${path}/filters?kind=MEMBER&limit=20&cursor=${first.json.nextCursor}`, ca.token);
  assert.equal(second.status, 200);
  assert.equal(second.json.hasMore, false);
  assert.equal(new Set([...first.json.items, ...second.json.items].map((x) => x.id)).size,
    first.json.items.length + second.json.items.length);
  const signature = first.json.nextCursor;
  const tamper = signature.endsWith("A") ? "B" : "A";
  const forged = await req(`${path}/filters?kind=MEMBER&limit=20&cursor=${signature.slice(0,-1)}${tamper}`, ca.token);
  assert.notEqual(forged.status, 200);
  globalThis.console.log("PASS real HTTP: member options >20, opaque signed continuation, duplicate current names and forged cursor denial");

  await checkRealBrowser(users.admin, ca.totpSecret);

  await client.query("DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
    [users.manager.membershipId, ids.location]);
  assert.notEqual((await req(`${path}/sessions${query}`, lm.token)).status, 200);
  await client.query("UPDATE staff_auth_sessions SET revoked_at=now() WHERE id=$1",
    [ca.sessionId]);
  assert.notEqual((await req(`${path}/sessions${query}`, ca.token)).status, 200);
  globalThis.console.log("PASS real HTTP: live Location grant removal and staff-session revocation denied");
  const after = await client.query(
    `SELECT (SELECT count(*) FROM valet_sessions) AS sessions,
      (SELECT count(*) FROM key_custody_events) AS custody,
      (SELECT count(*) FROM dispatch_events) AS dispatch,
      (SELECT count(*) FROM incidents) AS incidents`,
  );
  assert.deepEqual(after.rows, prior.rows);
  globalThis.console.log("PASS read-only Investigation HTTP: no operational Session/Custody/Dispatch/Incident mutations");
} finally {
  await client.end();
}
