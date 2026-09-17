export const runtimeManagementSettingsFunctions = [
  "public.management_settings_set_company_scalar(uuid,uuid,text,text,timestamp with time zone)",
  "public.management_settings_set_location_scalar(uuid,uuid,uuid,text,text,timestamp with time zone)",
  "public.management_settings_clear_location_scalar(uuid,uuid,uuid,text,timestamp with time zone)",
  "public.management_settings_set_company_operating_hours(uuid,uuid,operating_weekday[],boolean[],time without time zone[],time without time zone[],timestamp with time zone)",
  "public.management_settings_clear_company_operating_hours(uuid,uuid,timestamp with time zone)",
  "public.management_settings_set_location_operating_hours(uuid,uuid,uuid,operating_weekday[],boolean[],time without time zone[],time without time zone[],timestamp with time zone)",
  "public.management_settings_clear_location_operating_hours(uuid,uuid,uuid,timestamp with time zone)",
  "public.management_branding_set_company_default(uuid,uuid,text,text,timestamp with time zone)",
  "public.management_branding_set_location_override(uuid,uuid,uuid,text,text,timestamp with time zone)",
  "public.management_branding_clear_location_override(uuid,uuid,uuid,text,timestamp with time zone)",
  "public.management_settings_set_location_sla_target(uuid,uuid,uuid,integer,timestamp with time zone)",
  "public.management_settings_clear_location_sla_target(uuid,uuid,uuid,timestamp with time zone)",
];

export const privateManagementSettingsFunctions = [
  "public.management_settings_lock_organization(uuid,boolean)",
  "public.management_settings_authorize_actor(uuid,uuid,uuid)",
  "public.management_settings_canonical_scalar_value(text,text)",
  "public.management_settings_company_scalar_state(uuid,text)",
  "public.management_settings_location_scalar_state(uuid,text)",
  "public.management_settings_fee_representable(text,numeric)",
  "public.management_settings_append_company_audit(uuid,uuid,text,text,text)",
  "public.management_settings_append_location_audit(uuid,uuid,uuid,text,text,boolean,text,text,boolean,text,text)",
  "public.management_settings_validate_hours(operating_weekday[],boolean[],time without time zone[],time without time zone[])",
  "public.management_settings_canonical_hours(operating_weekday[],boolean[],time without time zone[],time without time zone[])",
  "public.management_branding_append_company_audit(uuid,uuid,text,text,text)",
  "public.management_branding_append_location_audit(uuid,uuid,uuid,text,text,boolean,text,text,boolean,text,text)",
  "public.management_settings_append_sla_target_audit(uuid,uuid,uuid,text,text,text)",
  "public.retrieval_request_snapshot_sla_target()",
  "public.retrieval_request_reject_sla_snapshot_mutation()",
];

export const managementSettingsReadOnlyTables = [
  "organization_operating_hours",
  "location_operating_hours_overrides",
];

export async function provisionManagementSettingsPrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  for (const table of managementSettingsReadOnlyTables) {
    await client.query(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC`);
    await executeFormatted(client, "REVOKE ALL ON TABLE %I FROM %I", [
      table,
      runtimeRole,
    ]);
    await executeFormatted(client, "GRANT SELECT ON TABLE %I TO %I", [
      table,
      runtimeRole,
    ]);
  }
  for (const functionName of runtimeManagementSettingsFunctions) {
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

async function functionSecurity(client, runtimeRole, functionName) {
  const result = await client.query(
    `SELECT has_function_privilege($1, $2, 'EXECUTE') AS runtime_allowed,
            function.prosecdef AS security_definer,
            owner.rolname <> $1 AS owner_safe,
            function.proconfig = ARRAY['search_path=pg_catalog, public']::text[] AS search_path_safe,
            NOT EXISTS (
              SELECT 1
              FROM aclexplode(COALESCE(function.proacl, acldefault('f', function.proowner))) AS privilege
              INNER JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee
              WHERE grantee.rolname = $1
                AND privilege.privilege_type = 'EXECUTE'
                AND privilege.is_grantable
            ) AS runtime_grant_option_denied,
            NOT EXISTS (
              SELECT 1
              FROM aclexplode(COALESCE(function.proacl, acldefault('f', function.proowner))) AS privilege
              WHERE privilege.grantee = 0 AND privilege.privilege_type = 'EXECUTE'
            ) AS public_denied
     FROM pg_proc AS function
     INNER JOIN pg_roles AS owner ON owner.oid = function.proowner
     WHERE function.oid = to_regprocedure($2)`,
    [runtimeRole, functionName],
  );
  return result.rows[0];
}

export async function verifyManagementSettingsPrivileges(client, runtimeRole) {
  for (const table of managementSettingsReadOnlyTables) {
    for (const [privilege, expected] of [
      ["SELECT", true],
      ["INSERT", false],
      ["UPDATE", false],
      ["DELETE", false],
      ["TRUNCATE", false],
      ["REFERENCES", false],
      ["TRIGGER", false],
    ]) {
      const result = await client.query(
        `SELECT has_table_privilege($1, $2, $3) AS allowed`,
        [runtimeRole, `public.${table}`, privilege],
      );
      if ((result.rows[0]?.allowed === true) !== expected) {
        throw new Error("Runtime Management settings table privileges are unsafe.");
      }
    }
  }
  for (const functionName of runtimeManagementSettingsFunctions) {
    const row = await functionSecurity(client, runtimeRole, functionName);
    if (
      row?.runtime_allowed !== true ||
      row.security_definer !== true ||
      row.owner_safe !== true ||
      row.search_path_safe !== true ||
      row.runtime_grant_option_denied !== true ||
      row.public_denied !== true
    ) {
      throw new Error("Runtime Management settings function privileges are unsafe.");
    }
  }
  for (const functionName of privateManagementSettingsFunctions) {
    const row = await functionSecurity(client, runtimeRole, functionName);
    if (row?.runtime_allowed !== false || row?.public_denied !== true) {
      throw new Error("Runtime Management settings helper privileges are unsafe.");
    }
  }
}
