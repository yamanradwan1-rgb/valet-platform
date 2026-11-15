import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  managementWriterFunctions,
  privateStaffManagementFunctions,
  provisionStaffManagementPrivileges,
  runtimeStaffManagementFunctions,
} from "./staff-management-runtime-privileges.mjs";
import {
  protectedStaffOnboardingFunctions,
  provisionStaffOnboardingPrivileges,
} from "./staff-onboarding-runtime-privileges.mjs";
import {
  provisionManagementWriterPrivileges,
  requireManagementWriterIdentity,
  verifyManagementWriterPrivileges,
} from "./management-writer-privileges.mjs";
import {
  parseMigrationDatabaseUrl,
  parseRuntimeDatabaseUrlForProvisioning,
} from "./database-connection-policy.mjs";

const migration = parseMigrationDatabaseUrl(
  "postgresql://migrator:private-migration-secret@127.0.0.1:5432/isolated_fixture",
  "test",
);
const runtime = parseRuntimeDatabaseUrlForProvisioning(
  "postgresql://ordinary:private-ordinary-secret@127.0.0.1:5432/isolated_fixture",
);
const writerUrl =
  "postgresql://vaylet_management_writer:private-management-secret@127.0.0.1:5432/isolated_fixture";
const writer = requireManagementWriterIdentity(writerUrl, migration, runtime);
const fixture = {
  query: async (sql) => {
    if (sql === "REVOKE ALL ON FUNCTION public.staff_onboarding_activate(text,text,text) FROM PUBLIC") {
      return { rowCount: 0, rows: [] };
    }
    if (sql.includes("FROM pg_roles WHERE rolname")) return { rowCount: 0, rows: [] };
    if (sql.includes("FROM pg_auth_members")) return { rowCount: 0, rows: [] };
    if (sql.includes("pg_catalog.pg_attribute")) {
      return {
        rowCount: 3,
        rows: [
          { column_sql: '"id"' },
          { column_sql: '"user_id"' },
          { column_sql: '"updated_at"' },
        ],
      };
    }
    throw new Error("Unexpected fake catalog query");
  },
};
const source = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

test("writer login requires distinct role, password, server, and database", () => {
  assert.equal(writer.role, "vaylet_management_writer");
  for (const invalid of [
    undefined,
    "postgresql://ordinary:another-password@127.0.0.1:5432/isolated_fixture",
    "postgresql://vaylet_management_writer:private-ordinary-secret@127.0.0.1:5432/isolated_fixture",
    "postgresql://vaylet_management_writer:private-migration-secret@127.0.0.1:5432/isolated_fixture",
    "postgresql://vaylet_management_writer:private-management-secret@127.0.0.1:5432/another",
    "postgresql://vaylet_management_writer:private-management-secret@localhost:5432/isolated_fixture",
    "postgresql://another_writer:private-management-secret@127.0.0.1:5432/isolated_fixture",
  ]) {
    assert.throws(() => requireManagementWriterIdentity(invalid, migration, runtime));
  }
});

test("repeated normal grants never restore SQL actor-ID management authority", async () => {
  const statements = [];
  const format = async (_client, sql, args) => statements.push([sql, args]);
  for (let iteration = 0; iteration < 2; iteration++) {
    await provisionStaffOnboardingPrivileges(fixture, format, "ordinary");
  }
  for (const oldFunction of [
    ...runtimeStaffManagementFunctions,
    ...protectedStaffOnboardingFunctions,
  ]) {
    const affected = statements.filter(([, args]) => args.includes(oldFunction));
    assert.equal(affected.length, 2);
    assert(affected.every(([sql]) => sql.startsWith("REVOKE ALL ON FUNCTION")));
  }
  assert(!statements.some(([sql, args]) =>
    sql.startsWith("GRANT EXECUTE") &&
    args.some((arg) => runtimeStaffManagementFunctions.includes(arg) ||
      protectedStaffOnboardingFunctions.includes(arg))));
  await provisionStaffManagementPrivileges(fixture, format, "ordinary");
});

test("writer provisioning grants exactly dedicated functions and read-only MFA facts", async () => {
  const statements = [];
  const format = async (_client, sql, args) => statements.push([sql, args]);
  await provisionManagementWriterPrivileges(fixture, format, writer, "ordinary");
  const executions = statements.filter(([sql]) => sql.startsWith("GRANT EXECUTE"));
  assert.deepEqual(
    executions.map(([, args]) => args[0]).sort(),
    [...managementWriterFunctions].sort(),
  );
  assert(executions.every(([, args]) => args[1] === "vaylet_management_writer"));
  const sensitive = statements.filter(([, args]) =>
    args.includes("user_mfa_totp_factors") || args.includes("staff_auth_sessions"));
  assert(!sensitive.some(([sql]) => sql.startsWith("GRANT SELECT ON TABLE")));
  assert(sensitive.some(([sql, args]) =>
    sql.startsWith("GRANT UPDATE") && args.includes("last_admin_activity_at")));
  assert(statements.some(([sql]) =>
    sql.includes("NOINHERIT NOREPLICATION NOBYPASSRLS")));
});

test("verifier rejects omitted protected function EXECUTE permissions", async () => {
  const badClient = {
    query: async (sql) => {
      if (sql.includes("p.oid::regprocedure::text")) {
        return {
          rows: managementWriterFunctions.map((signature) => ({ signature })),
        };
      }
      assert(sql.includes("has_function_privilege"));
      return { rows: [{
        writer_allowed: false,
        runtime_allowed: false,
        definer: true,
        safe_path: true,
        acl_safe: true,
      }] };
    },
  };
  await assert.rejects(
    verifyManagementWriterPrivileges(badClient, "vaylet_management_writer", "ordinary"),
    /ACL check failed/,
  );
});

test("protected wrappers recheck current session/MFA and touch only admin activity", () => {
  const sql = source("../prisma/migrations/20261115190000_option_c_management_writer/migration.sql");
  assert.match(sql, /current_access_token_hash = 'staff-access-sha256:v1:'/);
  assert.match(sql, /pg_catalog\.sha256\(pg_catalog\.convert_to\(p_access_token, 'UTF8'\)\)/);
  assert.doesNotMatch(sql, /current_access_token_hash = p_access_token/);
  assert.match(sql, /factor.state = 'ACTIVE'/);
  assert.match(sql, /session.mfa_authenticated_at \+ INTERVAL '5 minutes'/);
  assert.match(sql, /session.last_admin_activity_at \+ INTERVAL '30 minutes'/);
  assert.match(sql, /membership.user_id = p_user_id/);
  assert.match(sql, /subscription.dashboard_access_enabled = TRUE/);
  assert.match(sql, /FOR UPDATE OF session, actor FOR SHARE OF factor/);
  assert.match(sql, /SET last_admin_activity_at = clock_timestamp\(\)/);
  assert.doesNotMatch(sql, /SET mfa_authenticated_at =/);
  assert.doesNotMatch(sql, /SET mfa_factor_id =/);
  for (const wrapped of managementWriterFunctions) {
    const short = wrapped.split("(")[0].split(".")[1];
    assert(sql.includes("CREATE FUNCTION public." + short + "("));
  }
  for (const hidden of privateStaffManagementFunctions) {
    if (!hidden.includes("writer") && !hidden.includes("activity")) continue;
    assert(sql.includes("REVOKE ALL ON FUNCTION " + hidden.replace(
      /^public\./, "public.",
    )));
  }
});
