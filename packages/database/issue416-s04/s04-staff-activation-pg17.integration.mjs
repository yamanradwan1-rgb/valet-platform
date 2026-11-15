import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { test } from "node:test";
import pg from "pg";
import { grantS04ProtectedWriterFunction } from "../scripts/s04-protected-writer-privileges.mjs";

const url = process.env.S04_W58_PG17_FIXTURE_URL;
const systemId = process.env.S04_W58_PG17_SYSTEM_ID;
const path = resolve(fileURLToPath(import.meta.url), "../../../../");
const migration = readFileSync(resolve(path,
  "packages/database/prisma/migrations/20261115235910_option_c_s04_staff_activation_success/migration.sql"), "utf8");
const scope = "v1:staff-activation-credential";
const address = "v1:staff-activation-client-address";
const keyFor = (character) => "anti-abuse-hmac-sha256:v1:" + character.repeat(64);
const secret = Buffer.alloc(32, 0x54);
const sql = "SELECT public.s04_staff_activation_success($1::uuid,$2,$3,$4) AS affected";

async function formatted(client, template, values) {
  const result = await client.query("SELECT format($1,$2::text) AS sql", [template,values[0]]);
  await client.query(result.rows[0].sql);
}

async function denied(client, statement, args, code = "42501") {
  await assert.rejects(client.query(statement,args), (error) => error.code === code);
}

async function pending(runtime, eventScope, key) {
  const nonce = randomUUID();
  const expires = Date.now() + 15000;
  const proof = createHmac("sha256",secret)
    .update(`s04-v1|PENDING|${eventScope}|${key}|${nonce}|${expires}`)
    .digest("hex");
  const result = await runtime.query(
    "SELECT public.s04_reserve($1,$2,$3::uuid,$4::bigint,$5) AS id",
    [eventScope,key,nonce,expires,proof],
  );
  return result.rows[0].id;
}

test("owned PG17: activation-only finalizer, same-tx receipt, replay and ACL", {
  skip: !url || !systemId ? "explicit individually attested PG17 required" : false,
}, async () => {
  const target = new URL(url);
  assert.equal(target.hostname,"127.0.0.1");
  assert.equal(target.port,"51558");
  assert.equal(target.pathname,"/s04_w58_disposable");
  assert.equal(target.username,"w58_owner");
  const admin = new pg.Client({connectionString:url});
  const restrictedUrl = (user) => {
    const clone = new URL(url);
    clone.username=user;
    clone.password="w58_test_only_password";
    return clone.toString();
  };
  const runtime = new pg.Client({connectionString:restrictedUrl("w58_s04_runtime")});
  const writer = new pg.Client({connectionString:restrictedUrl("w58_s04_staff_writer")});
  const mfa = new pg.Client({connectionString:restrictedUrl("w58_s04_mfa_writer")});
  await admin.connect();
  try {
    const id = await admin.query(
      `SELECT current_database() AS db,current_user AS role,
         current_setting('server_version_num')::int AS version,
         system_identifier::text AS system FROM pg_control_system()`);
    assert.deepEqual(id.rows[0],{
      db:"s04_w58_disposable",role:"w58_owner",version:170011,system:systemId,
    });
    // The prior S04 PG17 test seeds the independently attested private key and
    // real scoped runtime/staff/MFA roles. It must run first on this OWN fixture.
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM s04_quota_guard.proof_key"))
      .rows[0].count,1);
    await admin.query(`CREATE TABLE public.users(id uuid PRIMARY KEY,status text NOT NULL)`);
    await admin.query(`CREATE TABLE public.organization_memberships(
      id uuid PRIMARY KEY,organization_id uuid NOT NULL,user_id uuid NOT NULL,status text NOT NULL)`);
    await admin.query(`CREATE TABLE public.staff_onboarding_invitations(
      id uuid PRIMARY KEY,organization_id uuid NOT NULL,membership_id uuid NOT NULL,
      token_hash text NOT NULL,consumed_at timestamptz,revoked_at timestamptz,generation int NOT NULL)`);
    await admin.query(`CREATE TABLE public.audit_events(
      organization_id uuid,entity_type text,entity_id uuid,
      event_type text,metadata_json jsonb)`);
    await admin.query(migration);
    await grantS04ProtectedWriterFunction(admin,formatted,
      "staffActivation","w58_s04_staff_writer","w58_s04_runtime");
    await runtime.connect();
    await writer.connect();
    await mfa.connect();
    const access = await admin.query(
      `SELECT has_function_privilege('w58_s04_staff_writer',
          'public.s04_staff_activation_success(uuid,text,text,text)','EXECUTE') AS staff,
          has_function_privilege('w58_s04_runtime',
          'public.s04_staff_activation_success(uuid,text,text,text)','EXECUTE') AS runtime,
          has_function_privilege('w58_s04_mfa_writer',
          'public.s04_staff_activation_success(uuid,text,text,text)','EXECUTE') AS mfa`);
    assert.deepEqual(access.rows[0],{staff:true,runtime:false,mfa:false});
    const invite = randomUUID(),membership = randomUUID();
    const organization = randomUUID(),user = randomUUID(),tokenHash = "a".repeat(64);
    await admin.query("INSERT INTO public.users VALUES($1,'PENDING')",[user]);
    await admin.query("INSERT INTO public.organization_memberships VALUES($1,$2,$3,'PENDING')",
      [membership,organization,user]);
    await admin.query("INSERT INTO public.staff_onboarding_invitations VALUES($1,$2,$3,$4,NULL,NULL,1)",
      [invite,organization,membership,tokenHash]);
    const events = [
      {scope,key:keyFor("a"),id:await pending(runtime,scope,keyFor("a"))},
      {scope:address,key:keyFor("b"),id:await pending(runtime,address,keyFor("b"))},
      {scope:"v1:guest-token",key:keyFor("c"),
       id:await pending(runtime,"v1:guest-token",keyFor("c"))},
    ];
    await denied(runtime,sql,[events[0].id,scope,events[0].key,tokenHash]);
    await denied(mfa,sql,[events[0].id,scope,events[0].key,tokenHash]);
    await denied(writer,sql,[events[0].id,"v1:guest-token",events[0].key,tokenHash]);
    await denied(writer,sql,[events[0].id,scope,events[0].key,tokenHash]);
    const writeEvidence = async () => {
      await admin.query("UPDATE public.users SET status='ACTIVE' WHERE id=$1",[user]);
      await admin.query("UPDATE public.organization_memberships SET status='ACTIVE' WHERE id=$1",[membership]);
      await admin.query("UPDATE public.staff_onboarding_invitations SET consumed_at=clock_timestamp() WHERE id=$1",[invite]);
      await admin.query(
        `INSERT INTO public.audit_events VALUES($1,'OrganizationMembership',$2,
           'STAFF_ONBOARDING_ACTIVATED',$3::jsonb)`,
        [organization,membership,JSON.stringify({invitationId:invite,generation:1})]);
    };
    await admin.query("BEGIN");
    await writeEvidence();
    await admin.query("SET LOCAL ROLE w58_s04_staff_writer");
    for (const row of events.slice(0,2)) {
      assert.equal((await admin.query(sql,[row.id,row.scope,row.key,tokenHash])).rows[0].affected,1);
    }
    assert.equal((await admin.query(sql,
      [events[0].id,scope,events[0].key,tokenHash])).rows[0].affected,0);
    assert.equal((await admin.query(sql,
      [events[2].id,scope,events[2].key,tokenHash])).rows[0].affected,0);
    await admin.query("ROLLBACK");
    const before = await runtime.query(
      "SELECT state FROM public.anti_abuse_events WHERE id=ANY($1::uuid[])",
      [events.map((event)=>event.id)]);
    assert.deepEqual(before.rows.map((row)=>row.state),["PENDING","PENDING","PENDING"]);
    await admin.query("BEGIN");
    await writeEvidence();
    await admin.query("SET LOCAL ROLE w58_s04_staff_writer");
    for (const row of events.slice(0,2))
      assert.equal((await admin.query(sql,[row.id,row.scope,row.key,tokenHash])).rows[0].affected,1);
    await admin.query("COMMIT");
    const after = await runtime.query(
      "SELECT scope,state FROM public.anti_abuse_events WHERE id=ANY($1::uuid[]) ORDER BY scope",
      [events.map((event)=>event.id)]);
    assert.deepEqual(after.rows,[
      {scope:"v1:guest-token",state:"PENDING"},
      {scope:"v1:staff-activation-client-address",state:"IGNORED"},
      {scope:"v1:staff-activation-credential",state:"IGNORED"},
    ]);
    assert.equal((await writer.query(sql,
      [events[0].id,scope,events[0].key,tokenHash])).rows[0].affected,0);
    const countedId = randomUUID();
    await admin.query(`INSERT INTO public.anti_abuse_events(id,scope,key_hash,state)
      VALUES($1,$2,$3,'COUNTED')`,[countedId,scope,events[0].key]);
    assert.equal((await writer.query(sql,
      [countedId,scope,events[0].key,tokenHash])).rows[0].affected,0);
    await denied(writer,"UPDATE public.anti_abuse_events SET state='IGNORED' WHERE id=$1",[countedId]);
  } finally {
    await Promise.all([runtime,writer,mfa].map((client)=>client.end().catch(()=>undefined)));
    await admin.end();
  }
});
