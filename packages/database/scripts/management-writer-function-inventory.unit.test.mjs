import assert from "node:assert/strict";
import { test } from "node:test";

import { managementWriterFunctions } from "./staff-management-runtime-privileges.mjs";
import {
  managementWriterSecurityDefinerAllowlist,
  verifyManagementWriterFunctionInventory,
} from "./management-writer-function-inventory.mjs";

const role = "vaylet_management_writer";
const migrationOwner = "migration_owner";
const direct = (signature, overrides = {}) => ({
  schema_name: "public",
  signature: signature
    .replace(/^public\./, "")
    .replaceAll("public.membership_role", "membership_role")
    .replaceAll("public.membership_status", "membership_status"),
  expected_signature: signature,
  expected_owner: migrationOwner,
  via_role: role,
  via_set: false,
  via_inherit: false,
  direct_execute: true,
  public_execute: false,
  direct_grant_option: false,
  public_grant_option: false,
  prosecdef: true,
  proconfig: ["search_path=pg_catalog, public"],
  owner_inherit: false,
  owner_superuser: false,
  // The migration principal is deliberately a higher-trust provisioning
  // identity on PostgreSQL 17. The verifier must not mistake its DDL
  // administration attributes for authority reachable by the writer.
  owner_create_db: true,
  owner_create_role: true,
  owner_replication: false,
  owner_bypass_rls: false,
  owner_database_create: true,
  owner_public_create: true,
  owner_is_writer: false,
  owner_name: migrationOwner,
  owner_can_login: true,
  ...overrides,
});

function client(rows) {
  const queries = [];
  return {
    queries,
    async query(sql, args) {
      assert.deepEqual(args, [
        role,
        managementWriterSecurityDefinerAllowlist,
        migrationOwner,
      ]);
      queries.push(sql);
      return { rowCount: rows.length, rows };
    },
  };
}

test("Management Writer SECDEF allowlist is independently pinned to five entrypoints", () => {
  assert.equal(managementWriterSecurityDefinerAllowlist.length, 5);
  assert.deepEqual(
    [...managementWriterSecurityDefinerAllowlist]
      .map((signature) =>
        signature.replaceAll("public.membership_", "membership_"),
      )
      .sort(),
    [...managementWriterFunctions].sort(),
  );
});

test("catalog inventory spans reachable user schemas and SET/inherited routes", async () => {
  const good = client(managementWriterSecurityDefinerAllowlist.map(direct));
  await verifyManagementWriterFunctionInventory(good, role, migrationOwner);
  assert.equal(good.queries.length, 1);
  const sql = good.queries[0];
  assert.match(sql, /pg_catalog\.pg_namespace/);
  assert.match(sql, /function\.prosecdef/);
  assert.match(sql, /has_schema_privilege/);
  assert.match(sql, /has_function_privilege/);
  assert.match(sql, /to_regprocedure\(allowed\.signature\)/);
  assert.match(sql, /unnest\(\$2::text\[\]\)/);
  assert.match(sql, /pg_catalog\.pg_has_role\(\$1,candidate\.oid,'SET'\)/);
  assert.match(sql, /pg_catalog\.pg_has_role\(\$1,candidate\.oid,'USAGE'\)/);
  assert.match(
    sql,
    /namespace\.nspname NOT IN \('pg_catalog','information_schema'\)/,
  );
  assert.match(sql, /namespace\.nspname NOT LIKE 'pg_toast%'/);
  assert.match(sql, /namespace\.nspname NOT LIKE 'pg_temp_%'/);
  assert.doesNotMatch(sql, /namespace\.nspname='public'/);
});

test("unexpected stale physical-resource SECDEF EXECUTE is rejected", async () => {
  const rows = [
    ...managementWriterSecurityDefinerAllowlist.map(direct),
    direct(
      "public.management_physical_resource_create_key_slot(uuid,uuid,uuid,uuid,text,text)",
      { expected_signature: null },
    ),
  ];
  await assert.rejects(
    verifyManagementWriterFunctionInventory(client(rows), role, migrationOwner),
    /unexpected SECURITY DEFINER function: public\.management_physical_resource_create_key_slot/,
  );
});

test("PUBLIC or inherited/SET function authority cannot satisfy the allowlist", async () => {
  const publicGrant = managementWriterSecurityDefinerAllowlist.map(direct);
  publicGrant[0] = { ...publicGrant[0], public_execute: true };
  await assert.rejects(
    verifyManagementWriterFunctionInventory(
      client(publicGrant),
      role,
      migrationOwner,
    ),
    /grant source is unsafe/,
  );

  for (const route of [
    { via_role: "legacy_parent", via_inherit: true },
    { via_role: "legacy_parent", via_set: true },
  ]) {
    const rows = [
      ...managementWriterSecurityDefinerAllowlist.map(direct),
      direct(managementWriterSecurityDefinerAllowlist[0], route),
    ];
    await assert.rejects(
      verifyManagementWriterFunctionInventory(
        client(rows),
        role,
        migrationOwner,
      ),
      /SET or inherited role authority/,
    );
  }
});

test("reachable SECDEF in a non-public user schema is rejected", async () => {
  const rows = [
    ...managementWriterSecurityDefinerAllowlist.map(direct),
    direct("auth_extension.rotate(uuid)", {
      schema_name: "auth_extension",
      signature: "auth_extension.rotate(uuid)",
      expected_signature: null,
    }),
  ];
  await assert.rejects(
    verifyManagementWriterFunctionInventory(client(rows), role, migrationOwner),
    /unexpected SECURITY DEFINER function: auth_extension\.rotate/,
  );
});

test("missing direct allowlisted SECDEF fails closed", async () => {
  await assert.rejects(
    verifyManagementWriterFunctionInventory(
      client(managementWriterSecurityDefinerAllowlist.slice(1).map(direct)),
      role,
      migrationOwner,
    ),
    /allowlist is incomplete/,
  );
});

test("a protected wrapper owned by any role other than the migration owner is rejected", async () => {
  const rows = managementWriterSecurityDefinerAllowlist.map(direct);
  rows[0] = { ...rows[0], owner_name: "untrusted_definer_owner" };
  await assert.rejects(
    verifyManagementWriterFunctionInventory(client(rows), role, migrationOwner),
    /grant source is unsafe/,
  );
});

test("management functions reject additional search_path settings and elevated owner attributes", async () => {
  for (const override of [
    { proconfig: ["search_path=pg_catalog, public", "work_mem=16MB"] },
    { proconfig: ["search_path=public, pg_catalog"] },
    { prosecdef: false },
    { owner_inherit: true },
    { owner_can_login: false },
    { owner_public_create: false },
    { owner_database_create: false },
    { public_grant_option: true },
  ]) {
    const rows = managementWriterSecurityDefinerAllowlist.map(direct);
    rows[0] = { ...rows[0], ...override };
    await assert.rejects(
      verifyManagementWriterFunctionInventory(
        client(rows),
        role,
        migrationOwner,
      ),
      /grant source is unsafe/,
    );
  }
});
