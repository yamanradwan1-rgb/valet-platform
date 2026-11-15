import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import pg from "pg";
import {
  provisionS04RuntimePrivileges,
  verifyS04RuntimePrivileges,
} from "../scripts/s04-runtime-privileges.mjs";
import { grantS04ProtectedWriterFunction } from "../scripts/s04-protected-writer-privileges.mjs";
import { provisionS04ProofKey } from "../scripts/provision-s04-proof-key.mjs";

const fixtureUrl = process.env.S04_W58_PG17_FIXTURE_URL;
const identifier = process.env.S04_W58_PG17_SYSTEM_ID;
const repo = resolve(fileURLToPath(import.meta.url), "../../../../");
const migration = readFileSync(
  resolve(repo, "packages/database/prisma/migrations/20261115016200_issue416_s04_signed_quota_guard/migration.sql"),
  "utf8",
);
const scope = "v1:guest-token";
const keyFor = (c) => "anti-abuse-hmac-sha256:v1:" + c.repeat(64);
const secret = Buffer.alloc(32, 0x54);
const expires = () => Date.now() + 15000;
const sign = (action, fields) => {
  const nonce = randomUUID();
  const deadline = expires();
  const message = ["s04-v1", action, ...fields, nonce, deadline].join("|");
  return [nonce, deadline, createHmac("sha256", secret).update(message).digest("hex")];
};

function restrictedConfig(role) {
  const url = new URL(fixtureUrl);
  url.username = role;
  url.password = "w58_test_only_password";
  return { connectionString: url.toString() };
}

async function formatted(client, format, values) {
  const template = await client.query("SELECT format($1,$2::text) AS statement", [format, values[0]]);
  await client.query(template.rows[0].statement);
}

async function expectDenied(client, sql, values = []) {
  await assert.rejects(
    client.query(sql, values),
    (error) => error.code === "42501" || error.code === "23505",
  );
}

test("S04 independent PG17 fixture denies raw runtime SQL and accepts bounded proofs", {
  skip: !fixtureUrl || !identifier ? "explicit unique disposable PG17 fixture required" : false,
}, async () => {
  const url = new URL(fixtureUrl);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/s04_w58_disposable");
  const admin = new pg.Client({ connectionString: fixtureUrl });
  await admin.connect();
  const clients = [];
  try {
    const attested = await admin.query(
      `SELECT current_database() AS db,current_user AS login,
        current_setting('server_version_num')::integer AS version,
        system_identifier::text AS identifier FROM pg_control_system()`,
    );
    assert.deepEqual(
      [attested.rows[0].db, attested.rows[0].login, attested.rows[0].version,
        attested.rows[0].identifier],
      ["s04_w58_disposable", "w58_owner", 170011, identifier],
    );
    await admin.query("CREATE SCHEMA auth_proof_crypto");
    await admin.query("CREATE EXTENSION pgcrypto WITH SCHEMA auth_proof_crypto");
    await admin.query(`CREATE TABLE public.anti_abuse_events(
      id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      scope text NOT NULL,
      key_hash text NOT NULL,
      occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      state text NOT NULL CHECK(state IN('PENDING','COUNTED','IGNORED')),
      request_class text,
      group_key_hash text
    )`);
    await admin.query(`CREATE FUNCTION public.cleanup_expired_anti_abuse_events()
      RETURNS integer LANGUAGE sql VOLATILE SECURITY DEFINER
      SET search_path = pg_catalog, public
      SET lock_timeout = '200ms'
      SET statement_timeout = '500ms' AS 'SELECT 0'`);
    await admin.query(
      "REVOKE ALL ON FUNCTION public.cleanup_expired_anti_abuse_events() FROM PUBLIC",
    );
    await admin.query(migration);
    const runtimeUrl = new URL(fixtureUrl);
    runtimeUrl.username = "w58_s04_runtime";
    runtimeUrl.password = "w58_test_only_password";
    const provisionEnvironment = {
      NODE_ENV: "test",
      MIGRATION_DATABASE_URL: fixtureUrl,
      DATABASE_URL: runtimeUrl.toString(),
      ANTI_ABUSE_SQL_PROOF_SECRET_B64URL: secret.toString("base64url"),
      ANTI_ABUSE_HMAC_SECRET_B64URL: Buffer.alloc(32, 0x55).toString("base64url"),
    };
    await provisionS04ProofKey(provisionEnvironment);
    await provisionS04ProofKey(provisionEnvironment);
    await assert.rejects(
      provisionS04ProofKey({
        ...provisionEnvironment,
        ANTI_ABUSE_SQL_PROOF_SECRET_B64URL:
          Buffer.alloc(32, 0x56).toString("base64url"),
      }),
      /rotation requires a separately reviewed rollout/,
    );
    await admin.query(`CREATE ROLE w58_s04_runtime LOGIN PASSWORD 'w58_test_only_password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await admin.query(`CREATE ROLE w58_s04_staff_writer LOGIN PASSWORD 'w58_test_only_password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await admin.query(`CREATE ROLE w58_s04_mfa_writer LOGIN PASSWORD 'w58_test_only_password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await admin.query("GRANT CONNECT ON DATABASE s04_w58_disposable TO w58_s04_runtime,w58_s04_staff_writer,w58_s04_mfa_writer");
    await admin.query("GRANT USAGE ON SCHEMA public TO w58_s04_runtime,w58_s04_staff_writer,w58_s04_mfa_writer");
    await provisionS04RuntimePrivileges(admin, formatted, "w58_s04_runtime");
    await provisionS04RuntimePrivileges(admin, formatted, "w58_s04_runtime");
    await verifyS04RuntimePrivileges(admin, "w58_s04_runtime");
    await grantS04ProtectedWriterFunction(
      admin, formatted, "staffAuth", "w58_s04_staff_writer", "w58_s04_runtime",
    );
    await grantS04ProtectedWriterFunction(
      admin, formatted, "mfa", "w58_s04_mfa_writer", "w58_s04_runtime",
    );
    const runtime = new pg.Client(restrictedConfig("w58_s04_runtime"));
    const staff = new pg.Client(restrictedConfig("w58_s04_staff_writer"));
    const mfa = new pg.Client(restrictedConfig("w58_s04_mfa_writer"));
    clients.push(runtime, staff, mfa);
    for (const client of clients) await client.connect();
    const role = await runtime.query(`SELECT current_user,session_user,
      rolcanlogin,rolsuper,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user`);
    assert.equal(role.rows[0].current_user, "w58_s04_runtime");
    assert.equal(role.rows[0].session_user, "w58_s04_runtime");
    assert.equal(role.rows[0].rolsuper, false);
    assert.equal(role.rows[0].rolcreaterole, false);
    assert.equal(role.rows[0].rolbypassrls, false);

    await expectDenied(runtime,
      "INSERT INTO public.anti_abuse_events(scope,key_hash,state) VALUES($1,$2,'COUNTED')",
      [scope, keyFor("a")],
    );
    await expectDenied(runtime,
      "UPDATE public.anti_abuse_events SET state='IGNORED' WHERE scope=$1",
      [scope],
    );
    await expectDenied(runtime,
      "UPDATE public.anti_abuse_events SET group_key_hash=$1 WHERE scope=$2",
      [keyFor("c"), scope],
    );
    await expectDenied(runtime,
      "SELECT * FROM s04_quota_guard.proof_key",
    );
    await expectDenied(runtime,
      "SELECT public.s04_staff_login_success($1::uuid,$2)",
      [randomUUID(), keyFor("a")],
    );
    const unsigned = [randomUUID(), expires(), "0".repeat(64)];
    await expectDenied(runtime,
      "SELECT public.s04_counted($1,$2,$3::uuid,$4::bigint,$5)",
      [scope, keyFor("a"), ...unsigned],
    );
    const counted = sign("COUNTED", [scope, keyFor("a")]);
    await runtime.query(
      "SELECT public.s04_counted($1,$2,$3::uuid,$4::bigint,$5)",
      [scope, keyFor("a"), ...counted],
    );
    await expectDenied(runtime,
      "SELECT public.s04_counted($1,$2,$3::uuid,$4::bigint,$5)",
      [scope, keyFor("a"), ...counted],
    );
    const countRow = await runtime.query(
      "SELECT count(*)::integer AS count FROM public.anti_abuse_events WHERE key_hash=$1",
      [keyFor("a")],
    );
    assert.equal(countRow.rows[0].count, 1);
    const pendingKey = keyFor("b");
    const pending = sign("PENDING", ["v1:mfa-totp-user", pendingKey]);
    const reserved = await runtime.query(
      "SELECT public.s04_reserve($1,$2,$3::uuid,$4::bigint,$5) AS id",
      ["v1:mfa-totp-user", pendingKey, ...pending],
    );
    const reservationId = reserved.rows[0].id;
    const illegitimate = sign("FINALIZE",
      [reservationId,"v1:mfa-totp-user",pendingKey,"IGNORED"]);
    await expectDenied(runtime,
      "SELECT public.s04_finalize($1::uuid,$2,$3,$4,$5::uuid,$6::bigint,$7)",
      [reservationId,"v1:mfa-totp-user",keyFor("f"),"IGNORED",...illegitimate],
    );
    const mfaSettled = await mfa.query(
      "SELECT public.s04_mfa_success($1::uuid,$2,$3) AS updated",
      [reservationId, "v1:mfa-totp-user", pendingKey],
    );
    assert.equal(mfaSettled.rows[0].updated, 1);
    const settled = await runtime.query(
      "SELECT state FROM public.anti_abuse_events WHERE id=$1",
      [reservationId],
    );
    assert.equal(settled.rows[0].state, "IGNORED");

    const gKey = keyFor("d");
    const gGroup = keyFor("e");
    await admin.query(
      `INSERT INTO public.anti_abuse_events(scope,key_hash,state,request_class,group_key_hash)
       VALUES('v1:guest-token',$1,'COUNTED',NULL,NULL)`,
      [gKey],
    );
    const classValues = [gKey,gGroup,"C",2,3,3,123,456,789,111];
    const first = await runtime.query(
      `SELECT id,retry_after FROM public.s04_guest_classified(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid,$12::bigint,$13)`,
      [...classValues, ...sign("GUEST", classValues)],
    );
    assert.ok(first.rows[0].id);
    assert.equal(first.rows[0].retry_after, 0);
    const rebound = await runtime.query(
      `SELECT count(*)::integer AS count FROM public.anti_abuse_events
        WHERE key_hash=$1 AND group_key_hash=$2 AND request_class IS NULL`,
      [gKey,gGroup],
    );
    assert.equal(rebound.rows[0].count,1);
    const second = await runtime.query(
      `SELECT id,retry_after FROM public.s04_guest_classified(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid,$12::bigint,$13)`,
      [...classValues, ...sign("GUEST", classValues)],
    );
    assert.equal(second.rows[0].id, null);
    assert.ok(second.rows[0].retry_after >= 1);
    const changed = [...classValues];
    changed[1] = keyFor("f");
    await expectDenied(runtime,
      `SELECT id,retry_after FROM public.s04_guest_classified(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid,$12::bigint,$13)`,
      [...changed, ...sign("GUEST", classValues)],
    );
    const staffKey = keyFor("9");
    const staffPending = sign("PENDING", ["v1:staff-login-identifier",staffKey]);
    const staffId = await runtime.query(
      "SELECT public.s04_reserve($1,$2,$3::uuid,$4::bigint,$5) AS id",
      ["v1:staff-login-identifier",staffKey,...staffPending],
    );
    const staffResult = await staff.query(
      "SELECT public.s04_staff_login_success($1::uuid,$2) AS updated",
      [staffId.rows[0].id,staffKey],
    );
    assert.equal(staffResult.rows[0].updated, 1);
  } finally {
    for (const client of clients) await client.end().catch(() => undefined);
    await admin.end();
  }
});
