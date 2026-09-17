export const runtimeVisitContactFunctions = [
  "public.management_visit_contact_correct_name(uuid,uuid,uuid,text,timestamp with time zone)",
  "public.management_visit_contact_correct_phone(uuid,uuid,uuid,text,timestamp with time zone)",
];

export const privateVisitContactFunctions = [
  "public.management_visit_contact_authorize_actor(uuid,uuid)",
  "public.management_visit_contact_append_audit(uuid,uuid,uuid,text,jsonb)",
  "public.management_visit_contact_guard_audit_event()",
];

export async function provisionVisitContactPrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  for (const functionName of [
    ...runtimeVisitContactFunctions,
    ...privateVisitContactFunctions,
  ]) {
    await client.query(`REVOKE ALL ON FUNCTION ${functionName} FROM PUBLIC`);
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      functionName,
      runtimeRole,
    ]);
  }
  for (const functionName of runtimeVisitContactFunctions) {
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

export async function verifyVisitContactPrivileges(client, runtimeRole) {
  const table = await client.query(
    `SELECT has_table_privilege($1,'public.customers','UPDATE') AS customer_update,
            has_table_privilege($1,'public.customers','DELETE') AS customer_delete,
            has_table_privilege($1,'public.vehicles','DELETE') AS vehicle_delete`,
    [runtimeRole],
  );
  if (table.rows[0]?.customer_update !== false ||
      table.rows[0]?.customer_delete !== false ||
      table.rows[0]?.vehicle_delete !== false) {
    throw new Error("Runtime Visit Contact table privileges are unsafe.");
  }
  for (const functionName of runtimeVisitContactFunctions) {
    const row = await functionSecurity(client, runtimeRole, functionName);
    if (row?.runtime_allowed !== true || row.security_definer !== true ||
        row.search_path_safe !== true || row.public_denied !== true ||
        row.runtime_grant_option_denied !== true) {
      throw new Error("Runtime Visit Contact command privileges are unsafe.");
    }
  }
  for (const functionName of privateVisitContactFunctions) {
    const row = await functionSecurity(client, runtimeRole, functionName);
    if (row?.runtime_allowed !== false || row?.public_denied !== true) {
      throw new Error("Runtime Visit Contact helper privileges are unsafe.");
    }
  }
}
