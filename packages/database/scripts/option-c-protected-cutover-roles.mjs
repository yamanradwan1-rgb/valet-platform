import { optionCRoles } from "./option-c-protected-cutover-state.mjs";
import { trustedCreatorAdmin } from "./option-c-bootstrap-creator-admin.mjs";

async function assertRoleBoundary(client, role) {
  const metadata = await client.query(
    `SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
            rolreplication,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=$1`,
    [role],
  );
  const current = metadata.rows[0];
  if (
    metadata.rowCount !== 1 ||
    current?.rolcanlogin !== true ||
    current.rolinherit ||
    current.rolsuper ||
    current.rolcreatedb ||
    current.rolcreaterole ||
    current.rolreplication ||
    current.rolbypassrls
  ) {
    throw new Error(`Option C role ${role} has unsafe attributes.`);
  }
  const authority = await client.query(
    `SELECT has_database_privilege($1,current_database(),'CREATE') AS db_create,
            has_database_privilege($1,current_database(),'TEMPORARY') AS db_temp,
            has_schema_privilege($1,'public','CREATE') AS schema_create,
            EXISTS (SELECT 1 FROM unnest(ARRAY[
              'auth_proof_private','mfa_activity_private','s04_quota_guard'
            ]) AS schema_name
              WHERE pg_catalog.to_regnamespace(schema_name) IS NOT NULL
                AND has_schema_privilege($1,schema_name,'CREATE')) AS private_schema_create,
            EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relowner=
              (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1)) OR
            EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE proowner=
              (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1)) OR
            EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner=
              (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1)) OR
            EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datdba=
              (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1)) AS owns_object`,
    [role],
  );
  if (!authority.rows[0] || Object.values(authority.rows[0]).some(Boolean)) {
    throw new Error(`Option C role ${role} has owner or CREATE authority.`);
  }
}

async function assertSafeMemberships(
  client,
  roles,
  runtimeRole,
  migrationRole,
) {
  const owner = await client.query(
    `SELECT database_owner.rolname AS database_owner
       FROM pg_catalog.pg_database database
       JOIN pg_catalog.pg_roles database_owner ON database_owner.oid=database.datdba
       WHERE database.datname=pg_catalog.current_database()`,
  );
  const databaseOwner = owner.rows[0]?.database_owner;
  if (owner.rowCount !== 1 || !databaseOwner) {
    throw new Error("Option C database owner is unavailable.");
  }
  const result = await client.query(
    `SELECT parent.rolname AS parent,member.rolname AS member,
            grantor.rolname AS grantor,grantor.rolsuper AS grantor_superuser,
            membership.inherit_option,
            membership.set_option,membership.admin_option
       FROM pg_catalog.pg_auth_members membership
       JOIN pg_catalog.pg_roles parent ON parent.oid=membership.roleid
       JOIN pg_catalog.pg_roles member ON member.oid=membership.member
       JOIN pg_catalog.pg_roles grantor ON grantor.oid=membership.grantor
       WHERE parent.rolname=ANY($1::text[]) OR member.rolname=ANY($1::text[])
       ORDER BY parent.rolname,member.rolname,grantor.rolname`,
    [roles],
  );
  const protectedRoles = new Set(roles);
  const seenParents = new Set();
  for (const row of result.rows) {
    // The migration role is intentionally a higher-trust provisioning
    // principal. PostgreSQL 17 creator ADMIN authority can delegate role
    // membership even when its own direct SET/INHERIT options are false.
    // Accept only the exact bootstrap edge; runtime/writer principals must
    // never receive the same authority.
    const safeCreatorAdmin =
      protectedRoles.has(row.parent) &&
      !roles.includes(row.member) &&
      trustedCreatorAdmin(row, {
        parent: row.parent,
        migrationRole,
        databaseOwner,
      }) &&
      !seenParents.has(row.parent);
    if (!safeCreatorAdmin) {
      throw new Error(
        "Option C runtime/writer role membership or SET authority remains " +
          `(role=${row.parent}, member=${row.member}, grantor=${row.grantor}, ` +
          `admin=${row.admin_option}, set=${row.set_option}, inherit=${row.inherit_option}).`,
      );
    }
    seenParents.add(row.parent);
  }
  for (const role of roles) {
    const proofOwner = await client.query(
      `SELECT pg_catalog.pg_has_role($1,$2,'SET') AS can_set,
              pg_catalog.pg_has_role($1,$2,'USAGE') AS can_inherit`,
      [role, optionCRoles.proofOwner],
    );
    if (proofOwner.rows[0]?.can_set || proofOwner.rows[0]?.can_inherit) {
      throw new Error(`Option C role ${role} can assume the proof owner.`);
    }
  }
  for (const writer of protectedRoles) {
    const migratorAccess = await client.query(
      `SELECT pg_catalog.pg_has_role($1,$2,'SET') AS can_set,
              pg_catalog.pg_has_role($1,$2,'USAGE') AS can_inherit`,
      [migrationRole, writer],
    );
    if (
      migratorAccess.rows[0]?.can_set ||
      migratorAccess.rows[0]?.can_inherit
    ) {
      throw new Error(
        `Option C migration role can execute protected writer ${writer}.`,
      );
    }
  }
}

async function assertNoDangerousDefaults(client, roles) {
  const result = await client.query(
    `SELECT 1 FROM pg_catalog.pg_default_acl defaults
       LEFT JOIN pg_catalog.pg_namespace namespace ON namespace.oid=defaults.defaclnamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) privilege
       WHERE (defaults.defaclnamespace=0 OR namespace.nspname='public')
         AND pg_catalog.has_schema_privilege(defaults.defaclrole,'public','CREATE')
         AND (privilege.grantee=0 OR privilege.grantee=ANY(
           SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[])))
         AND ((defaults.defaclobjtype='r' AND privilege.privilege_type IN
           ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')) OR
              (defaults.defaclobjtype='f' AND privilege.privilege_type='EXECUTE'))
       LIMIT 1`,
    [roles],
  );
  if (result.rowCount !== 0) {
    throw new Error("Option C dangerous default ACL remains reachable.");
  }
}

async function assertNoGrantOptions(client, roles) {
  const result = await client.query(
    `SELECT 1 FROM (
       SELECT relation.relowner AS owner,acl.grantee,acl.is_grantable
         FROM pg_catalog.pg_class relation
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
         CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) acl
         WHERE namespace.nspname='public'
       UNION ALL
       SELECT relation.relowner,acl.grantee,acl.is_grantable
         FROM pg_catalog.pg_attribute attribute
         JOIN pg_catalog.pg_class relation ON relation.oid=attribute.attrelid
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
         CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl
         WHERE namespace.nspname='public' AND attribute.attnum>0 AND NOT attribute.attisdropped
       UNION ALL
       SELECT function.proowner,acl.grantee,acl.is_grantable
         FROM pg_catalog.pg_proc function
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid=function.pronamespace
         CROSS JOIN LATERAL pg_catalog.aclexplode(function.proacl) acl
         WHERE namespace.nspname IN
           ('public','auth_proof_private','mfa_activity_private','s04_quota_guard')
     ) privilege
     WHERE privilege.grantee=ANY(
       SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[]))
       AND privilege.grantee<>privilege.owner AND privilege.is_grantable
     LIMIT 1`,
    [roles],
  );
  if (result.rowCount !== 0) {
    throw new Error("Option C runtime/writer role retains a grant option.");
  }
}

export async function verifyOptionCRoleIsolation(
  client,
  runtimeRole,
  migrationRole,
) {
  const roles = [
    runtimeRole,
    optionCRoles.staffAuthWriter,
    optionCRoles.mfaWriter,
    optionCRoles.managementWriter,
  ];
  for (const role of roles) await assertRoleBoundary(client, role);
  await assertSafeMemberships(client, roles, runtimeRole, migrationRole);
  await assertNoDangerousDefaults(client, roles);
  await assertNoGrantOptions(client, roles);
  return roles;
}
