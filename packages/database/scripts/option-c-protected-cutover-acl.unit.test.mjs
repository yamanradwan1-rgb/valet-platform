import assert from "node:assert/strict";
import { test } from "node:test";

import {
  optionCFunctionContract,
  retireOptionCLegacyAcl,
} from "./option-c-protected-cutover-acl.mjs";
import { verifyOptionCRoleIsolation } from "./option-c-protected-cutover-roles.mjs";
import { optionCRoles } from "./option-c-protected-cutover-state.mjs";

const runtime = "ordinary_runtime";
const migrator = "cutover_migrator";
const databaseOwner = "cutover_owner";
const roles = [
  runtime,
  optionCRoles.staffAuthWriter,
  optionCRoles.mfaWriter,
  optionCRoles.managementWriter,
];

function safeRoleClient({
  unsafeMembership = false,
  grantOption = false,
} = {}) {
  const queries = [];
  return {
    queries,
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql.includes("rolcanlogin,rolinherit,rolsuper")) {
        return {
          rowCount: 1,
          rows: [
            {
              rolcanlogin: true,
              rolinherit: false,
              rolsuper: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false,
              rolbypassrls: false,
            },
          ],
        };
      }
      if (sql.includes("AS db_create")) {
        return {
          rowCount: 1,
          rows: [
            {
              db_create: false,
              db_temp: false,
              schema_create: false,
              private_schema_create: false,
              owns_object: false,
            },
          ],
        };
      }
      if (sql.includes("database_owner.rolname")) {
        return { rowCount: 1, rows: [{ database_owner: databaseOwner }] };
      }
      if (sql.includes("FROM pg_catalog.pg_auth_members membership")) {
        const rows = [
          optionCRoles.staffAuthWriter,
          optionCRoles.mfaWriter,
          optionCRoles.managementWriter,
        ].map((parent) => ({
          parent,
          member: migrator,
          grantor: databaseOwner,
          inherit_option: false,
          set_option: false,
          admin_option: true,
        }));
        if (unsafeMembership)
          rows.push({
            parent: optionCRoles.staffAuthWriter,
            member: runtime,
            grantor: migrator,
            inherit_option: false,
            set_option: true,
            admin_option: false,
          });
        return { rowCount: rows.length, rows };
      }
      if (sql.includes("pg_catalog.pg_has_role")) {
        return { rowCount: 1, rows: [{ can_set: false, can_inherit: false }] };
      }
      if (sql.includes("FROM pg_catalog.pg_default_acl defaults")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("SELECT 1 FROM (")) {
        return grantOption
          ? { rowCount: 1, rows: [{ "?column?": 1 }] }
          : { rowCount: 0, rows: [] };
      }
      throw new Error(`UNEXPECTED_SQL:${sql}`);
    },
  };
}

test("role isolation accepts only trusted PG17 creator ADMIN-only rows", async () => {
  const safe = safeRoleClient();
  assert.deepEqual(
    await verifyOptionCRoleIsolation(safe, runtime, migrator),
    roles,
  );
  assert.equal(
    safe.queries.filter(({ sql }) => sql.includes("pg_catalog.pg_has_role"))
      .length,
    7,
  );

  await assert.rejects(
    verifyOptionCRoleIsolation(
      safeRoleClient({ unsafeMembership: true }),
      runtime,
      migrator,
    ),
    /membership or SET authority remains/,
  );
  await assert.rejects(
    verifyOptionCRoleIsolation(
      safeRoleClient({ grantOption: true }),
      runtime,
      migrator,
    ),
    /retains a grant option/,
  );
});

function retirementClient({ rogueRole = null } = {}) {
  const direct = [];
  const formatted = [];
  const columns = {
    staff_auth_sessions: ["id", "revoked_at", "mfa_authenticated_at"],
    staff_refresh_credentials: ["id", "consumed_at"],
    user_mfa_totp_factors: ["id", "state"],
    mfa_recovery_codes: ["id", "consumed_at"],
    anti_abuse_events: ["id", "state", "group_key_hash"],
  };
  const client = {
    query: async (sql, values = []) => {
      direct.push({ sql, values });
      if (sql.includes("information_schema.columns")) {
        return {
          rowCount: columns[values[0]].length,
          rows: columns[values[0]].map((column_name) => ({ column_name })),
        };
      }
      if (sql.includes("SELECT DISTINCT grantee.rolname AS role_name")) {
        return {
          rowCount: rogueRole === null ? 0 : 1,
          rows: rogueRole === null ? [] : [{ role_name: rogueRole }],
        };
      }
      return { rowCount: 0, rows: [] };
    },
  };
  const executeFormatted = async (_client, format, values) => {
    formatted.push({ format, values });
  };
  return { client, direct, formatted, executeFormatted };
}

test("retirement is REVOKE-only, revokes runtime revoked_at, and closes protected EXECUTE", async () => {
  const fixture = retirementClient();
  await retireOptionCLegacyAcl(
    fixture.client,
    fixture.executeFormatted,
    runtime,
  );
  const allSql = [
    ...fixture.direct.map(({ sql }) => sql),
    ...fixture.formatted.map(({ format }) => format),
  ];
  assert.equal(
    allSql.some((sql) => /\bGRANT\b/.test(sql)),
    false,
  );
  assert.equal(
    fixture.formatted.some(
      ({ format, values }) =>
        format.startsWith("REVOKE UPDATE (%I)") &&
        values[0] === "revoked_at" &&
        values.at(-1) === runtime,
    ),
    true,
  );
  assert.equal(
    fixture.formatted.some(
      ({ format, values }) =>
        format.startsWith("REVOKE UPDATE (%I)") &&
        values[0] === "mfa_authenticated_at" &&
        values.at(-1) === runtime,
    ),
    true,
  );
  assert.equal(
    fixture.direct.some(
      ({ sql }) =>
        sql.includes(optionCFunctionContract.staffAuth[0]) &&
        sql.endsWith("FROM PUBLIC"),
    ),
    true,
  );
  for (const signature of optionCFunctionContract.retiredManagement) {
    assert.equal(
      fixture.direct.some(
        ({ sql }) => sql.includes(signature) && sql.endsWith("FROM PUBLIC"),
      ),
      true,
    );
    assert.equal(
      fixture.formatted.some(
        ({ format, values }) =>
          format.includes(signature) && values.includes(runtime),
      ),
      true,
    );
  }
});

test("cutover revokes unknown LOGIN role EXECUTE, not merely runtime or named writer grants", async () => {
  const fixture = retirementClient({ rogueRole: "unreviewed_sql_login" });
  await retireOptionCLegacyAcl(
    fixture.client,
    fixture.executeFormatted,
    runtime,
  );
  for (const signature of [
    ...optionCFunctionContract.retiredManagement,
    ...optionCFunctionContract.management,
    ...optionCFunctionContract.staffAuth,
    ...optionCFunctionContract.mfa,
    optionCFunctionContract.mfaActivity,
  ]) {
    assert.equal(
      fixture.formatted.some(
        ({ format, values }) =>
          format === `REVOKE ALL ON FUNCTION ${signature} FROM %I` &&
          values[0] === "unreviewed_sql_login",
      ),
      true,
    );
  }
});
