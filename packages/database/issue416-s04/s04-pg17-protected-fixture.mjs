import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import pg from "pg";
import {
  provisionS04RuntimePrivileges,
  verifyS04RuntimePrivileges,
} from "../scripts/s04-runtime-privileges.mjs";
import { grantS04ProtectedWriterFunction } from "../scripts/s04-protected-writer-privileges.mjs";
import { provisionS04ProofKey } from "../scripts/provision-s04-proof-key.mjs";

const fixtureUrl = process.env.S04_W67_PG17_FIXTURE_URL;
const superuserUrl = process.env.S04_W67_PG17_SUPERUSER_URL;
const identifier = process.env.S04_W67_PG17_SYSTEM_ID;
const repo = resolve(fileURLToPath(import.meta.url), "../../../../");
const migration = readFileSync(
  resolve(
    repo,
    "packages/database/prisma/migrations/20261115016200_issue416_s04_signed_quota_guard/migration.sql",
  ),
  "utf8",
);

export const s04FixtureAvailable = Boolean(
  fixtureUrl && superuserUrl && identifier,
);
export const scope = "v1:guest-token";
const secret = Buffer.alloc(32, 0x54);

export const keyFor = (character) =>
  "anti-abuse-hmac-sha256:v1:" + character.repeat(64);

export const sign = (action, fields) => {
  const nonce = randomUUID();
  const deadline = Date.now() + 15000;
  const message = ["s04-v1", action, ...fields, nonce, deadline].join("|");
  return [
    nonce,
    deadline,
    createHmac("sha256", secret).update(message).digest("hex"),
  ];
};

function restrictedConfig(role) {
  const url = new URL(fixtureUrl);
  url.username = role;
  url.password = "w67_test_only_password";
  return { connectionString: url.toString() };
}

async function formatted(client, format, values) {
  const template = await client.query(
    "SELECT format($1,$2::text) AS statement",
    [format, values[0]],
  );
  await client.query(template.rows[0].statement);
}

export async function expectDenied(client, sql, values = []) {
  await assert.rejects(
    client.query(sql, values),
    (error) => error.code === "42501" || error.code === "23505",
  );
}

export async function createS04Fixture() {
  const url = new URL(fixtureUrl);
  const bootstrapUrl = new URL(superuserUrl);
  for (const target of [url, bootstrapUrl]) {
    assert.equal(target.protocol, "postgresql:");
    assert.equal(target.hostname, "127.0.0.1");
    assert.equal(target.port, "51667");
    assert.equal(target.pathname, "/s04_w67_disposable");
    assert.equal(target.search, "");
    assert.equal(target.hash, "");
  }
  assert.equal(url.username, "w67_owner");
  assert.equal(bootstrapUrl.username, "postgres");

  const admin = new pg.Client({ connectionString: fixtureUrl });
  const clients = [];
  await admin.connect();
  try {
    const attested = await admin.query(
      `SELECT current_database() AS db,current_user AS login,
        current_setting('server_version_num')::integer AS version,
        system_identifier::text AS identifier,role.rolsuper,
        role.rolcreatedb,role.rolcreaterole
       FROM pg_control_system() CROSS JOIN pg_roles role
       WHERE role.rolname=current_user`,
    );
    assert.deepEqual(
      [
        attested.rows[0].db,
        attested.rows[0].login,
        attested.rows[0].identifier,
        attested.rows[0].rolsuper,
        attested.rows[0].rolcreatedb,
        attested.rows[0].rolcreaterole,
      ],
      ["s04_w67_disposable", "w67_owner", identifier, false, true, true],
    );
    assert.ok(
      attested.rows[0].version >= 170000 && attested.rows[0].version < 180000,
    );
    await admin.query("CREATE SCHEMA auth_proof_crypto");
    await admin.query(
      "CREATE EXTENSION pgcrypto WITH SCHEMA auth_proof_crypto",
    );
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
    runtimeUrl.username = "w67_s04_runtime";
    runtimeUrl.password = "w67_test_only_password";
    const provisionEnvironment = {
      NODE_ENV: "test",
      MIGRATION_DATABASE_URL: fixtureUrl,
      DATABASE_URL: runtimeUrl.toString(),
      ANTI_ABUSE_SQL_PROOF_SECRET_B64URL: secret.toString("base64url"),
      ANTI_ABUSE_HMAC_SECRET_B64URL: Buffer.alloc(32, 0x55).toString(
        "base64url",
      ),
    };
    await provisionS04ProofKey(provisionEnvironment);
    await provisionS04ProofKey(provisionEnvironment);
    await assert.rejects(
      provisionS04ProofKey({
        ...provisionEnvironment,
        ANTI_ABUSE_SQL_PROOF_SECRET_B64URL: Buffer.alloc(32, 0x56).toString(
          "base64url",
        ),
      }),
      /rotation requires a separately reviewed rollout/,
    );
    await admin.query(`CREATE ROLE w67_s04_runtime LOGIN PASSWORD 'w67_test_only_password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await admin.query(`CREATE ROLE w67_s04_staff_writer LOGIN PASSWORD 'w67_test_only_password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await admin.query(`CREATE ROLE w67_s04_mfa_writer LOGIN PASSWORD 'w67_test_only_password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await admin.query(
      "GRANT CONNECT ON DATABASE s04_w67_disposable TO w67_s04_runtime,w67_s04_staff_writer,w67_s04_mfa_writer",
    );
    await admin.query(
      "GRANT USAGE ON SCHEMA public TO w67_s04_runtime,w67_s04_staff_writer,w67_s04_mfa_writer",
    );
    await provisionS04RuntimePrivileges(admin, formatted, "w67_s04_runtime");
    await provisionS04RuntimePrivileges(admin, formatted, "w67_s04_runtime");
    await verifyS04RuntimePrivileges(admin, "w67_s04_runtime");
    await grantS04ProtectedWriterFunction(
      admin,
      formatted,
      "staffAuth",
      "w67_s04_staff_writer",
      "w67_s04_runtime",
    );
    await grantS04ProtectedWriterFunction(
      admin,
      formatted,
      "mfa",
      "w67_s04_mfa_writer",
      "w67_s04_runtime",
    );

    const bootstrap = new pg.Client({ connectionString: superuserUrl });
    await bootstrap.connect();
    try {
      const bootstrapIdentity = await bootstrap.query(
        `SELECT current_user AS principal,current_database() AS database,
                role.rolsuper AS superuser,system_identifier::text
         FROM pg_control_system() CROSS JOIN pg_roles AS role
         WHERE role.rolname=current_user`,
      );
      assert.deepEqual(bootstrapIdentity.rows[0], {
        principal: "postgres",
        database: "s04_w67_disposable",
        superuser: true,
        system_identifier: identifier,
      });
      await bootstrap.query("REVOKE w67_s04_staff_writer FROM w67_owner");
      await bootstrap.query(
        "GRANT w67_s04_staff_writer TO w67_owner WITH ADMIN FALSE, INHERIT FALSE, SET TRUE",
      );
    } finally {
      await bootstrap.end();
    }

    const runtime = new pg.Client(restrictedConfig("w67_s04_runtime"));
    const staff = new pg.Client(restrictedConfig("w67_s04_staff_writer"));
    const mfa = new pg.Client(restrictedConfig("w67_s04_mfa_writer"));
    clients.push(runtime, staff, mfa);
    for (const client of clients) await client.connect();
    const role = await runtime.query(`SELECT current_user,session_user,
      rolcanlogin,rolsuper,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user`);
    assert.equal(role.rows[0].current_user, "w67_s04_runtime");
    assert.equal(role.rows[0].session_user, "w67_s04_runtime");
    assert.equal(role.rows[0].rolsuper, false);
    assert.equal(role.rows[0].rolcreaterole, false);
    assert.equal(role.rows[0].rolbypassrls, false);
    return {
      admin,
      runtime,
      staff,
      mfa,
      close: async () => {
        for (const client of clients) await client.end().catch(() => undefined);
        await admin.end();
      },
    };
  } catch (error) {
    for (const client of clients) await client.end().catch(() => undefined);
    await admin.end().catch(() => undefined);
    throw error;
  }
}
