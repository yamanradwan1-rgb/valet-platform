import {
  provisionStaffOnboardingPrivileges,
  verifyStaffOnboardingPrivileges,
} from "./staff-onboarding-runtime-privileges.mjs";

export const runtimeShiftForceEndFunction =
  "public.staff_shift_force_end(uuid,uuid,text,uuid,uuid,uuid,text,text,text)";
export const privateShiftForceEndFunctions = [
  "public.staff_shift_force_end_guard_history()",
  "public.staff_shift_force_end_guard_audit()",
];

export async function provisionShiftForceEndPrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  await provisionStaffOnboardingPrivileges(
    client,
    executeFormatted,
    runtimeRole,
  );
  await executeFormatted(
    client,
    "REVOKE ALL ON TABLE public.shift_force_end_closures FROM %I",
    [runtimeRole],
  );
  for (const name of [
    runtimeShiftForceEndFunction,
    ...privateShiftForceEndFunctions,
  ]) {
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      name,
      runtimeRole,
    ]);
  }
  await executeFormatted(client, "GRANT EXECUTE ON FUNCTION %s TO %I", [
    runtimeShiftForceEndFunction,
    runtimeRole,
  ]);
}

export async function verifyShiftForceEndPrivileges(client, runtimeRole) {
  await verifyStaffOnboardingPrivileges(client, runtimeRole);
  for (const name of [
    runtimeShiftForceEndFunction,
    ...privateShiftForceEndFunctions,
  ]) {
    const result = await client.query(
      `SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed,
        f.prosecdef AND f.proconfig=ARRAY['search_path=pg_catalog, public']::text[]
          AND owner.rolname<>$1 AS definition_safe,
        NOT EXISTS (
          SELECT 1 FROM aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) acl
          WHERE acl.privilege_type='EXECUTE' AND (acl.grantee=0 OR acl.is_grantable)
        ) AS acl_safe
       FROM pg_proc f JOIN pg_roles owner ON owner.oid=f.proowner
       WHERE f.oid=to_regprocedure($2)`,
      [runtimeRole, name],
    );
    const row = result.rows[0];
    if (
      row?.allowed !== (name === runtimeShiftForceEndFunction) ||
      !row.definition_safe ||
      !row.acl_safe
    )
      throw new Error("Shift Force End function privileges are unsafe.");
  }
  const result = await client.query(
    `SELECT has_table_privilege($1,'public.shift_force_end_closures',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege($1,'public.shift_force_end_closures',
      'SELECT,INSERT,UPDATE,REFERENCES') AS allowed`,
    [runtimeRole],
  );
  if (result.rows[0]?.allowed !== false)
    throw new Error("Shift Force End closure privileges are unsafe.");
}
