export async function assertOptionCFunctionReady(
  client,
  signature,
  role,
  expectedPath,
  expectedOwner,
  expectedOwnerAttributes = {},
) {
  if (typeof expectedOwner !== "string" || expectedOwner.length === 0) {
    throw new Error(
      `Option C function ${signature} has no trusted owner contract.`,
    );
  }
  const result = await client.query(
    `SELECT function.prosecdef,owner.rolname AS owner,function.proconfig,
            owner.rolcanlogin AS owner_can_login,
            owner.rolinherit AS owner_inherit,
            owner.rolsuper AS owner_superuser,
            owner.rolcreatedb AS owner_create_db,
            owner.rolcreaterole AS owner_create_role,
            owner.rolreplication AS owner_replication,
            owner.rolbypassrls AS owner_bypass_rls,
            pg_catalog.has_database_privilege(owner.oid,pg_catalog.current_database(),'CREATE') AS owner_database_create,
            pg_catalog.has_schema_privilege(owner.oid,'public','CREATE') AS owner_public_create,
            pg_catalog.has_function_privilege($2,function.oid,'EXECUTE') AS allowed,
            NOT EXISTS (
              SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
                function.proacl,pg_catalog.acldefault('f',function.proowner))) acl
              WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
            ) AS public_denied,
            NOT EXISTS (
              SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
                function.proacl,pg_catalog.acldefault('f',function.proowner))) acl
              WHERE acl.privilege_type='EXECUTE' AND acl.grantee<>function.proowner
                AND acl.is_grantable
            ) AS grant_option_denied
       FROM pg_catalog.pg_proc function
       JOIN pg_catalog.pg_roles owner ON owner.oid=function.proowner
       WHERE function.oid=pg_catalog.to_regprocedure($1)`,
    [signature, role],
  );
  const row = result.rows[0];
  // The migration principal is an explicitly higher-trust provisioning
  // identity. On the supported PG17 topology it may own the database/public
  // schema and may hold CREATEDB/CREATEROLE. Those DDL/role-admin capabilities
  // are audited separately and must not be confused with authority reachable
  // by Runtime or a protected Writer. Keep the function-owner contract strict
  // on identity, LOGIN mode and dangerous execution attributes; callers that
  // use a dedicated NOLOGIN owner pass an exact stricter attribute contract.
  const requiredOwnerAttributes = {
    owner_can_login: true,
    owner_inherit: false,
    owner_superuser: false,
    owner_replication: false,
    owner_bypass_rls: false,
    ...expectedOwnerAttributes,
  };
  const attributesMatch = Object.entries(requiredOwnerAttributes).every(
    ([attribute, expected]) => row?.[attribute] === expected,
  );
  if (
    result.rowCount !== 1 ||
    row?.prosecdef !== true ||
    row.allowed !== true ||
    row.public_denied !== true ||
    row.grant_option_denied !== true ||
    row.owner !== expectedOwner ||
    !attributesMatch ||
    !Array.isArray(row.proconfig) ||
    !row.proconfig.includes(expectedPath)
  ) {
    throw new Error(`Option C protected function ${signature} is not ready.`);
  }
  if (expectedOwnerAttributes.owner_can_login === false) {
    const memberships = await client.query(
      `SELECT 1 FROM pg_catalog.pg_auth_members membership
         JOIN pg_catalog.pg_roles parent ON parent.oid=membership.roleid
         JOIN pg_catalog.pg_roles member ON member.oid=membership.member
        WHERE parent.rolname=$1 OR member.rolname=$1`,
      [expectedOwner],
    );
    if (memberships.rowCount !== 0) {
      throw new Error(
        `Option C NOLOGIN function owner ${expectedOwner} has role memberships.`,
      );
    }
  }
}
