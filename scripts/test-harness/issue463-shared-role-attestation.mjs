import {
  ISSUE463_SHARED_ROLES,
} from "./issue463-shared-role-policy.mjs";

const ownerRoles = new Set(ISSUE463_SHARED_ROLES.slice(0, 2));
const bootstrapByMigrator = new Map([
  ["valet", "valet_ci_bootstrap"],
  ["valet_e2e_migrator", "valet"],
]);

export function assertIssue463SharedRoleInventory({
  databaseOwner, migrator, migrationRole, roles, memberships,
}) {
  const bootstrap = bootstrapByMigrator.get(migrator);
  if (!bootstrap || databaseOwner !== migrator ||
      migrationRole?.canLogin !== true ||
      migrationRole?.superuser !== false ||
      migrationRole?.inherit !== false ||
      migrationRole?.createRole !== true ||
      migrationRole?.replication !== false ||
      migrationRole?.bypassRls !== false ||
      roles.length !== ISSUE463_SHARED_ROLES.length) {
    throw new Error("Issue463 CI shared-role migration principal is not attested.");
  }
  for (const roleName of ISSUE463_SHARED_ROLES) {
    const matches = roles.filter((role) => role.name === roleName);
    if (matches.length !== 1) {
      throw new Error("Issue463 CI shared-role inventory is incomplete.");
    }
    const role = matches[0];
    if (role.canLogin !== !ownerRoles.has(roleName) ||
        role.inherit !== false || role.superuser !== false ||
        role.createDb !== false || role.createRole !== false ||
        role.replication !== false || role.bypassRls !== false) {
      throw new Error("Issue463 CI shared-role attributes are unsafe.");
    }
  }
  const expected = new Set(ISSUE463_SHARED_ROLES.flatMap((role) => [
    [role, migrator, bootstrap, false, false, true].join("|"),
    ...(ownerRoles.has(role) ? [
      [role, migrator, migrator, false, true, false].join("|"),
    ] : []),
  ]));
  const observed = new Set();
  for (const item of memberships) {
    const key = [
      item.parent, item.member, item.grantor,
      item.inherit, item.set, item.admin,
    ].join("|");
    if (!expected.has(key) || observed.has(key) ||
        (item.grantor === bootstrap && item.grantorSuperuser !== true)) {
      throw new Error("Issue463 CI shared-role memberships are unsafe.");
    }
    observed.add(key);
  }
  if (observed.size !== expected.size) {
    throw new Error("Issue463 CI shared-role membership edges are missing.");
  }
}

/** This CI fixture attestation reads pg_catalog only, under the migrator
 * identity, and performs no DDL or role repair. */
export async function attestIssue463SharedRoleInventory(query) {
  const principal = await query(
    `SELECT current_user AS migrator,
            owner.rolname AS database_owner,
            migration.rolcanlogin AS migration_can_login,
            migration.rolsuper AS migration_superuser,
            migration.rolinherit AS migration_inherit,
            migration.rolcreaterole AS migration_create_role,
            migration.rolreplication AS migration_replication,
            migration.rolbypassrls AS migration_bypass_rls
       FROM pg_catalog.pg_database db
       JOIN pg_catalog.pg_roles owner ON owner.oid=db.datdba
       JOIN pg_catalog.pg_roles migration ON migration.rolname=current_user
       WHERE db.datname=current_database()`,
  );
  const principalRow = principal.rows[0];
  const migrator = principalRow?.migrator;
  const databaseOwner = principalRow?.database_owner;
  const migrationRole = {
    canLogin: principalRow?.migration_can_login,
    superuser: principalRow?.migration_superuser,
    inherit: principalRow?.migration_inherit,
    createRole: principalRow?.migration_create_role,
    replication: principalRow?.migration_replication,
    bypassRls: principalRow?.migration_bypass_rls,
  };
  const roles = await query(
    `SELECT rolname AS name,rolcanlogin AS "canLogin",
            rolinherit AS inherit,rolsuper AS superuser,
            rolcreatedb AS "createDb",rolcreaterole AS "createRole",
            rolreplication AS replication,rolbypassrls AS "bypassRls"
       FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[])`,
    [ISSUE463_SHARED_ROLES],
  );
  const memberships = await query(
    `SELECT parent.rolname AS parent,member.rolname AS member,
            grantor.rolname AS grantor,grantor.rolsuper AS "grantorSuperuser",
            membership.inherit_option AS inherit,
            membership.set_option AS "set",
            membership.admin_option AS admin
       FROM pg_catalog.pg_auth_members membership
       JOIN pg_catalog.pg_roles parent ON parent.oid=membership.roleid
       JOIN pg_catalog.pg_roles member ON member.oid=membership.member
       JOIN pg_catalog.pg_roles grantor ON grantor.oid=membership.grantor
       WHERE parent.rolname=ANY($1::text[]) OR member.rolname=ANY($1::text[])`,
    [ISSUE463_SHARED_ROLES],
  );
  assertIssue463SharedRoleInventory({
    databaseOwner, migrator, migrationRole,
    roles: roles.rows,
    memberships: memberships.rows,
  });
}
