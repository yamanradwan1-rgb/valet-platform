export const runtimeGuestRatingFunctions = [
  "public.guest_rating_submit(text,integer)",
];

export const privateGuestRatingFunctions = [
  "public.guest_rating_reject_mutation()",
];

export async function provisionGuestRatingPrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  await client.query("REVOKE ALL ON TABLE public.guest_ratings FROM PUBLIC");
  await executeFormatted(client, "REVOKE ALL ON TABLE public.guest_ratings FROM %I", [
    runtimeRole,
  ]);
  for (const functionName of [
    ...runtimeGuestRatingFunctions,
    ...privateGuestRatingFunctions,
  ]) {
    await client.query(`REVOKE ALL ON FUNCTION ${functionName} FROM PUBLIC`);
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      functionName,
      runtimeRole,
    ]);
  }
  for (const functionName of runtimeGuestRatingFunctions) {
    await executeFormatted(client, "GRANT EXECUTE ON FUNCTION %s TO %I", [
      functionName,
      runtimeRole,
    ]);
  }
}

async function functionSecurity(client, runtimeRole, functionName) {
  const result = await client.query(
    `SELECT has_function_privilege($1,$2,'EXECUTE') AS runtime_allowed,
            function.prosecdef AS security_definer,
            function.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AS search_path_safe,
            NOT EXISTS (
              SELECT 1 FROM aclexplode(COALESCE(function.proacl,acldefault('f',function.proowner))) privilege
              WHERE privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
            ) AS public_denied,
            NOT EXISTS (
              SELECT 1 FROM aclexplode(COALESCE(function.proacl,acldefault('f',function.proowner))) privilege
              JOIN pg_roles grantee ON grantee.oid=privilege.grantee
              WHERE grantee.rolname=$1 AND privilege.privilege_type='EXECUTE'
                AND privilege.is_grantable
            ) AS runtime_grant_option_denied
     FROM pg_proc function WHERE function.oid=to_regprocedure($2)`,
    [runtimeRole, functionName],
  );
  return result.rows[0];
}

export async function verifyGuestRatingPrivileges(client, runtimeRole) {
  const table = await client.query(
    `SELECT has_table_privilege($1,'public.guest_ratings','SELECT') AS select_allowed,
            has_table_privilege($1,'public.guest_ratings','INSERT') AS insert_allowed,
            has_table_privilege($1,'public.guest_ratings','UPDATE') AS update_allowed,
            has_table_privilege($1,'public.guest_ratings','DELETE') AS delete_allowed,
            has_table_privilege($1,'public.guest_ratings','TRUNCATE') AS truncate_allowed,
            NOT EXISTS (
              SELECT 1 FROM pg_class object
              CROSS JOIN LATERAL aclexplode(COALESCE(object.relacl,acldefault('r',object.relowner))) privilege
              WHERE object.oid='public.guest_ratings'::regclass AND privilege.grantee=0
                AND privilege.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE')
            ) AS public_denied`,
    [runtimeRole],
  );
  const row = table.rows[0];
  if (row?.select_allowed !== false || row.insert_allowed !== false ||
      row.update_allowed !== false || row.delete_allowed !== false ||
      row.truncate_allowed !== false || row.public_denied !== true) {
    throw new Error("Runtime Guest Rating table privileges are unsafe.");
  }
  for (const functionName of runtimeGuestRatingFunctions) {
    const security = await functionSecurity(client, runtimeRole, functionName);
    if (security?.runtime_allowed !== true || security.security_definer !== true ||
        security.search_path_safe !== true || security.public_denied !== true ||
        security.runtime_grant_option_denied !== true) {
      throw new Error("Runtime Guest Rating command privileges are unsafe.");
    }
  }
  for (const functionName of privateGuestRatingFunctions) {
    const security = await functionSecurity(client, runtimeRole, functionName);
    if (security?.runtime_allowed !== false || security?.public_denied !== true) {
      throw new Error("Runtime Guest Rating helper privileges are unsafe.");
    }
  }
}
