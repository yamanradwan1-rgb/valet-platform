import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";

const required = {
  host: "127.0.0.1", port: "50790", database: "vaylet_w59_s03",
  admin: "vaylet_w59_admin", runtime: "vaylet_w59_runtime",
  management: "vaylet_management_writer", systemId: "7708460796735844386",
};
const hash = (text, prefix) => prefix + createHash("sha256").update(text).digest("hex");
const uid = () => randomUUID();
const bearer = `w59-only-${uid()}`;
const ids = {
  admin: uid(), employee: uid(), organization: uid(), otherOrganization: uid(),
  actorMembership: uid(), employeeMembership: uid(), otherMembership: uid(),
  session: uid(), factor: uid(), location: uid(),
};
const roleSQL = `SELECT * FROM public.staff_management_authorized_set_role(
  $1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::uuid,$7::integer,$8::membership_role)`;
const onboardingSQL = `SELECT * FROM public.staff_management_authorized_onboarding_create(
  $1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::uuid,$7::text,
  $8::text,$9::text,$10::text,$11::membership_role,$12::uuid[],$13::text)`;
const resendSQL = `SELECT * FROM public.staff_management_authorized_onboarding_resend(
  $1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::text,$9::text)`;
const roleArgs = (overrides = {}) => [
  ids.session, overrides.user ?? ids.admin, overrides.bearer ?? bearer,
  overrides.actor ?? ids.actorMembership,
  overrides.organization ?? ids.organization,
  ids.employeeMembership, 1, "VALET_SUPERVISOR",
];
let assertions = 0;
async function sql(client, query, args = []) {
  return client.query(query, args);
}
async function denied(client, label, query, args = []) {
  const name = `s03_${assertions}`;
  await sql(client, `SAVEPOINT ${name}`);
  let state = "ACCEPTED";
  try { await sql(client, query, args); } catch (error) { state = error.code; }
  await sql(client, `ROLLBACK TO SAVEPOINT ${name}`);
  await sql(client, `RELEASE SAVEPOINT ${name}`);
  assert.equal(state, "42501", label);
  assertions++;
}
async function writer(client) { await sql(client, "SET LOCAL ROLE vaylet_management_writer"); }
async function admin(client) { await sql(client, "RESET ROLE"); }

test("OWN PG17 upgrade: raw bearer, actor, MFA, onboarding, atomicity", async (t) => {
  if (process.env.ISSUE416_S03_W59_PG17_QA !== "OWN_50790_ONLY") {
    t.skip("Explicit disposable-W59-DB opt-in required"); return;
  }
  const parsed = new URL(process.env.MIGRATION_DATABASE_URL ?? "");
  for (const [key, expected] of [
    ["hostname", required.host], ["port", required.port],
    ["username", required.admin], ["pathname", `/${required.database}`],
  ]) assert.equal(parsed[key], expected, `Unexpected ${key}; never connect outside own PG17`);
  const client = new pg.Client({ connectionString: parsed.toString() });
  await client.connect();
  try {
    const identity = await sql(client,
      "SELECT current_setting('server_version') AS version, system_identifier FROM pg_control_system()");
    assert.match(identity.rows[0].version, /^17\.11/);
    assert.equal(String(identity.rows[0].system_identifier), required.systemId);
    assert.equal((await sql(client,
      "SELECT count(*)::integer AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL")).rows[0].n, 146);
    await sql(client, "BEGIN");
    try {
      await sql(client, `INSERT INTO users(id,email,password_hash,status,updated_at) VALUES
        ($1,$2,'w59-qa-hash','ACTIVE',clock_timestamp()),
        ($3,$4,'w59-qa-hash','ACTIVE',clock_timestamp())`,
      [ids.admin, `${uid()}@example.test`, ids.employee, `${uid()}@example.test`]);
      await sql(client, `INSERT INTO organizations(id,name,status,timezone,updated_at) VALUES
        ($1,'W59 Own','ACTIVE','Asia/Amman',clock_timestamp()),
        ($2,'W59 Foreign','ACTIVE','Asia/Amman',clock_timestamp())`,
      [ids.organization, ids.otherOrganization]);
      await sql(client, `INSERT INTO organization_subscriptions
        (organization_id,plan_code,status,dashboard_access_enabled,report_exports_enabled,basic_branding_enabled)
        VALUES ($1,'TEST','ACTIVE',TRUE,TRUE,TRUE),($2,'TEST','ACTIVE',TRUE,TRUE,TRUE)`,
      [ids.organization, ids.otherOrganization]);
      await sql(client, `INSERT INTO organization_memberships
        (id,organization_id,user_id,role,status,updated_at) VALUES
        ($1,$2,$3,'ORG_ADMIN','ACTIVE',clock_timestamp()),
        ($4,$2,$5,'VALET_EMPLOYEE','ACTIVE',clock_timestamp()),
        ($6,$7,$5,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,
      [ids.actorMembership, ids.organization, ids.admin,
        ids.employeeMembership, ids.employee, ids.otherMembership, ids.otherOrganization]);
      await sql(client, `INSERT INTO locations
        (id,organization_id,name,code,address_text,timezone,currency,status,accepting_intake,updated_at)
        VALUES ($1,$2,'W59 Local',$3,'Synthetic','Asia/Amman','JOD','ACTIVE',TRUE,clock_timestamp())`,
      [ids.location, ids.organization, uid()]);
      await sql(client, `INSERT INTO membership_location_access
        (organization_id,membership_id,location_id) VALUES ($1,$2,$3)`,
      [ids.organization, ids.employeeMembership, ids.location]);
      await sql(client, `INSERT INTO user_mfa_totp_factors
        (id,user_id,state,protected_secret,created_at,activated_at,last_accepted_step,recovery_set_generation)
        VALUES ($1,$2,'ACTIVE',$3,clock_timestamp()-interval '60 seconds',
          clock_timestamp()-interval '55 seconds',1,1)`,
      [ids.factor, ids.admin, `mte1.${"a".repeat(16)}.${"b".repeat(44)}.${"c".repeat(22)}`]);
      await sql(client, `INSERT INTO staff_auth_sessions
        (id,user_id,current_access_token_hash,created_at,last_rotated_at,
         access_expires_at,absolute_expires_at,mfa_authenticated_at,mfa_factor_id,last_admin_activity_at)
        VALUES ($1,$2,$3,clock_timestamp()-interval '20 minutes',
          clock_timestamp()-interval '19 minutes',clock_timestamp()+interval '15 minutes',
          clock_timestamp()+interval '3 hours',clock_timestamp()-interval '10 seconds',
          $4,clock_timestamp()-interval '9 seconds')`,
      [ids.session, ids.admin, hash(bearer, "staff-access-sha256:v1:"), ids.factor]);
      await writer(client);
      assert.equal((await sql(client, "SELECT current_user AS role")).rows[0].role, required.management);
      await denied(client, "stored verifier is not bearer", roleSQL,
        roleArgs({ bearer: hash(bearer, "staff-access-sha256:v1:") }));
      await denied(client, "wrong user", roleSQL, roleArgs({ user: ids.employee }));
      await denied(client, "wrong membership", roleSQL, roleArgs({ actor: ids.employeeMembership }));
      await denied(client, "wrong organization", roleSQL,
        roleArgs({ organization: ids.otherOrganization, actor: ids.otherMembership }));
      await denied(client, "direct hidden helper", `SELECT public.staff_management_authorize_writer(
        $1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid)`, roleArgs().slice(0,5));
      const transactionSavepoint = "s03_atomicity";
      await sql(client, `SAVEPOINT ${transactionSavepoint}`);
      const changed = await sql(client, roleSQL, roleArgs());
      assert.deepEqual(changed.rows[0], { version: 2, changed: true, result_code: "OK" });
      await sql(client, `INSERT INTO audit_events
        (id,organization_id,actor_membership_id,actor_type,event_type,entity_type,
        entity_id,metadata_json,occurred_at)
        VALUES ($1,$2,$3,'MEMBERSHIP','STAFF_ROLE_CHANGED','OrganizationMembership',$4,'{}',clock_timestamp())`,
      [uid(), ids.organization, ids.actorMembership, ids.employeeMembership]);
      await sql(client, `ROLLBACK TO SAVEPOINT ${transactionSavepoint}`);
      assert.deepEqual((await sql(client,
        "SELECT role::text AS role,version FROM organization_memberships WHERE id=$1",
        [ids.employeeMembership])).rows[0], { role: "VALET_EMPLOYEE", version: 1 });
      assert.equal((await sql(client,
        `SELECT count(*)::integer AS n FROM audit_events WHERE entity_id=$1
         AND event_type='STAFF_ROLE_CHANGED'`, [ids.employeeMembership])).rows[0].n, 0);
      assertions++;
      const inviteArgs = [ids.session, ids.admin, bearer, ids.actorMembership,
        ids.organization, uid(), "a".repeat(64), `${uid()}@example.test`,
        "Synthetic", "W59", "VALET_EMPLOYEE", [ids.location],
        hash(uid(), "staff-invite-sha256:v1:")];
      const invite = await sql(client, onboardingSQL, inviteArgs);
      assert.equal(invite.rows[0].changed, true);assert.equal(invite.rows[0].generation, 1);
      assertions++;
      const resend = await sql(client, resendSQL, [
        ids.session, ids.admin, bearer, ids.actorMembership, ids.organization,
        invite.rows[0].membership_id, uid(), "b".repeat(64),
        hash(uid(), "staff-invite-sha256:v1:")]);
      assert.equal(resend.rows[0].changed, true);assert.equal(resend.rows[0].generation, 2);
      assertions++;
      await admin(client);
      await sql(client, "SAVEPOINT s03_revocation");
      await sql(client, "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1", [ids.session]);
      await writer(client);
      await denied(client, "revoked bearer", roleSQL, roleArgs());
      await admin(client);
      // Revocation is intentionally immutable; roll back this fixture subcase
      // rather than attempting an invalid NULL reset on a committed logout.
      await sql(client, "ROLLBACK TO SAVEPOINT s03_revocation");
      await sql(client, `UPDATE staff_auth_sessions SET
        mfa_authenticated_at=clock_timestamp()-interval '6 minutes',
        last_admin_activity_at=clock_timestamp()-interval '5 minutes' WHERE id=$1`, [ids.session]);
      await writer(client);
      await denied(client, "MFA outside five-minute freshness", roleSQL, roleArgs());
      await admin(client);
      await sql(client, `UPDATE staff_auth_sessions SET mfa_authenticated_at=clock_timestamp()-interval '10 seconds',
        last_admin_activity_at=clock_timestamp()-interval '9 seconds' WHERE id=$1`, [ids.session]);
      await sql(client, `UPDATE user_mfa_totp_factors SET state='RETIRED',retired_at=clock_timestamp()
        WHERE id=$1`, [ids.factor]);
      await writer(client);
      await denied(client, "retired current factor", roleSQL, roleArgs());
      await admin(client);
      console.log(`W59 OWN PG17 S03 verified ${assertions} positive/negative assertions; all fixture data ROLLED BACK`);
    } finally {
      await admin(client).catch(() => undefined);
      await sql(client, "ROLLBACK");
    }
  } finally {
    await client.end();
  }
}, { timeout: 60_000 });
