import assert from "node:assert/strict";
import { test } from "node:test";

import { resetSchemaPrivileges } from "./mfa-protected-writer-role-provisioning.mjs";

function fixture(options = {}) {
  const statements = [];
  const writer = "vaylet_mfa_writer";
  const catalog = {
    async query(sql, args = []) {
      if (
        sql.includes("FROM pg_catalog.pg_namespace") &&
        sql.includes("AS owned")
      ) {
        return {
          rows: [
            { nspname: "public", owned: false },
            { nspname: "auth_proof_private", owned: false },
            { nspname: "s04_quota_guard", owned: true },
          ],
        };
      }
      if (sql.includes("has_schema_privilege")) {
        return {
          rowCount: 1,
          rows: [
            {
              usage:
                args[1] === "public"
                  ? true
                  : Boolean(options.foreignSchemaUsage),
              create: false,
            },
          ],
        };
      }
      if (sql.includes("FROM pg_catalog.pg_class relation")) {
        return {
          rows:
            args[1] === "public"
              ? [{ relname: "users", relkind: "r", owned: true }]
              : args[1] === "auth_proof_private"
                ? [
                    {
                      relname: "proof_keys",
                      relkind: "r",
                      owned: false,
                      table_allowed: Boolean(options.foreignTableGrant),
                      column_allowed: false,
                    },
                  ]
                : [{ relname: "used_nonce", relkind: "r", owned: true }],
        };
      }
      if (sql.includes("FROM pg_catalog.pg_proc routine")) {
        return {
          rows:
            args[1] === "public"
              ? [{ signature: "public.internal_writer()", owned: true }]
              : args[1] === "auth_proof_private"
                ? [
                    {
                      signature: "auth_proof_private.definer()",
                      owned: false,
                      security_definer: true,
                      executable: Boolean(options.foreignDefiner),
                      direct_grant: Boolean(options.foreignFunctionGrant),
                    },
                  ]
                : [
                    {
                      signature: "auth_proof_crypto.armor(bytea)",
                      owned: false,
                      security_definer: false,
                      executable: true,
                      direct_grant: false,
                    },
                  ],
        };
      }
      if (sql.includes("FROM information_schema.columns")) {
        return {
          rowCount: 2,
          rows: [{ column_name: "id" }, { column_name: "password_hash" }],
        };
      }
      throw new Error("Unexpected catalog SQL");
    },
  };
  const formatted = async (_client, sql, args) => {
    statements.push({ sql, args });
  };
  return { catalog, formatted, statements, writer };
}

test("PG17 foreign-owned schema does not trigger broad REVOKE and public remains USAGE-only", async () => {
  const f = fixture();
  await resetSchemaPrivileges(f.catalog, f.formatted, f.writer);
  assert(
    f.statements.some(
      (s) =>
        s.sql.includes("REVOKE ALL PRIVILEGES ON TABLE %I.%I") &&
        s.args[0] === "public" &&
        s.args[1] === "users",
    ),
  );
  assert(
    f.statements.some(
      (s) =>
        s.sql.includes("REVOKE ALL PRIVILEGES ON TABLE %I.%I") &&
        s.args[0] === "s04_quota_guard" &&
        s.args[1] === "used_nonce",
    ),
  );
  assert(
    f.statements.some(
      (s) =>
        s.sql.includes("REVOKE ALL PRIVILEGES ON FUNCTION %s") &&
        s.args[0] === "public.internal_writer()",
    ),
  );
  assert(
    !f.statements.some(
      (s) =>
        s.args?.includes("auth_proof_private") ||
        /ON ALL (TABLES|FUNCTIONS|SEQUENCES)/.test(s.sql),
    ),
  );
});

test("foreign private schemas, columns, table privileges and definers remain fail-closed", async () => {
  for (const variant of [
    { foreignSchemaUsage: true },
    { foreignTableGrant: true },
    { foreignDefiner: true },
    { foreignFunctionGrant: true },
  ]) {
    const f = fixture(variant);
    await assert.rejects(
      resetSchemaPrivileges(f.catalog, f.formatted, f.writer),
      /foreign-owned/,
    );
  }
});
