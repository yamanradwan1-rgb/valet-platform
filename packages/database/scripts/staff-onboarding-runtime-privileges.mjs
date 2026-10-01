import {
  provisionStaffManagementPrivileges,
  verifyStaffManagementPrivileges,
} from "./staff-management-runtime-privileges.mjs";

export const runtimeStaffOnboardingFunctions = [
  "public.staff_onboarding_create(uuid,uuid,uuid,text,text,text,text,membership_role,uuid[],text)",
  "public.staff_onboarding_resend(uuid,uuid,uuid,uuid,text,text)",
];

export const privateStaffOnboardingFunctions = [
  "public.staff_onboarding_proof_current(uuid)",
  "public.staff_onboarding_lock_identity(uuid,text)",
  "public.staff_onboarding_authorize_actor(uuid,uuid)",
  "public.staff_onboarding_authorize_target(uuid,uuid,uuid,membership_role)",
  "public.staff_onboarding_append_invitation(uuid,uuid,uuid,uuid,text,text,integer,text)",
  "public.staff_onboarding_guard_audit()",
];

export async function provisionStaffOnboardingPrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  await provisionStaffManagementPrivileges(
    client,
    executeFormatted,
    runtimeRole,
  );
  await executeFormatted(
    client,
    "REVOKE ALL ON TABLE public.staff_onboarding_invitations FROM %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "GRANT SELECT ON TABLE public.staff_onboarding_invitations TO %I",
    [runtimeRole],
  );
  for (const name of privateStaffOnboardingFunctions) {
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      name,
      runtimeRole,
    ]);
  }
  for (const name of runtimeStaffOnboardingFunctions) {
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      name,
      runtimeRole,
    ]);
    await executeFormatted(client, "GRANT EXECUTE ON FUNCTION %s TO %I", [
      name,
      runtimeRole,
    ]);
  }
}

export async function verifyStaffOnboardingPrivileges(client, runtimeRole) {
  for (const [name, allowed] of [
    ...runtimeStaffOnboardingFunctions.map((name) => [name, true]),
    ...privateStaffOnboardingFunctions.map((name) => [name, false]),
  ]) {
    const result = await client.query(
      `SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed,
        function.prosecdef AS security_definer,
        function.proconfig = ARRAY['search_path=pg_catalog, public']::text[] AS path_safe,
        owner.rolname <> $1 AS owner_safe,
        NOT EXISTS (
          SELECT 1 FROM aclexplode(COALESCE(function.proacl,acldefault('f',function.proowner))) AS acl
          WHERE acl.privilege_type = 'EXECUTE' AND (acl.grantee=0 OR acl.is_grantable)
        ) AS acl_safe
       FROM pg_proc AS function JOIN pg_roles AS owner ON owner.oid=function.proowner
       WHERE function.oid=to_regprocedure($2)`,
      [runtimeRole, name],
    );
    const row = result.rows[0];
    if (
      row?.allowed !== allowed ||
      (allowed && row.security_definer !== true) ||
      !row.path_safe ||
      !row.owner_safe ||
      !row.acl_safe
    ) {
      throw new Error("Staff onboarding function privileges are unsafe.");
    }
  }
  for (const privilege of [
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRUNCATE",
    "REFERENCES",
    "TRIGGER",
  ]) {
    const result = await client.query(
      `SELECT has_table_privilege($1,'public.staff_onboarding_invitations',$2) AS allowed`,
      [runtimeRole, privilege],
    );
    if (result.rows[0]?.allowed !== false)
      throw new Error("Staff onboarding table privileges are unsafe.");
  }
  // Preserve existing ordinary command verification in the same provision boundary.
  await verifyStaffManagementPrivileges(client, runtimeRole);
}
