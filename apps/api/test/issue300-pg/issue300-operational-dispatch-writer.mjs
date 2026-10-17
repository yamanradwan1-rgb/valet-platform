import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { generate } from "otplib";
import pg from "pg";
import { seedIssue300Http } from "./issue300-http-seed.mjs";

const raw = globalThis.process.env.ISSUE300_PG_TEST_URL;
if (!raw) throw new Error("G2 database URL is required");
const target = new globalThis.URL(raw);
if (target.hostname !== "127.0.0.1" || target.port !== "55480" ||
    target.pathname !== "/issue300_g2" || target.search || target.hash)
  throw new Error("Unexpected database identity");
const client = new pg.Client({ connectionString: raw,
  application_name: "issue300_actual_dispatch_writer_G2" });
const api = "http://127.0.0.1:3162";
async function post(path, token, data) {
  const response = await globalThis.fetch(api+path,{
    method:"POST",headers:{ Origin:"http://127.0.0.1:3113",
      "Content-Type":"application/json",
      ...(token?{Authorization:`Bearer ${token}`}:{}) },
    body:JSON.stringify(data),
  });
  return { status:response.status,json:await response.json() };
}
await client.connect();
try {
  assert.equal((await client.query("SELECT current_database() AS db")).rows[0].db,
    "issue300_g2");
  const { ids, users } = await seedIssue300Http(client);
  const employeeId = randomUUID();
  const employeeMembership = randomUUID();
  // Explicit DIRECT SQL setup only: not an employee/shift writer test.
  const passwordHash = (await client.query(
    "SELECT password_hash FROM users WHERE id=$1",[users.supervisor.id],
  )).rows[0]?.password_hash;
  assert.ok(passwordHash);
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO users(id,email,password_hash,status,updated_at)
       VALUES($1,$2,$3,'ACTIVE',now())`,
      [employeeId,`${employeeId}@example.invalid`,passwordHash],
    );
    await client.query(
      `INSERT INTO organization_memberships(id,organization_id,user_id,
        role,status,first_name,last_name,updated_at)
       VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE','G2','Assignee',now())`,
      [employeeMembership,ids.org,employeeId],
    );
    await client.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,
        location_id) VALUES($1,$2,$3)`,
      [ids.org,employeeMembership,ids.location],
    );
    for (const member of [users.supervisor.membershipId,employeeMembership]) {
      await client.query(
        `INSERT INTO shifts(id,organization_id,location_id,membership_id,
           status,started_at)
         VALUES($1,$2,$3,$4,'ACTIVE',now())`,
        [randomUUID(),ids.org,ids.location,member],
      );
    }
    await client.query("COMMIT");
  } catch(error) { await client.query("ROLLBACK"); throw error; }
  const login = await post("/v1/staff/auth/login",null,
    {email:users.supervisor.email,password:users.supervisor.password});
  assert.equal(login.status,200,JSON.stringify(login.json));
  const staffToken=login.json.accessToken;
  const [initial] = (await client.query(
    `SELECT version,status::text AS status FROM tasks WHERE id=$1`,
    [ids.task],
  )).rows;
  assert.equal(initial.status,"QUEUED");
  const assignment = await post(`/v1/staff/tasks/${ids.task}/assign`,staffToken,
    {expectedVersion:initial.version,
      targetAssigneeMembershipId:users.supervisor.membershipId});
  assert.equal(assignment.status,200,JSON.stringify(assignment.json));
  assert.equal(assignment.json.status,"ASSIGNED");
  assert.equal(assignment.json.currentAssigneeMembershipId,
    users.supervisor.membershipId);
  const reassignment = await post(`/v1/staff/tasks/${ids.task}/reassign`,
    staffToken,{expectedVersion:assignment.json.version,
      targetAssigneeMembershipId:employeeMembership,
      reason:"G2 writer test handoff"});
  assert.equal(reassignment.status,200,JSON.stringify(reassignment.json));
  assert.equal(reassignment.json.currentAssigneeMembershipId,employeeMembership);

  const evidence = (await client.query(
    `SELECT event_type::text AS type, actor_membership_id AS actor,
       previous_assignee_membership_id AS previous,
       new_assignee_membership_id AS next,
       pagination_birth_xid::text AS birth,
       created_at, occurred_at
     FROM dispatch_events WHERE valet_session_id=$1
       AND task_id=$2 AND event_type IN ('ASSIGNED','REASSIGNED')
       AND actor_membership_id=$3
     ORDER BY created_at ASC, id ASC`,
    [ids.session,ids.task,users.supervisor.membershipId],
  )).rows;
  assert.equal(evidence.length,2);
  assert.deepEqual(evidence.map((event)=>event.type),
    ["ASSIGNED","REASSIGNED"]);
  assert.equal(evidence[0].next,users.supervisor.membershipId);
  assert.equal(evidence[1].previous,users.supervisor.membershipId);
  assert.equal(evidence[1].next,employeeMembership);
  assert.ok(evidence.every((event)=>event.birth &&
    event.actor===users.supervisor.membershipId));
  globalThis.console.log("PASS G2 REAL Dispatch writers: Supervisor authenticated, actual ASSIGN then REASSIGN HTTP, 2 persisted source rows with immutable birth XID, actor/previous/new participants distinct; shifts/users were DIRECT SQL setup only");

  const admin=await post("/v1/staff/auth/login",null,
    {email:users.admin.email,password:users.admin.password});
  assert.equal(admin.status,200);
  const enroll=await post("/v1/staff/auth/mfa/enrollment/begin",
    admin.json.accessToken,{});
  assert.equal(enroll.status,200);
  const code=await generate({strategy:"totp",algorithm:"sha1",digits:6,
    period:30,secret:enroll.json.provisioning.secretBase32});
  assert.equal((await post("/v1/staff/auth/mfa/enrollment/confirm",
    admin.json.accessToken,{factorId:enroll.json.factorId,code})).status,200);
  const base=`/v1/staff/management/organizations/${ids.org}/locations/`+
    `${ids.location}/audit-investigations/sessions/${ids.session}/timeline?limit=100`;
  const timelineResponse=await globalThis.fetch(api+base,{headers:{
    Origin:"http://127.0.0.1:3113",
    Authorization:`Bearer ${admin.json.accessToken}` }});
  assert.equal(timelineResponse.status,200);
  const timeline=await timelineResponse.json();
  const assignments=timeline.items.filter((event)=>event.key?.source==="DISPATCH");
  assert.ok(assignments.length>=2);
  globalThis.console.log("PASS G2 readback: Company Admin password+TOTP sees both real Dispatch event sources, not merely current Task assignee");
} finally { await client.end(); }
