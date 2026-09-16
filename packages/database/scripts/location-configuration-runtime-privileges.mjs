const runtimeLocationConfigurationFunctions = [
  "public.location_configuration_set_override(uuid,uuid,text,text,timestamp with time zone)",
  "public.location_configuration_clear_override(uuid,uuid,text,timestamp with time zone)",
];

const privateLocationConfigurationFunctions = [
  "public.location_configuration_authorized_organization(uuid,uuid)",
  "public.location_configuration_setting_state(uuid,text)",
  "public.location_configuration_minor_unit_exponent(text)",
  "public.location_configuration_append_audit(uuid,uuid,uuid,text,text,boolean,text,text,boolean,text,text)",
];

export async function provisionLocationConfigurationPrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  for (const functionName of runtimeLocationConfigurationFunctions) {
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      functionName,
      runtimeRole,
    ]);
    await executeFormatted(client, "GRANT EXECUTE ON FUNCTION %s TO %I", [
      functionName,
      runtimeRole,
    ]);
  }
}

export async function verifyLocationConfigurationPrivileges(
  client,
  runtimeRole,
) {
  for (const functionName of runtimeLocationConfigurationFunctions) {
    const result = await client.query(
      `SELECT has_function_privilege($1, $2, 'EXECUTE') AS runtime_allowed,
              function.prosecdef AS security_definer,
              owner.rolname <> $1 AS owner_safe,
              function.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
                AS search_path_safe,
              NOT EXISTS (
                SELECT 1
                FROM pg_proc AS function
                CROSS JOIN LATERAL aclexplode(
                  COALESCE(function.proacl,
                           acldefault('f', function.proowner))
                ) AS privilege
                WHERE function.oid = to_regprocedure($2)
                  AND privilege.grantee = 0
                  AND privilege.privilege_type = 'EXECUTE'
              ) AS public_denied
       FROM pg_proc AS function
       INNER JOIN pg_roles AS owner ON owner.oid = function.proowner
       WHERE function.oid = to_regprocedure($2)`,
      [runtimeRole, functionName],
    );
    const row = result.rows[0];
    if (
      row?.runtime_allowed !== true ||
      row.security_definer !== true ||
      row.owner_safe !== true ||
      row.search_path_safe !== true ||
      row.public_denied !== true
    ) {
      throw new Error(
        "Runtime location configuration function privileges are unsafe.",
      );
    }
  }
  for (const functionName of privateLocationConfigurationFunctions) {
    const result = await client.query(
      `SELECT has_function_privilege($1, $2, 'EXECUTE') AS runtime_allowed,
              NOT EXISTS (
                SELECT 1
                FROM pg_proc AS function
                CROSS JOIN LATERAL aclexplode(
                  COALESCE(function.proacl,
                           acldefault('f', function.proowner))
                ) AS privilege
                WHERE function.oid = to_regprocedure($2)
                  AND privilege.grantee = 0
                  AND privilege.privilege_type = 'EXECUTE'
              ) AS public_denied
       FROM pg_proc AS function
       WHERE function.oid = to_regprocedure($2)`,
      [runtimeRole, functionName],
    );
    const row = result.rows[0];
    if (
      row?.runtime_allowed !== false ||
      row?.public_denied !== true
    ) {
      throw new Error(
        "Runtime location configuration helper privileges are unsafe.",
      );
    }
  }
}
