import assert from "node:assert/strict";
import test from "node:test";

import {
  assertIssue463SharedRoleInventory,
  attestIssue463SharedRoleInventory,
} from "./issue463-shared-role-attestation.mjs";
import { ISSUE463_SHARED_ROLES } from "./issue463-shared-role-policy.mjs";

function fixture(migrator = "valet") {
  const bootstrap = migrator === "valet" ? "valet_ci_bootstrap" : "valet";
  const roles = ISSUE463_SHARED_ROLES.map((name, index) => ({
    name,
    canLogin: index >= 2,
    inherit: false, superuser: false,
    createDb: false, createRole: false,
    replication: false, bypassRls: false,
  }));
  const memberships = ISSUE463_SHARED_ROLES.flatMap((parent, index) => [
    {
      parent, member: migrator, grantor: bootstrap,
      grantorSuperuser: true,
      inherit: false, set: false, admin: true,
    },
    ...(index < 2 ? [{
      parent, member: migrator, grantor: migrator,
      grantorSuperuser: false,
      inherit: false, set: true, admin: false,
    }] : []),
  ]);
  return {
    migrator, databaseOwner: migrator, roles, memberships,
    migrationRole: {
      canLogin: true, superuser: false, inherit: false,
      createRole: true, replication: false, bypassRls: false,
    },
  };
}

test("exact PG17 creator ADMIN + F/P migrator SET edges accepted for both CI principals", () => {
  for (const principal of ["valet", "valet_e2e_migrator"])
    assert.doesNotThrow(() => assertIssue463SharedRoleInventory(fixture(principal)));
});

test("missing/forged/overbroad membership edges always fail", () => {
  const invalid = [
    ({ memberships }) => memberships.pop(),
    ({ memberships }) => memberships.push({ ...memberships[0], member: "foreign" }),
    ({ memberships }) => memberships.push({ ...memberships[0] }),
    ({ memberships }) => { memberships[0].grantorSuperuser = false; },
    ({ memberships }) => { memberships[0].set = true; },
    ({ memberships }) => { memberships[0].inherit = true; },
    ({ memberships }) => { memberships[0].admin = false; },
    ({ memberships }) => { memberships[1].admin = true; },
    ({ memberships }) => { memberships[1].grantor = "not_migrator"; },
    ({ memberships }) => { memberships[3].set = false; },
    ({ memberships }) => memberships.push({
      parent: ISSUE463_SHARED_ROLES[2],
      member: "valet",
      grantor: "valet",
      grantorSuperuser: false,
      inherit: false, set: true, admin: false,
    }),
  ];
  for (const mutate of invalid) {
    const value = fixture();
    mutate(value);
    assert.throws(() => assertIssue463SharedRoleInventory(value), /unsafe|missing/);
  }
});

test("wrong database owner, role attributes or principal reject attestation", () => {
  for (const change of [
    (v) => { v.databaseOwner = "postgres"; },
    (v) => { v.migrator = "valet_runtime"; },
    (v) => { v.roles.pop(); },
    (v) => { v.roles[0].canLogin = true; },
    (v) => { v.roles[3].canLogin = false; },
    (v) => { v.roles[2].createRole = true; },
    (v) => { v.roles[1].inherit = true; },
    (v) => { v.roles[1].name = "other"; },
    (v) => { v.migrationRole.superuser = true; },
    (v) => { v.migrationRole.createRole = false; },
    (v) => { v.migrationRole.inherit = true; },
  ]) {
    const value = fixture();
    change(value);
    assert.throws(() => assertIssue463SharedRoleInventory(value),
      /principal|inventory|unsafe/);
  }
});

test("read-only catalog attestor passes exact migration principal and parameter scope", async () => {
  const value = fixture();
  const calls = [];
  await attestIssue463SharedRoleInventory(async (query, params) => {
    calls.push({ query, params });
    if (query.includes("current_user AS migrator"))
      return { rows: [{
        migrator: value.migrator, database_owner: value.databaseOwner,
        migration_can_login: value.migrationRole.canLogin,
        migration_superuser: value.migrationRole.superuser,
        migration_inherit: value.migrationRole.inherit,
        migration_create_role: value.migrationRole.createRole,
        migration_replication: value.migrationRole.replication,
        migration_bypass_rls: value.migrationRole.bypassRls,
      }] };
    if (query.includes("rolcanlogin AS"))
      return { rows: value.roles };
    return { rows: value.memberships };
  });
  assert.equal(calls.length, 3);
  assert.equal(calls.every(({ query }) => /^SELECT\s/i.test(query.trim())), true);
  assert.deepEqual(calls.slice(1).map(({ params }) => params),
    [[ISSUE463_SHARED_ROLES], [ISSUE463_SHARED_ROLES]]);
});
