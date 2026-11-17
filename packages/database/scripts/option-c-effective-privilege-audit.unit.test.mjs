import {
  roles,
  names,
  matrix,
  fixtureClient,
} from "./option-c-effective-privilege-audit.fixture.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auditOptionCEffectivePrivileges,
  verifyOptionCEffectivePrivileges,
  normalizeOptionCRoles,
  compareOptionCPrivilegeSnapshots,
  serializeOptionCPrivilegeSnapshot,
} from "./option-c-effective-privilege-audit.mjs";
import { catalogQueries } from "./option-c-effective-privilege-catalog.mjs";
import { optionCFunctionContract } from "./option-c-protected-cutover-acl.mjs";
import { protectedTables } from "./option-c-effective-privilege-policy.mjs";
import { staffSessionLockOwnerColumns } from "./option-c-staff-session-lock-contract.mjs";

test("role names are validated and default session owner is stable", () => {
  assert.deepEqual(normalizeOptionCRoles(roles), names);
  assert.throws(
    () => normalizeOptionCRoles({ ...roles, mfaWriter: "runtime" }),
    /distinct/,
  );
  assert.throws(
    () => normalizeOptionCRoles({ ...roles, runtime: "bad;drop" }),
    /valid roles/,
  );
});

test("audit issues catalog/effective predicate SQL with configured role parameters", async () => {
  const { client, calls } = fixtureClient();
  const snapshot = await auditOptionCEffectivePrivileges(client, roles);
  assert.equal(calls.length, Object.keys(catalogQueries).length);
  assert(
    calls
      .filter((call) => call.sql !== catalogQueries.defaults)
      .every((call) => call.params[0].includes("auth_writer")),
  );
  assert.deepEqual(
    calls.find((call) => call.sql === catalogQueries.defaults).params,
    [],
  );
  assert.equal(
    calls.find((call) => call.sql === catalogQueries.memberships).params[1],
    names.sessionLockOwner,
  );
  for (const keyword of [
    "has_table_privilege",
    "has_column_privilege",
    "has_sequence_privilege",
    "has_function_privilege",
    "has_schema_privilege",
    "pg_has_role",
    "aclexplode",
    "pg_default_acl",
    "prosecdef",
    "pg_auth_members",
  ]) {
    assert(
      Object.values(catalogQueries).some((sql) => sql.includes(keyword)),
      keyword,
    );
  }
  assert.equal(snapshot.matrix.length, matrix().length);
  assert.deepEqual(
    snapshot.matrix,
    [...snapshot.matrix].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b), "en"),
    ),
  );
});

test("valid bounded matrix verifies, including lock ownership and exact columns", async () => {
  const { client } = fixtureClient();
  const snapshot = await verifyOptionCEffectivePrivileges(client, roles);
  assert.equal(snapshot.roles.runtime, "runtime");
});

test("effective audit accepts only the exact runtime row-lock/default-sequence contracts", async () => {
  const evidence = matrix();
  evidence.push(
    {
      kind: "column",
      role: names.runtime,
      object: "organization_memberships",
      column: "updated_at",
      privilege: "UPDATE",
      effective: true,
      grant_option: false,
      grants: [],
    },
    {
      kind: "column",
      role: names.runtime,
      object: "locations",
      column: "updated_at",
      privilege: "UPDATE",
      effective: true,
      grant_option: false,
      grants: [],
    },
    {
      kind: "default",
      role: names.migrationRole,
      object: "public",
      object_type: "S",
      grantee: names.runtime,
      grantor: names.migrationRole,
      privilege: "USAGE",
      grant_option: false,
    },
    {
      kind: "default",
      role: names.migrationRole,
      object: "public",
      object_type: "S",
      grantee: names.runtime,
      grantor: names.migrationRole,
      privilege: "SELECT",
      grant_option: false,
    },
  );
  await verifyOptionCEffectivePrivileges(fixtureClient(evidence).client, roles);

  const unsafe = structuredClone(evidence);
  unsafe.push({
    kind: "column",
    role: names.runtime,
    object: "organization_memberships",
    column: "role",
    privilege: "UPDATE",
    effective: true,
    grant_option: false,
    grants: [],
  });
  await assert.rejects(
    verifyOptionCEffectivePrivileges(fixtureClient(unsafe).client, roles),
    /Runtime protected column organization_memberships\.role UPDATE/,
  );
});

test("function catalog preserves only approved timeout values while redacting other settings", () => {
  assert.match(catalogQueries.functions, /lock_timeout=200ms/);
  assert.match(catalogQueries.functions, /statement_timeout=500ms/);
  assert.match(catalogQueries.functions, /<redacted>/);
});

test("effective audit distinguishes PG17 bootstrap ADMIN-only from SET-only owner access", async () => {
  const snapshot = matrix();
  snapshot.push({
    kind: "membership",
    role: names.migrationRole,
    object: names.sessionLockOwner,
    member: true,
    direct_set: false,
    direct_inherit: false,
    direct_admin: true,
    effective_set: true,
    effective_inherit: false,
    grantor: "postgres",
    grantor_superuser: true,
  });
  await verifyOptionCEffectivePrivileges(fixtureClient(snapshot).client, roles);
  snapshot.at(-1).grantor_superuser = false;
  await assert.rejects(
    verifyOptionCEffectivePrivileges(fixtureClient(snapshot).client, roles),
    /Session lock owner has an unexpected membership route/,
  );
});

test("catches effective role inheritance, secret reads, PUBLIC EXECUTE and grant options", async () => {
  const evidence = matrix();
  evidence.push({
    kind: "membership",
    role: "runtime",
    object: "auth_writer",
    member: true,
    effective_set: true,
    effective_inherit: true,
  });
  evidence.find(
    (row) =>
      row.kind === "column" &&
      row.role === "runtime" &&
      row.column === "current_access_token_hash" &&
      row.privilege === "SELECT",
  ).effective = true;
  evidence.push({
    kind: "function",
    role: "runtime",
    object: "public.secret()",
    privilege: "EXECUTE",
    effective: true,
    grant_option: false,
    security_definer: true,
    proconfig: ["search_path=pg_catalog"],
    search_path: "pg_catalog",
    grants: [{ grantee: "PUBLIC" }],
  });
  evidence.find(
    (row) => row.kind === "table" && row.role === "runtime",
  ).grant_option = true;
  await assert.rejects(
    verifyOptionCEffectivePrivileges(fixtureClient(evidence).client, roles),
    (error) =>
      error.failures.some((f) => f.includes("membership/SET/INHERIT")) &&
      error.failures.some((f) => f.includes("current_access_token_hash")) &&
      error.failures.some((f) => f.includes("PUBLIC function")) &&
      error.failures.some((f) => f.includes("grant option")),
  );
});

test("snapshots serialize deterministically and diff without secrets", async () => {
  const before = await auditOptionCEffectivePrivileges(
    fixtureClient().client,
    roles,
  );
  const after = structuredClone(before);
  after.matrix[0].effective = true;
  const comparison = compareOptionCPrivilegeSnapshots(before, after);
  assert.equal(comparison.changed, true);
  assert.equal(comparison.changes.length, 1);
  assert.equal(
    serializeOptionCPrivilegeSnapshot(before),
    serializeOptionCPrivilegeSnapshot(structuredClone(before)),
  );
  assert.equal(compareOptionCPrivilegeSnapshots(after, after).changed, false);
});
