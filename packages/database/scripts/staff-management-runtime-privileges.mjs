export const runtimeStaffManagementFunctions = [
  "public.staff_management_set_role(uuid,uuid,uuid,integer,membership_role)",
  "public.staff_management_set_status(uuid,uuid,uuid,integer,membership_status)",
  "public.staff_management_set_location_access(uuid,uuid,uuid,integer,uuid[],boolean)",
];

export const managementWriterFunctions = [
  "public.staff_management_authorized_set_role(uuid,uuid,text,uuid,uuid,uuid,integer,membership_role)",
  "public.staff_management_authorized_set_status(uuid,uuid,text,uuid,uuid,uuid,integer,membership_status)",
  "public.staff_management_authorized_set_location_access(uuid,uuid,text,uuid,uuid,uuid,integer,uuid[],boolean)",
  "public.staff_management_authorized_onboarding_create(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,membership_role,uuid[],text)",
  "public.staff_management_authorized_onboarding_resend(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text)",
];

export const privateStaffManagementFunctions = [
  "public.staff_management_authorize_actor(uuid,uuid)",
  "public.staff_management_authorize_staff_actor(uuid,uuid)",
  "public.staff_management_has_blockers(uuid,uuid,uuid[])",
  "public.staff_management_is_usable_admin(uuid,uuid)",
  "public.staff_management_has_other_usable_admin(uuid,uuid)",
  "public.staff_management_lock_admin_factors(uuid)",
  "public.staff_management_lock_lm_active_grants(uuid,uuid)",
  "public.staff_management_lm_target_covered(uuid,uuid,uuid)",
  "public.staff_management_authorize_writer(uuid,uuid,text,uuid,uuid)",
  "public.staff_management_touch_writer_activity(uuid,uuid,text)",
];

export async function provisionStaffManagementPrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  for (const functionName of runtimeStaffManagementFunctions) {
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      functionName,
      runtimeRole,
    ]);
  }
}

export async function verifyStaffManagementPrivileges(client, runtimeRole) {
  for (const functionName of runtimeStaffManagementFunctions) {
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
                SELECT 1 FROM aclexplode(COALESCE(function.proacl, acldefault('f', function.proowner))) AS privilege
                WHERE privilege.grantee = 0 AND privilege.privilege_type = 'EXECUTE'
              ) AS public_denied
       FROM pg_proc AS function
       INNER JOIN pg_roles AS owner ON owner.oid = function.proowner
       WHERE function.oid = to_regprocedure($2)`,
      [runtimeRole, functionName],
    );
    const row = result.rows[0];
    if (
      row?.runtime_allowed !== false ||
      row.security_definer !== true ||
      row.owner_safe !== true ||
      row.search_path_safe !== true ||
      row.runtime_grant_option_denied !== true ||
      row.public_denied !== true
    ) {
      throw new Error(
        "Ordinary runtime must not execute protected Staff management mutations.",
      );
    }
  }
  for (const functionName of privateStaffManagementFunctions) {
    const result = await client.query(
      `SELECT has_function_privilege($1, $2, 'EXECUTE') AS runtime_allowed,
              NOT EXISTS (
                SELECT 1 FROM aclexplode(COALESCE(function.proacl, acldefault('f', function.proowner))) AS privilege
                WHERE privilege.grantee = 0 AND privilege.privilege_type = 'EXECUTE'
              ) AS public_denied
       FROM pg_proc AS function WHERE function.oid = to_regprocedure($2)`,
      [runtimeRole, functionName],
    );
    if (
      result.rows[0]?.runtime_allowed !== false ||
      result.rows[0]?.public_denied !== true
    ) {
      throw new Error("Runtime Staff management helper privileges are unsafe.");
    }
  }
}
