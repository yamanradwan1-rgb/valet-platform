import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

import { runPg17ReadOnlyPreflight } from "./pg17-acceptance-runtime.mjs";
import { assertAcceptanceEnvironment } from "./pg17-acceptance-target.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));

if (process.env.ISSUE416_W38_ACCEPTANCE_PG_PASSWORD === undefined) {
  throw new Error("W38_PG17_EXPLICIT_LOCAL_FIXTURE_AUTH_REQUIRED");
}

test("PG17 actual runtime and test role SQL cannot read or write private tables", async () => {
  const t = assertAcceptanceEnvironment();
  await runPg17ReadOnlyPreflight();
  const clients = [t.runtime, t.login].map((user) => new (require("pg").Client)({
    host: t.host, port: t.port, database: t.database,
    user, password: t.password, ssl: false, connectionTimeoutMillis: 3000,
    query_timeout: 4000, application_name: "issue416_w38_actual_acl_negative",
  }));
  try {
    for (const client of clients) await client.connect();
    const pids = [];
    for (const client of clients) {
      const result = await client.query(`SELECT pg_backend_pid() AS pid,
        current_database() AS db, session_user AS login, current_user AS actor,
        shobj_description(d.oid,'pg_database') AS marker
        FROM pg_database d WHERE d.datname=current_database()`);
      const row = result.rows[0];
      assert.equal(row.db, t.database);
      assert.equal(row.marker, t.marker);
      assert.equal(row.login, row.actor);
      assert.ok([t.login, t.runtime].includes(row.login));
      pids.push(row.pid);
    }
    assert.notEqual(pids[0], pids[1]);
    const tables = (await clients[0].query(`SELECT c.relname AS name,
      (SELECT a.attname FROM pg_attribute a WHERE a.attrelid=c.oid
        AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated=''
        ORDER BY a.attnum LIMIT 1) AS mutable_column
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='auth_proof_private' AND c.relkind IN ('r','p')
      ORDER BY c.relname`)).rows;
    const names = new Set(tables.map((row) => row.name));
    for (const mandatory of ["authority_admissions", "proof_keys", "operation_receipts",
      "reset_issue_quota_bundles", "reset_issue_quota_entries",
      "reset_redeem_client_attempts", "reset_redeem_credential_attempts"]) {
      assert.ok(names.has(mandatory), `Missing private table: ${mandatory}`);
    }
    for (const client of clients) {
      for (const { name, mutable_column } of tables) {
        const safeTable = `auth_proof_private."${name.replaceAll('"', '""')}"`;
        const safeColumn = `"${mutable_column.replaceAll('"', '""')}"`;
        for (const sql of [
          `SELECT 1 FROM ${safeTable} LIMIT 0`,
          `INSERT INTO ${safeTable} DEFAULT VALUES`,
          `UPDATE ${safeTable} SET ${safeColumn}=${safeColumn} WHERE FALSE`,
          `DELETE FROM ${safeTable} WHERE FALSE`,
          `TRUNCATE ${safeTable}`,
        ]) {
          const result = await client.query("BEGIN").then(() => client.query(sql))
            .then(() => ({ ok: true }), (error) => ({ code: error.code }));
          await client.query("ROLLBACK");
          assert.equal(result.code, "42501", `${name}: direct SQL access must deny`);
        }
      }
    }
    const functions = await clients[0].query(`SELECT p.oid AS oid,
      has_function_privilege($1::name,p.oid,'EXECUTE') AS can_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='auth_proof_private'`, [t.runtime]);
    assert.ok(functions.rows.length >= 10);
    assert.ok(functions.rows.every((row) => row.can_execute === false));
  } finally {
    await Promise.allSettled(clients.map((client) => client.end()));
  }
});
