import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import pg from "pg";
import { grantS04ProtectedWriterFunction } from "../scripts/s04-protected-writer-privileges.mjs";

export const scope = "v1:staff-activation-credential";
export const address = "v1:staff-activation-client-address";
export const secret = Buffer.alloc(32, 0x54);
export const keyFor = (character) =>
  "anti-abuse-hmac-sha256:v1:" + character.repeat(64);
export const invitationFor = (character) =>
  "staff-invite-sha256:v1:" + character.repeat(64);
const root = resolve(fileURLToPath(import.meta.url), "../../../../");
const initialMigration = readFileSync(
  resolve(
    root,
    "packages/database/prisma/migrations/20261115235910_option_c_s04_staff_activation_success/migration.sql",
  ),
  "utf8",
);
const signedMigration = readFileSync(
  resolve(
    root,
    "packages/database/prisma/migrations/20261116000100_option_c_s04_signed_staff_activation_success/migration.sql",
  ),
  "utf8",
);

export async function formatted(client, template, values) {
  const result = await client.query("SELECT format($1,$2::text) AS sql", [
    template,
    values[0],
  ]);
  await client.query(result.rows[0].sql);
}

export function proof(action, fields) {
  const nonce = randomUUID();
  const expires = Date.now() + 15000;
  const mac = createHmac("sha256", secret)
    .update(["s04-v1", action, ...fields, nonce, expires].join("|"))
    .digest("hex");
  return [nonce, expires, mac];
}

export async function transactionId(client) {
  const result = await client.query(
    "SELECT pg_catalog.pg_current_xact_id()::text AS xid",
  );
  assert.match(result.rows[0].xid, /^\d+$/);
  return result.rows[0].xid;
}

export function activationArgs(row, invitationHash, xid) {
  return [
    row.id,
    row.scope,
    row.key,
    invitationHash,
    xid,
    ...proof("STAFF_ACTIVATION", [
      row.id,
      row.scope,
      row.key,
      invitationHash,
      xid,
    ]),
  ];
}

export async function activationCall(client, row, invitationHash) {
  await client.query("BEGIN");
  try {
    const xid = await transactionId(client);
    const result = await client.query(
      "SELECT public.s04_staff_activation_success($1::uuid,$2,$3,$4,$5::xid8,$6::uuid,$7::bigint,$8) AS affected",
      activationArgs(row, invitationHash, xid),
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function denied(client, row, invitationHash, options = {}) {
  await client.query("BEGIN");
  try {
    const xid = await transactionId(client);
    const args = activationArgs(row, invitationHash, xid);
    if (options.badMac) args[7] = "0".repeat(64);
    if (options.wrongXidMac) {
      const wrongXid = (BigInt(xid) + 1n).toString();
      const wrongArgs = activationArgs(row, invitationHash, wrongXid);
      args[5] = wrongArgs[5];
      args[6] = wrongArgs[6];
      args[7] = wrongArgs[7];
    }
    if (options.mismatchedXidParameter) {
      args[4] = (BigInt(xid) + 1n).toString();
    }
    if (options.proofFor) {
      const otherProof = activationArgs(options.proofFor, invitationHash, xid);
      args[5] = otherProof[5];
      args[6] = otherProof[6];
      args[7] = otherProof[7];
    }
    await assert.rejects(
      client.query(
        "SELECT public.s04_staff_activation_success($1::uuid,$2,$3,$4,$5::xid8,$6::uuid,$7::bigint,$8)",
        args,
      ),
      (error) => error.code === "42501",
    );
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
  }
}

export async function deniedOldTransactionProof(client, args) {
  await client.query("BEGIN");
  try {
    await transactionId(client);
    await assert.rejects(
      client.query(
        "SELECT public.s04_staff_activation_success($1::uuid,$2,$3,$4,$5::xid8,$6::uuid,$7::bigint,$8)",
        args,
      ),
      (error) => error.code === "42501",
    );
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
  }
}

export async function pending(runtime, eventScope, key) {
  const nonce = randomUUID();
  const expires = Date.now() + 15000;
  const mac = createHmac("sha256", secret)
    .update(`s04-v1|PENDING|${eventScope}|${key}|${nonce}|${expires}`)
    .digest("hex");
  const result = await runtime.query(
    "SELECT public.s04_reserve($1,$2,$3::uuid,$4::bigint,$5) AS id",
    [eventScope, key, nonce, expires, mac],
  );
  return result.rows[0].id;
}

export async function createActivationFixture(url, systemId, fixturePort) {
  const target = new URL(url);
  assert.equal(target.hostname, "127.0.0.1");
  assert.match(fixturePort ?? "", /^\d{1,5}$/);
  assert.equal(target.port, fixturePort);
  assert.equal(target.pathname, "/s04_w67_disposable");
  assert.equal(target.username, "w67_owner");
  const admin = new pg.Client({ connectionString: url });
  const restrictedUrl = (user) => {
    const clone = new URL(url);
    clone.username = user;
    clone.password = "w67_test_only_password";
    return clone.toString();
  };
  const runtime = new pg.Client({
    connectionString: restrictedUrl("w67_s04_runtime"),
  });
  const writer = new pg.Client({
    connectionString: restrictedUrl("w67_s04_staff_writer"),
  });
  const mfa = new pg.Client({
    connectionString: restrictedUrl("w67_s04_mfa_writer"),
  });
  const clients = [admin, runtime, writer, mfa];
  await admin.connect();
  try {
    const identity = await admin.query(
      `SELECT current_database() AS db,current_user AS role,
         current_setting('server_version_num')::int AS version,
         system_identifier::text AS system FROM pg_control_system()`,
    );
    assert.deepEqual(
      [identity.rows[0].db, identity.rows[0].role, identity.rows[0].system],
      ["s04_w67_disposable", "w67_owner", systemId],
    );
    assert.ok(
      identity.rows[0].version >= 170000 && identity.rows[0].version < 180000,
    );
    assert.equal(
      (
        await admin.query(
          "SELECT count(*)::int AS count FROM s04_quota_guard.proof_key",
        )
      ).rows[0].count,
      1,
    );
    await admin.query(
      `CREATE TABLE public.users(id uuid PRIMARY KEY,status text NOT NULL)`,
    );
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
    await grantS04ProtectedWriterFunction(
      admin,
      formatted,
      "staffActivation",
      "w67_s04_staff_writer",
      "w67_s04_runtime",
    );
    // The bootstrap fixture installed this exact SET-only membership; the
    // migration owner must not inherit writer privileges or admin rights.
    const ownerMembership = await admin.query(
      `SELECT membership.inherit_option,membership.set_option,membership.admin_option
       FROM pg_catalog.pg_auth_members AS membership
       JOIN pg_catalog.pg_roles AS granted ON granted.oid=membership.roleid
       JOIN pg_catalog.pg_roles AS member ON member.oid=membership.member
       WHERE granted.rolname='w67_s04_staff_writer' AND member.rolname='w67_owner'`,
    );
    assert.deepEqual(ownerMembership.rows[0], {
      inherit_option: false,
      set_option: true,
      admin_option: false,
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
          'public.s04_staff_activation_success(uuid,text,text,text,xid8,uuid,bigint,text)','EXECUTE') AS mfa`,
    );
    assert.deepEqual(access.rows[0], {
      staff: true,
      runtime: false,
      mfa: false,
    });
    const oldSignature = await admin.query(
      "SELECT to_regprocedure('public.s04_staff_activation_success(uuid,text,text,text)') IS NULL AS absent",
    );
    assert.equal(oldSignature.rows[0].absent, true);
    return {
      admin,
      runtime,
      writer,
      mfa,
      close: async () => {
        await Promise.all(
          clients.map((client) => client.end().catch(() => undefined)),
        );
      },
    };
  } catch (error) {
    await Promise.all(
      clients.map((client) => client.end().catch(() => undefined)),
    );
    throw error;
  }
}
