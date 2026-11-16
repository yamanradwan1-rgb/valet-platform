// Management Writer may execute exactly five bearer-bound public entrypoints.
// Keep this list independent from general Staff management function catalogs so
// a future function addition cannot silently widen the protected SQL boundary.
export const managementWriterSecurityDefinerAllowlist = Object.freeze([
  "public.staff_management_authorized_set_role(uuid,uuid,text,uuid,uuid,uuid,integer,public.membership_role)",
  "public.staff_management_authorized_set_status(uuid,uuid,text,uuid,uuid,uuid,integer,public.membership_status)",
  "public.staff_management_authorized_set_location_access(uuid,uuid,text,uuid,uuid,uuid,integer,uuid[],boolean)",
  "public.staff_management_authorized_onboarding_create(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,public.membership_role,uuid[],text)",
  "public.staff_management_authorized_onboarding_resend(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text)",
]);

function qualifiedSignature(row) {
  const prefix = `${row.schema_name}.`;
  return row.signature.startsWith(prefix)
    ? row.signature
    : prefix + row.signature;
}

export async function verifyManagementWriterFunctionInventory(
  client,
  role,
  expectedOwner,
) {
  if (expectedOwner === undefined) {
    const identity = await client.query("SELECT session_user AS trusted_owner");
    expectedOwner = identity.rows[0]?.trusted_owner;
  }
  if (typeof expectedOwner !== "string" || expectedOwner.length === 0) {
    throw new Error(
      "Management writer verifier requires the trusted migration owner.",
    );
  }
  const reachable = await client.query(
    `WITH writer AS (
       SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1
     ), expected AS (
       SELECT allowed.signature,$3::text AS expected_owner,
              pg_catalog.to_regprocedure(allowed.signature) AS function_oid
         FROM unnest($2::text[]) AS allowed(signature)
     ), definers AS (
       SELECT function.oid AS function_oid,function.proowner,
              owner.rolname AS owner_name,
              owner.rolcanlogin AS owner_can_login,
              owner.rolinherit AS owner_inherit,
              owner.rolsuper AS owner_superuser,
              owner.rolcreatedb AS owner_create_db,
              owner.rolcreaterole AS owner_create_role,
              owner.rolreplication AS owner_replication,
              owner.rolbypassrls AS owner_bypass_rls,
              pg_catalog.has_database_privilege(owner.oid,pg_catalog.current_database(),'CREATE') AS owner_database_create,
              pg_catalog.has_schema_privilege(owner.oid,'public','CREATE') AS owner_public_create,
              function.proconfig,function.prosecdef,
              namespace.oid AS schema_oid,namespace.nspname AS schema_name,
              function.oid::pg_catalog.regprocedure::text AS signature,
              EXISTS (
                SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
                  function.proacl,
                  pg_catalog.acldefault('f',function.proowner))) AS acl
                CROSS JOIN writer
                WHERE acl.grantee=writer.oid
                  AND acl.privilege_type='EXECUTE'
              ) AS direct_execute,
              EXISTS (
                SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
                  function.proacl,
                  pg_catalog.acldefault('f',function.proowner))) AS acl
                WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
              ) AS public_execute,
              EXISTS (
                SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
                  function.proacl,
                  pg_catalog.acldefault('f',function.proowner))) AS acl
                CROSS JOIN writer
                WHERE acl.grantee=writer.oid
                  AND acl.privilege_type='EXECUTE' AND acl.is_grantable
              ) AS direct_grant_option,
              EXISTS (
                SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
                  function.proacl,
                  pg_catalog.acldefault('f',function.proowner))) AS acl
                WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
                  AND acl.is_grantable
              ) AS public_grant_option,
              function.proowner=(SELECT oid FROM writer) AS owner_is_writer
         FROM pg_catalog.pg_proc AS function
         JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid=function.pronamespace
         JOIN pg_catalog.pg_roles AS owner ON owner.oid=function.proowner
        WHERE function.prosecdef
          AND namespace.nspname NOT IN ('pg_catalog','information_schema')
          AND namespace.nspname NOT LIKE 'pg_toast%'
          AND namespace.nspname NOT LIKE 'pg_temp_%'
     ), routes AS (
       SELECT definers.*,$1::text AS via_role,
              false AS via_set,false AS via_inherit
         FROM definers
        WHERE pg_catalog.has_schema_privilege(
                $1,definers.schema_oid,'USAGE')
          AND pg_catalog.has_function_privilege(
                $1,definers.function_oid,'EXECUTE')
       UNION ALL
       SELECT definers.*,candidate.rolname AS via_role,
              pg_catalog.pg_has_role($1,candidate.oid,'SET') AS via_set,
              pg_catalog.pg_has_role($1,candidate.oid,'USAGE') AS via_inherit
         FROM definers
         CROSS JOIN pg_catalog.pg_roles AS candidate
        WHERE candidate.rolname<>$1
          AND (
            pg_catalog.pg_has_role($1,candidate.oid,'SET') OR
            pg_catalog.pg_has_role($1,candidate.oid,'USAGE')
          )
          AND pg_catalog.has_schema_privilege(
                candidate.oid,definers.schema_oid,'USAGE')
          AND pg_catalog.has_function_privilege(
                candidate.oid,definers.function_oid,'EXECUTE')
     )
     SELECT routes.schema_name,routes.signature,routes.owner_name,
            expected.expected_owner,routes.via_role,
            routes.via_set,routes.via_inherit,routes.direct_execute,
            routes.public_execute,routes.direct_grant_option,
            routes.public_grant_option,routes.proconfig,routes.prosecdef,
            routes.owner_can_login,routes.owner_inherit,routes.owner_superuser,routes.owner_create_db,
            routes.owner_create_role,routes.owner_replication,routes.owner_bypass_rls,
            routes.owner_database_create,routes.owner_public_create,
            routes.owner_is_writer,expected.signature AS expected_signature
       FROM routes
       LEFT JOIN expected ON expected.function_oid=routes.function_oid
      ORDER BY schema_name,signature,via_role`,
    [role, managementWriterSecurityDefinerAllowlist, expectedOwner],
  );

  const expected = new Set(managementWriterSecurityDefinerAllowlist);
  const direct = new Set();
  for (const row of reachable.rows) {
    const signature = qualifiedSignature(row);
    if (row.via_role !== role || row.via_set || row.via_inherit) {
      throw new Error(
        "Management writer can reach SECURITY DEFINER through SET or inherited role authority.",
      );
    }
    if (
      row.expected_signature === null ||
      row.expected_signature === undefined
    ) {
      throw new Error(
        `Management writer can reach unexpected SECURITY DEFINER function: ${signature}.`,
      );
    }
    if (
      row.schema_name !== "public" ||
      row.direct_execute !== true ||
      row.public_execute !== false ||
      row.direct_grant_option !== false ||
      row.public_grant_option !== false ||
      row.owner_is_writer !== false ||
      row.owner_name !== expectedOwner ||
      row.expected_owner !== expectedOwner ||
      row.owner_can_login !== true ||
      row.prosecdef !== true ||
      !Array.isArray(row.proconfig) ||
      row.proconfig.length !== 1 ||
      row.proconfig[0] !== "search_path=pg_catalog, public" ||
      row.owner_inherit !== false ||
      row.owner_superuser !== false ||
      row.owner_create_db !== false ||
      row.owner_create_role !== false ||
      row.owner_replication !== false ||
      row.owner_bypass_rls !== false ||
      row.owner_database_create !== false ||
      row.owner_public_create !== false
    ) {
      throw new Error(
        `Management writer SECURITY DEFINER grant source is unsafe: ${signature}.`,
      );
    }
    direct.add(row.expected_signature);
  }
  if (
    direct.size !== expected.size ||
    [...expected].some((signature) => !direct.has(signature))
  ) {
    throw new Error(
      "Management writer SECURITY DEFINER allowlist is incomplete.",
    );
  }
}
