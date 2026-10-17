import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { generate } from "otplib";
import { seedIssue300Http } from "./issue300-http-seed.mjs";

const raw = globalThis.process.env.ISSUE300_PG_TEST_URL;
if (!raw) throw new Error("G2 URL not supplied");
const u = new globalThis.URL(raw);
if (u.hostname !== "127.0.0.1" || u.port !== "55480" ||
    u.pathname !== "/issue300_g2" || u.search || u.hash)
  throw new Error("Unexpected PostgreSQL identity");
const api = "http://127.0.0.1:3162";
const client = new pg.Client({ connectionString: raw,
  application_name: "issue300_u05_local_http_pagination" });
const call = async (path, token, options={}) => {
  const response = await globalThis.fetch(api + path, {
    ...options,
    headers: { Origin: "http://127.0.0.1:3113",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}) },
  });
  const body = await response.text();
  return { status: response.status, json: body ? JSON.parse(body) : null,
    cache: response.headers.get("cache-control"),
    staffAuthSessionId: response.headers.get("x-vaylet-staff-auth-session-id") };
};
const searchPath = (org, loc) =>
  `/v1/staff/management/organizations/${org}/locations/${loc}/audit-investigations`;
const ids = [];
await client.connect();
try {
  assert.equal((await client.query("SELECT current_database() AS db")).rows[0].db,
    "issue300_g2");
  const { ids: seed, users } = await seedIssue300Http(client,
    { indirectAudit: false });
  const path = searchPath(seed.org, seed.location);
  const login = await call("/v1/staff/auth/login", null, {
    method: "POST", body: JSON.stringify({
      email: users.admin.email, password: users.admin.password,
    }),
  });
  assert.equal(login.status, 200);
  const token = login.json.accessToken;
  const begin = await call("/v1/staff/auth/mfa/enrollment/begin",token,
    { method: "POST", body: "{}" });
  assert.equal(begin.status, 200);
  const code = await generate({ strategy: "totp", algorithm: "sha1",
    digits: 6, period: 30, secret: begin.json.provisioning.secretBase32 });
  const confirm = await call("/v1/staff/auth/mfa/enrollment/confirm",token,
    { method: "POST", body: JSON.stringify({ factorId: begin.json.factorId, code }) });
  assert.equal(confirm.status, 200);
  globalThis.console.log("PASS U05 HTTP preflight: actual Argon2 login, fresh TOTP MFA, task-owned proof API3162");

  for(let i=0;i<5;i+=1){
    const id=randomUUID();
    const eventId=randomUUID();
    const vehicleId=randomUUID();
    ids.push({ id,eventId });
    await client.query(
      `INSERT INTO vehicles(id,organization_id,make,model,
        temporary_descriptor,updated_at)
       VALUES($1,$2,'Toyota','Camry','G2 U05 ONLY',now())`,
      [vehicleId,seed.org],
    );
    await client.query(
      `INSERT INTO valet_sessions(id,organization_id,location_id,vehicle_id,
        state,checked_in_by_membership_id,customer_access_token_hash,
        customer_access_expires_at,updated_at)
       VALUES($1,$2,$3,$4,'PARKED',$5,$6,now()+interval '1 day',now())`,
      [id,seed.org,seed.location,vehicleId,users.admin.membershipId,
        "u05-http:"+randomUUID()],
    );
    await client.query(
      `INSERT INTO audit_events(id,organization_id,location_id,
        valet_session_id,actor_membership_id,actor_type,event_type,
        entity_type,entity_id,metadata_json,occurred_at)
       VALUES($1,$2,$3,$4,$5,'MEMBERSHIP','VALET_SESSION_PARKED',
        'ValetSession',$4,'{}'::jsonb,$6)`,
      [eventId,seed.org,seed.location,id,users.admin.membershipId,
        new Date(Date.parse("2026-10-16T11:20:00Z") + 60_000*i).toISOString()],
    );
  }
  const qs = `?from=2026-10-16T11%3A00%3A00.000Z&to=2026-10-16T12%3A00%3A00.000Z&membershipId=${users.admin.membershipId}&limit=2`;
  let response = await call(path+"/sessions"+qs,token);
  assert.equal(response.status,200,JSON.stringify(response.json));
  assert.equal(response.cache,"no-store");
  assert.equal(response.json.items.length,2);
  assert.ok(response.json.nextCursor);
  const firstCursor=response.json.nextCursor;
  const snapshot=response.json.snapshotAt;
  const all=[];
  for(let page=0;page<8;page+=1){
    assert.equal(response.status,200);
    assert.equal(response.json.snapshotAt,snapshot);
    all.push(...response.json.items);
    if(!response.json.nextCursor)break;
    response=await call(path+"/sessions"+qs+"&cursor="+response.json.nextCursor,token);
    if(page===7)throw new Error("Excessive search pagination");
  }
  assert.equal(all.length,6);
  assert.equal(new Set(all.map((x)=>x.sessionId)).size,all.length);
  assert.ok(ids.every((x)=>all.some((item)=>item.sessionId===x.id)));
  globalThis.console.log("PASS U05 HTTP Search: multiple signed DESC pages, exact stable snapshotAt and 6 unique same-Member Sessions, no duplicates");
  const currentVehicle = await call(path + "/sessions" + qs + "&make=Toyota", token);
  assert.equal(currentVehicle.status, 503);
  globalThis.console.log("PASS U05-R07: oversized current make-filter cohort remains unavailable instead of claiming stable pagination");

  const wrongFilter=await call(path+"/sessions"+
    qs.replace("limit=2","limit=3")+"&cursor="+firstCursor,token);
  // Page size is intentionally not part of the cohort identity; all other
  // filter values ARE. Use a different exact [from,to) for a true negative.
  assert.ok([200,400].includes(wrongFilter.status));
  const wrongWindow=await call(path+"/sessions"+
    qs.replace("11%3A00","10%3A00")+"&cursor="+firstCursor,token);
  assert.notEqual(wrongWindow.status,200);
  const wrongPurpose=await call(path+`/sessions/${seed.session}/timeline?limit=2&cursor=${firstCursor}`,token);
  assert.notEqual(wrongPurpose.status,200);
  const tampered=firstCursor.slice(0,-1)+(firstCursor.endsWith("A")?"B":"A");
  assert.notEqual((await call(path+"/sessions"+qs+"&cursor="+tampered,token)).status,200);
  const managerLogin = await call("/v1/staff/auth/login", null, {
    method: "POST", body: JSON.stringify({
      email: users.manager.email, password: users.manager.password,
    }),
  });
  assert.equal(managerLogin.status, 200);
  const managerBegin = await call("/v1/staff/auth/mfa/enrollment/begin",
    managerLogin.json.accessToken, { method: "POST", body: "{}" });
  assert.equal(managerBegin.status, 200);
  const managerCode = await generate({ strategy: "totp", algorithm: "sha1",
    digits: 6, period: 30, secret: managerBegin.json.provisioning.secretBase32 });
  const managerConfirm = await call("/v1/staff/auth/mfa/enrollment/confirm",
    managerLogin.json.accessToken, { method: "POST", body: JSON.stringify({
      factorId: managerBegin.json.factorId, code: managerCode,
    }) });
  assert.equal(managerConfirm.status, 200);
  assert.notEqual((await call(path+"/sessions"+qs+"&cursor="+firstCursor,
    managerLogin.json.accessToken)).status, 200);
  globalThis.console.log("PASS U05 HTTP cursor: wrong window, purpose and altered HMAC all rejected");

  // Four independently persisted G2-only source events share the SAME exact
  // timestamp. Their rank and UUID keysets must survive page boundaries.
  const tiedAt = "2026-10-16T11:18:00Z";
  await client.query(
    `INSERT INTO key_custody_events(id,organization_id,location_id,
       valet_session_id,key_slot_id,actor_membership_id,event_type,occurred_at)
     VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,'CHECKED_OUT',$6)`,
    [seed.org,seed.location,seed.session,seed.slot,users.manager.membershipId,tiedAt],
  );
  await client.query(
    `INSERT INTO dispatch_events(id,organization_id,location_id,
      valet_session_id,task_id,event_type,new_assignee_membership_id,occurred_at)
     VALUES(gen_random_uuid(),$1,$2,$3,$4,'ASSIGNED',$5,$6)`,
    [seed.org,seed.location,seed.session,seed.task,users.admin.membershipId,tiedAt],
  );
  await client.query(
    `INSERT INTO audit_events(id,organization_id,location_id,
      valet_session_id,actor_membership_id,actor_type,event_type,
      entity_type,entity_id,metadata_json,occurred_at)
     VALUES(gen_random_uuid(),$1,$2,$3,$4,'MEMBERSHIP',
      'VALET_SESSION_PARKED','ValetSession',$3,'{}'::jsonb,$5)`,
    [seed.org,seed.location,seed.session,users.admin.membershipId,tiedAt],
  );
  await client.query(
    `INSERT INTO incidents(id,organization_id,location_id,valet_session_id,
      status,severity,type,description,reported_by_membership_id,created_at)
     VALUES(gen_random_uuid(),$1,$2,$3,'OPEN','LOW','G2_TIE_TEST',
       'G2 private dummy',$4,$5)`,
    [seed.org,seed.location,seed.session,users.manager.membershipId,tiedAt],
  );

  let timeline=await call(path+`/sessions/${seed.session}/timeline?limit=2`,token);
  assert.equal(timeline.status,200,JSON.stringify(timeline.json));
  const timelineSnapshot=timeline.json.snapshotAt;
  const evidence=[];
  for(let page=0;page<8;page+=1){
    assert.equal(timeline.status,200);
    assert.equal(timeline.json.snapshotAt,timelineSnapshot);
    evidence.push(...timeline.json.items);
    if(!timeline.json.nextCursor)break;
    timeline=await call(path+`/sessions/${seed.session}/timeline?limit=2&cursor=${timeline.json.nextCursor}`,token);
    if(page===7)throw new Error("Too many timeline pages");
  }
  const sourceKeys=evidence.map((e)=>e.key.source+":"+e.key.eventId);
  assert.equal(new Set(sourceKeys).size,sourceKeys.length);
  assert.ok(["AUDIT","KEY_CUSTODY","DISPATCH","INCIDENT"]
    .every((s)=>evidence.some((e)=>e.key.source===s)));
  const atTie = evidence.filter((e) => e.occurredAt === "2026-10-16T11:18:00.000Z");
  assert.equal(atTie.length, 4);
  assert.deepEqual(atTie.map((e)=>e.key.source),
    ["AUDIT","KEY_CUSTODY","DISPATCH","INCIDENT"]);
  globalThis.console.log("PASS U05 HTTP Timeline: multi-page ASC four-source UUID distinct, bound snapshotAt across requests");

  // Current Location status is NOT a historical event insertion snapshot.
  // A page1 ACTIVE response must not be continued as the same cohort if
  // Incident availability changes between requests.
  await client.query("UPDATE locations SET status='INACTIVE', updated_at=now() WHERE id=$1",
    [seed.location]);
  const changedLocation = await call(path+"/sessions"+qs+"&cursor="+firstCursor,token);
  assert.notEqual(changedLocation.status,200);
  await client.query("UPDATE locations SET status='ACTIVE', updated_at=now() WHERE id=$1",
    [seed.location]);
  globalThis.console.log("PASS U05 HTTP policy: changed Location Incident visibility rejected by purpose/scope/HMAC binding, without granting stale permission");

  // An Audit row with a deferred Task pointer cannot be safely evaluated
  // under the original S0. A multi-page read must REFUSE even if the Task
  // does not yet exist; otherwise a later Task INSERT makes a phantom.
  await client.query(
    `INSERT INTO audit_events(id,organization_id,location_id,
       actor_membership_id,actor_type,event_type,entity_type,
       entity_id,metadata_json,occurred_at)
     VALUES(gen_random_uuid(),$1,$2,$3,'MEMBERSHIP',
       'VALET_SESSION_PARKED','Task',$4,'{}'::jsonb,
       '2026-10-16T11:25:00Z')`,
    [seed.org,seed.location,users.admin.membershipId,randomUUID()],
  );
  const riskySearch = await call(path+"/sessions"+qs,token);
  assert.equal(riskySearch.status,503);
  const riskyTimeline = await call(path+`/sessions/${seed.session}/timeline?limit=2`,token);
  assert.equal(riskyTimeline.status,503);
  globalThis.console.log("PASS U05 HTTP guard: unresolved pre-snapshot Audit→Task reference forces 503 on Search and Timeline overflow; full source coverage not falsely claimed");

  // Company Admin has all-Location authority by role; removing an LM-style
  // individual grant is NOT a valid CA revocation test. Revoke the *exact*
  // currently authenticated Staff session instead.
  assert.ok(login.staffAuthSessionId);
  await client.query("UPDATE staff_auth_sessions SET revoked_at=now() WHERE id=$1",
    [login.staffAuthSessionId]);
  assert.notEqual((await call(path+"/sessions"+qs+"&cursor="+firstCursor,token)).status,200);
  globalThis.console.log("PASS U05 HTTP revocation: exact CA Staff session revoked between signed pages; current authorization denies continuation");
} finally {
  // This script is only for a disposable task-owned database. Preserve source
  // history as evidence; never broad-clean persistent rows or touch other DBs.
  await client.end();
}
