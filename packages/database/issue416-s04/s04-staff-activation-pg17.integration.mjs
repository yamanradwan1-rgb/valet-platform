import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";
import pg from "pg";
import { grantS04ProtectedWriterFunction } from "../scripts/s04-protected-writer-privileges.mjs";

const url = process.env.S04_W67_PG17_FIXTURE_URL;
const systemId = process.env.S04_W67_PG17_SYSTEM_ID;
const root = resolve(fileURLToPath(import.meta.url), "../../../../");
const initialMigration = readFileSync(resolve(root,
  "packages/database/prisma/migrations/20261115235910_option_c_s04_staff_activation_success/migration.sql"), "utf8");
const signedMigration = readFileSync(resolve(root,
  "packages/database/prisma/migrations/20261116000100_option_c_s04_signed_staff_activation_success/migration.sql"), "utf8");
const scope = "v1:staff-activation-credential";
const address = "v1:staff-activation-client-address";
const keyFor = (character) => "anti-abuse-hmac-sha256:v1:" + character.repeat(64);
const invitationFor = (character) => "staff-invite-sha256:v1:" + character.repeat(64);
const secret = Buffer.alloc(32, 0x54);
const sql = "SELECT public.s04_staff_activation_success($1::uuid,$2,$3,$4,$5::xid8,$6::uuid,$7::bigint,$8) AS affected";

async function formatted(client, template, values) {
  const result = await client.query("SELECT format($1,$2::text) AS sql", [template,values[0]]);
  await client.query(result.rows[0].sql);
}

function proof(action, fields) {
  const nonce = randomUUID();
  const expires = Date.now() + 15000;
  const mac = createHmac("sha256",secret)
    .update(["s04-v1",action,...fields,nonce,expires].join("|"))
    .digest("hex");
  return [nonce,expires,mac];
}

async function transactionId(client) {
  const result = await client.query(
    "SELECT pg_catalog.pg_current_xact_id()::text AS xid",
  );
  assert.match(result.rows[0].xid,/^\d+$/);
  return result.rows[0].xid;
}

function activationArgs(row, invitationHash, xid) {
  return [row.id,row.scope,row.key,invitationHash,xid,
    ...proof("STAFF_ACTIVATION",[row.id,row.scope,row.key,invitationHash,xid])];
}

async function activationCall(client, row, invitationHash) {
  await client.query("BEGIN");
  try {
    const xid = await transactionId(client);
    const result = await client.query(sql,activationArgs(row,invitationHash,xid));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function denied(client, row, invitationHash, options = {}) {
  await client.query("BEGIN");
  try {
    const xid = await transactionId(client);
    const args = activationArgs(row,invitationHash,xid);
    if (options.badMac) args[7] = "0".repeat(64);
    if (options.wrongXidMac) {
      const wrongXid = (BigInt(xid) + 1n).toString();
      const wrongArgs = activationArgs(row,invitationHash,wrongXid);
      args[5] = wrongArgs[5];
      args[6] = wrongArgs[6];
      args[7] = wrongArgs[7];
    }
    if (options.mismatchedXidParameter) {
      args[4] = (BigInt(xid) + 1n).toString();
    }
    if (options.proofFor) {
      const otherProof = activationArgs(options.proofFor,invitationHash,xid);
      args[5] = otherProof[5];
      args[6] = otherProof[6];
      args[7] = otherProof[7];
    }
    await assert.rejects(client.query(sql,args), (error) => error.code === "42501");
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
  }
}

async function deniedOldTransactionProof(client, args) {
  await client.query("BEGIN");
  try {
    await transactionId(client);
    await assert.rejects(client.query(sql,args), (error) => error.code === "42501");
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
  }
}

async function pending(runtime, eventScope, key) {
  const nonce = randomUUID();
  const expires = Date.now() + 15000;
  const mac = createHmac("sha256",secret)
    .update(`s04-v1|PENDING|${eventScope}|${key}|${nonce}|${expires}`)
    .digest("hex");
  const result = await runtime.query(
    "SELECT public.s04_reserve($1,$2,$3::uuid,$4::bigint,$5) AS id",
    [eventScope,key,nonce,expires,mac],
  );
  return result.rows[0].id;
}

test("owned PG17: XID-bound activation finalizer, rollback, replay, cross-row and ACL", {
  skip: !url || !systemId ? "explicit individually attested PG17 required" : false,
}, async () => {
  const target = new URL(url);
  assert.equal(target.hostname,"127.0.0.1");
  assert.equal(target.port,"51667");
  assert.equal(target.pathname,"/s04_w67_disposable");
  assert.equal(target.username,"w67_owner");
  const admin = new pg.Client({connectionString:url});
  const restrictedUrl = (user) => {
    const clone = new URL(url);
    clone.username=user;
    clone.password="w67_test_only_password";
    return clone.toString();
  };
  const runtime = new pg.Client({connectionString:restrictedUrl("w67_s04_runtime")});
  const writer = new pg.Client({connectionString:restrictedUrl("w67_s04_staff_writer")});
  const mfa = new pg.Client({connectionString:restrictedUrl("w67_s04_mfa_writer")});
  await admin.connect();
  try {
    const identity = await admin.query(
      `SELECT current_database() AS db,current_user AS role,
         current_setting('server_version_num')::int AS version,
         system_identifier::text AS system FROM pg_control_system()`,
    );
    assert.deepEqual(
      [identity.rows[0].db,identity.rows[0].role,identity.rows[0].system],
      ["s04_w67_disposable","w67_owner",systemId],
    );
    assert.ok(identity.rows[0].version >= 170000 && identity.rows[0].version < 180000);
    assert.equal((await admin.query(
      "SELECT count(*)::int AS count FROM s04_quota_guard.proof_key",
    )).rows[0].count,1);
    await admin.query(`CREATE TABLE public.users(id uuid PRIMARY KEY,status text NOT NULL)`);
    await admin.query(`CREATE TABLE public.organization_memberships(
      id uuid PRIMARY KEY,organization_id uuid NOT NULL,user_id uuid NOT NULL,status text NOT NULL)`);
    await admin.query(`CREATE TABLE public.staff_onboarding_invitations(
      id uuid PRIMARY KEY,organization_id uuid NOT NULL,membership_id uuid NOT NULL,
      token_hash text NOT NULL,consumed_at timestamptz,revoked_at timestamptz,generation int NOT NULL)`);
    await admin.query(`CREATE TABLE public.audit_events(
      organization_id uuid,entity_type text,entity_id uuid,
      event_type text,metadata_json jsonb)`);
    await admin.query(initialMigration);
    await admin.query(signedMigration);
    await grantS04ProtectedWriterFunction(admin,formatted,
      "staffActivation","w67_s04_staff_writer","w67_s04_runtime");
    // The PG17 bootstrap fixture provisioned this exact SET-only membership;
    // the migration owner must not inherit writer privileges or admin rights.
    const ownerMembership = await admin.query(
      `SELECT membership.inherit_option,membership.set_option,membership.admin_option
       FROM pg_catalog.pg_auth_members AS membership
       JOIN pg_catalog.pg_roles AS granted ON granted.oid=membership.roleid
       JOIN pg_catalog.pg_roles AS member ON member.oid=membership.member
       WHERE granted.rolname='w67_s04_staff_writer' AND member.rolname='w67_owner'`,
    );
    assert.deepEqual(ownerMembership.rows[0],{
      inherit_option:false,set_option:true,admin_option:false,
    });
    await runtime.connect();
    await writer.connect();
    await mfa.connect();

    const access = await admin.query(
      `SELECT has_function_privilege('w67_s04_staff_writer',
          'public.s04_staff_activation_success(uuid,text,text,text,xid8,uuid,bigint,text)','EXECUTE') AS staff,
          has_function_privilege('w67_s04_runtime',
          'public.s04_staff_activation_success(uuid,text,text,text,xid8,uuid,bigint,text)','EXECUTE') AS runtime,
          has_function_privilege('w67_s04_mfa_writer',
          'public.s04_staff_activation_success(uuid,text,text,text,xid8,uuid,bigint,text)','EXECUTE') AS mfa`);
    assert.deepEqual(access.rows[0],{staff:true,runtime:false,mfa:false});
    const oldSignature = await admin.query(
      "SELECT to_regprocedure('public.s04_staff_activation_success(uuid,text,text,text)') IS NULL AS absent",
    );
    assert.equal(oldSignature.rows[0].absent,true);

    const invite = randomUUID(),membership = randomUUID();
    const organization = randomUUID(),user = randomUUID(),tokenHash = invitationFor("a");
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
      {scope,key:keyFor("d"),id:await pending(runtime,scope,keyFor("d"))},
    ];
    await denied(runtime,events[0],tokenHash);
    await denied(mfa,events[0],tokenHash);
    await denied(writer,events[2],tokenHash);
    await denied(writer,events[0],invitationFor("f"));
    await denied(writer,events[0],tokenHash,{badMac:true});
    // Keep p_xid current while the HMAC commits to a different XID. This
    // exercises the signed-payload binding rather than only the SQL XID guard.
    await denied(writer,events[0],tokenHash,{wrongXidMac:true});
    await denied(writer,events[0],tokenHash,{mismatchedXidParameter:true});
    await denied(writer,events[3],tokenHash,{proofFor:events[0]});
    await denied(writer,events[0],tokenHash);

    const writeEvidence = async () => {
      await admin.query("UPDATE public.users SET status='ACTIVE' WHERE id=$1",[user]);
      await admin.query("UPDATE public.organization_memberships SET status='ACTIVE' WHERE id=$1",[membership]);
      await admin.query("UPDATE public.staff_onboarding_invitations SET consumed_at=clock_timestamp() WHERE id=$1",[invite]);
      await admin.query(
        `INSERT INTO public.audit_events VALUES($1,'OrganizationMembership',$2,
           'STAFF_ONBOARDING_ACTIVATED',$3::jsonb)`,
        [organization,membership,JSON.stringify({invitationId:invite,generation:1})],
      );
    };

    await admin.query("BEGIN");
    const rollbackXid = await transactionId(admin);
    await writeEvidence();
    await admin.query("SET LOCAL ROLE w67_s04_staff_writer");
    const rollbackProofs = events.slice(0,2).map((row) =>
      activationArgs(row,tokenHash,rollbackXid));
    for (const args of rollbackProofs) {
      assert.equal((await admin.query(sql,args)).rows[0].affected,1);
    }
    await admin.query("ROLLBACK");

    const afterRollback = await runtime.query(
      "SELECT id,state FROM public.anti_abuse_events WHERE id=ANY($1::uuid[])",
      [events.map((event)=>event.id)],
    );
    const rollbackStates = new Map(afterRollback.rows.map((row)=>[row.id,row.state]));
    assert.deepEqual(events.map((event)=>rollbackStates.get(event.id)),
      ["PENDING","PENDING","PENDING","PENDING"]);
    const rolledBackEvidence = await admin.query(
      `SELECT account.status AS account_status,member.status AS member_status,
              invitation.consumed_at
       FROM public.staff_onboarding_invitations invitation
       JOIN public.organization_memberships member ON member.id=invitation.membership_id
       JOIN public.users account ON account.id=member.user_id
       WHERE invitation.id=$1`,
      [invite],
    );
    assert.deepEqual(rolledBackEvidence.rows[0],{
      account_status:"PENDING",member_status:"PENDING",consumed_at:null,
    });
    await deniedOldTransactionProof(writer,rollbackProofs[0]);

    await admin.query("BEGIN");
    const commitXid = await transactionId(admin);
    await writeEvidence();
    await admin.query("SET LOCAL ROLE w67_s04_staff_writer");
    const commitProofs = events.slice(0,2).map((row) =>
      activationArgs(row,tokenHash,commitXid));
    for (const args of commitProofs) {
      assert.equal((await admin.query(sql,args)).rows[0].affected,1);
    }
    await admin.query("SAVEPOINT activation_nonce_replay");
    await assert.rejects(admin.query(sql,commitProofs[0]),
      (error) => error.code === "42501");
    await admin.query("ROLLBACK TO SAVEPOINT activation_nonce_replay");
    await admin.query("COMMIT");

    const afterCommit = await runtime.query(
      "SELECT id,state FROM public.anti_abuse_events WHERE id=ANY($1::uuid[])",
      [events.map((event)=>event.id)],
    );
    const committedStates = new Map(afterCommit.rows.map((row)=>[row.id,row.state]));
    assert.deepEqual(events.map((event)=>committedStates.get(event.id)),
      ["IGNORED","IGNORED","PENDING","PENDING"]);

    const countedId = randomUUID();
    await admin.query(`INSERT INTO public.anti_abuse_events(id,scope,key_hash,state)
      VALUES($1,$2,$3,'COUNTED')`,[countedId,scope,events[0].key]);
    assert.equal((await activationCall(writer,
      {id:countedId,scope,key:events[0].key},tokenHash)).rows[0].affected,0);
    assert.equal((await activationCall(writer,
      {id:events[0].id,scope,key:keyFor("f")},tokenHash)).rows[0].affected,0);
    await assert.rejects(
      writer.query("UPDATE public.anti_abuse_events SET state='IGNORED' WHERE id=$1",[countedId]),
      (error) => error.code === "42501",
    );
  } finally {
    await Promise.all([runtime,writer,mfa].map((client)=>client.end().catch(()=>undefined)));
    await admin.end();
  }
});
