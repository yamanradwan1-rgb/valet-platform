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

export async function verifyManagementWriterFunctionInventory(client, role) {
  const reachable = await client.query(
    `WITH writer AS (
       SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1
     ), expected AS (
       SELECT allowed.signature,
              pg_catalog.to_regprocedure(allowed.signature) AS function_oid
         FROM unnest($2::text[]) AS allowed(signature)
     ), definers AS (
       SELECT function.oid AS function_oid,function.proowner,
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
              function.proowner=(SELECT oid FROM writer) AS owner_is_writer
         FROM pg_catalog.pg_proc AS function
         JOIN pg_catalog.pg_namespace AS namespace
           ON namespace.oid=function.pronamespace
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
     SELECT routes.schema_name,routes.signature,routes.via_role,
            routes.via_set,routes.via_inherit,routes.direct_execute,
            routes.public_execute,routes.direct_grant_option,
            routes.owner_is_writer,expected.signature AS expected_signature
       FROM routes
       LEFT JOIN expected ON expected.function_oid=routes.function_oid
      ORDER BY schema_name,signature,via_role`,
    [role, managementWriterSecurityDefinerAllowlist],
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
    if (row.expected_signature === null || row.expected_signature === undefined) {
      throw new Error(
        `Management writer can reach unexpected SECURITY DEFINER function: ${signature}.`,
      );
    }
    if (
      row.schema_name !== "public" ||
      row.direct_execute !== true ||
      row.public_execute !== false ||
      row.direct_grant_option !== false ||
      row.owner_is_writer !== false
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
    throw new Error("Management writer SECURITY DEFINER allowlist is incomplete.");
  }
}
