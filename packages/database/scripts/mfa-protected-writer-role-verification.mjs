async function assertWriterRole(client, writerRole) {
  const result = await client.query(
    `SELECT role.rolcanlogin,role.rolinherit,role.rolsuper,role.rolcreatedb,
            role.rolcreaterole,role.rolreplication,role.rolbypassrls,
            EXISTS (
              SELECT 1 FROM pg_catalog.pg_auth_members membership
              WHERE membership.member=role.oid OR membership.roleid=role.oid
            ) AS has_membership
     FROM pg_catalog.pg_roles role WHERE role.rolname=$1`,
    [writerRole],
  );
  const row = result.rows[0];
  if (
    result.rowCount !== 1 ||
    row?.rolcanlogin !== true ||
    row.rolinherit !== false ||
    row.rolsuper ||
    row.rolcreatedb ||
    row.rolcreaterole ||
    row.rolreplication ||
    row.rolbypassrls ||
    row.has_membership
  ) {
    throw new Error(
      "MFA writer role inheritance or role attributes are unsafe.",
    );
  }
}

async function assertDatabaseAndSchemas(client, writerRole) {
  const database = await client.query(
    `SELECT pg_catalog.has_database_privilege($1,current_database(),'CONNECT') AS connect,
            pg_catalog.has_database_privilege($1,current_database(),'CREATE') AS create,
            pg_catalog.has_database_privilege($1,current_database(),'TEMPORARY') AS temporary`,
    [writerRole],
  );
  if (
    database.rowCount !== 1 ||
    database.rows[0]?.connect !== true ||
    database.rows[0]?.create !== false ||
    database.rows[0]?.temporary !== false
  ) {
    throw new Error("MFA writer database privileges are unsafe.");
  }
  const schemas = await client.query(
    `SELECT namespace.nspname,
            pg_catalog.has_schema_privilege($1,namespace.oid,'USAGE') AS usage,
            pg_catalog.has_schema_privilege($1,namespace.oid,'CREATE') AS create
     FROM pg_catalog.pg_namespace namespace
     WHERE namespace.nspname NOT IN ('pg_catalog','information_schema')
       AND namespace.nspname NOT LIKE 'pg_toast%'
       AND namespace.nspname NOT LIKE 'pg_temp_%'
     ORDER BY namespace.nspname`,
    [writerRole],
  );
  if (
    schemas.rows.some(
      (row) => row.usage !== (row.nspname === "public") || row.create !== false,
    )
  ) {
    throw new Error("MFA writer schema privileges are unsafe.");
  }
}

async function assertNoOwnedObjects(client, writerRole) {
  const result = await client.query(
    `SELECT 1
     FROM pg_catalog.pg_roles role
     WHERE role.rolname=$1 AND (
       EXISTS (
         SELECT 1 FROM pg_catalog.pg_class relation
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
         WHERE relation.relowner=role.oid
           AND namespace.nspname NOT IN ('pg_catalog','information_schema')
           AND namespace.nspname NOT LIKE 'pg_toast%'
           AND namespace.nspname NOT LIKE 'pg_temp_%'
       ) OR EXISTS (
         SELECT 1 FROM pg_catalog.pg_proc function
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid=function.pronamespace
         WHERE function.proowner=role.oid
           AND namespace.nspname NOT IN ('pg_catalog','information_schema')
           AND namespace.nspname NOT LIKE 'pg_toast%'
           AND namespace.nspname NOT LIKE 'pg_temp_%'
       ) OR EXISTS (
         SELECT 1 FROM pg_catalog.pg_namespace namespace
         WHERE namespace.nspowner=role.oid
           AND namespace.nspname NOT IN ('pg_catalog','information_schema')
           AND namespace.nspname NOT LIKE 'pg_toast%'
           AND namespace.nspname NOT LIKE 'pg_temp_%'
       )
     ) LIMIT 1`,
    [writerRole],
  );
  if (result.rowCount !== 0) {
    throw new Error("MFA writer must not own database objects.");
  }
}

async function assertSafeDefaults(client, writerRole, migrationRole) {
  const result = await client.query(
    `SELECT
       EXISTS (
         SELECT 1 FROM pg_catalog.pg_default_acl defaults
         CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) privilege
         WHERE defaults.defaclrole=(
           SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1
         ) OR privilege.grantee=(
           SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1
         )
       ) AS writer_defaults,
       EXISTS (
         SELECT 1 FROM pg_catalog.pg_default_acl defaults
         JOIN pg_catalog.pg_namespace namespace
           ON namespace.oid=defaults.defaclnamespace
         WHERE defaults.defaclrole=(
             SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2
           )
           AND defaults.defaclobjtype='f'
           AND namespace.nspname='public'
           AND NOT EXISTS (
             SELECT 1 FROM pg_catalog.aclexplode(defaults.defaclacl) privilege
             WHERE privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
           )
       ) AS migration_public_functions_closed`,
    [writerRole, migrationRole],
  );
  if (
    result.rowCount !== 1 ||
    result.rows[0]?.writer_defaults !== false ||
    result.rows[0]?.migration_public_functions_closed !== true
  ) {
    throw new Error(
      "MFA writer or PUBLIC retains dangerous default privileges.",
    );
  }
}

export async function verifyMfaProtectedWriterRole(
  client,
  writerRole,
  migrationRole,
) {
  await assertWriterRole(client, writerRole);
  await assertDatabaseAndSchemas(client, writerRole);
  await assertNoOwnedObjects(client, writerRole);
  await assertSafeDefaults(client, writerRole, migrationRole);
}
