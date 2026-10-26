export const runtimeLocationLifecycleFunctions = [
  "public.management_location_create(uuid,uuid,uuid,uuid,text,text,text,text,text,text)",
  "public.management_location_activate(uuid,uuid,uuid,timestamp with time zone)",
  "public.management_location_stop_intake(uuid,uuid,uuid,timestamp with time zone)",
  "public.management_location_resume_intake(uuid,uuid,uuid,timestamp with time zone)",
  "public.management_location_deactivate(uuid,uuid,uuid,timestamp with time zone)",
  "public.management_location_correct_currency(uuid,uuid,uuid,text,timestamp with time zone)",
  "public.management_location_correct_timezone(uuid,uuid,uuid,text,text,timestamp with time zone)",
];

export const privateLocationLifecycleFunctions = [
  "public.management_location_lock(uuid,boolean)",
  "public.management_location_authorize_actor(uuid,uuid)",
  "public.management_location_append_audit(uuid,uuid,uuid,text,jsonb,text)",
  "public.management_location_guard_audit_event()",
  "public.management_location_has_blockers(uuid,uuid)",
  "public.management_settings_authorize_actor(uuid,uuid,uuid)",
];

const locationLifecycleColumns = [
  "organization_id",
  "name",
  "code",
  "timezone",
  "currency",
  "status",
  "accepting_intake",
];

export async function provisionLocationLifecyclePrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  const functions = [
    ...runtimeLocationLifecycleFunctions,
    ...privateLocationLifecycleFunctions,
  ];
  for (const functionName of functions) {
    await client.query(`REVOKE ALL ON FUNCTION ${functionName} FROM PUBLIC`);
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      functionName,
      runtimeRole,
    ]);
  }
  for (const functionName of runtimeLocationLifecycleFunctions) {
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
            owner.rolname <> $1 AS owner_safe,
            function.proconfig = ARRAY['search_path=pg_catalog, public']::text[] AS search_path_safe,
            NOT EXISTS (
              SELECT 1
              FROM aclexplode(COALESCE(function.proacl, acldefault('f',function.proowner))) privilege
              WHERE privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
            ) AS public_denied,
            NOT EXISTS (
              SELECT 1
              FROM aclexplode(COALESCE(function.proacl, acldefault('f',function.proowner))) privilege
              JOIN pg_roles grantee ON grantee.oid=privilege.grantee
              WHERE grantee.rolname=$1 AND privilege.privilege_type='EXECUTE'
                AND privilege.is_grantable
            ) AS runtime_grant_option_denied
     FROM pg_proc function
     JOIN pg_roles owner ON owner.oid=function.proowner
     WHERE function.oid=to_regprocedure($2)`,
    [runtimeRole, functionName],
  );
  return result.rows[0];
}

export async function verifyLocationLifecyclePrivileges(client, runtimeRole) {
  const table = await client.query(
    `SELECT has_table_privilege($1,'public.locations','SELECT') AS can_select,
            has_table_privilege($1,'public.locations','INSERT') AS can_insert,
            has_table_privilege($1,'public.locations','UPDATE') AS can_update,
            has_table_privilege($1,'public.locations','DELETE') AS can_delete,
            has_table_privilege($1,'public.locations','TRUNCATE') AS can_truncate,
            has_any_column_privilege($1,'public.locations','INSERT') AS can_insert_any_column`,
    [runtimeRole],
  );
  const tableRow = table.rows[0];
  if (
    tableRow?.can_select !== true ||
    tableRow.can_insert !== false ||
    tableRow.can_update !== false ||
    tableRow.can_delete !== false ||
    tableRow.can_truncate !== false ||
    tableRow.can_insert_any_column !== false
  ) {
    throw new Error("Runtime Location lifecycle table privileges are unsafe.");
  }
  for (const column of locationLifecycleColumns) {
    const result = await client.query(
      `SELECT has_column_privilege($1,'public.locations',$2,'UPDATE') AS allowed`,
      [runtimeRole, column],
    );
    if (result.rows[0]?.allowed !== false) {
      throw new Error(
        "Runtime Location lifecycle columns are directly writable.",
      );
    }
  }
  for (const functionName of runtimeLocationLifecycleFunctions) {
    const row = await functionSecurity(client, runtimeRole, functionName);
    if (
      row?.runtime_allowed !== true ||
      row.security_definer !== true ||
      row.owner_safe !== true ||
      row.search_path_safe !== true ||
      row.public_denied !== true ||
      row.runtime_grant_option_denied !== true
    ) {
      throw new Error(
        "Runtime Location lifecycle command privileges are unsafe.",
      );
    }
  }
  for (const functionName of privateLocationLifecycleFunctions) {
    const row = await functionSecurity(client, runtimeRole, functionName);
    if (row?.runtime_allowed !== false || row?.public_denied !== true) {
      throw new Error(
        "Runtime Location lifecycle helper privileges are unsafe.",
      );
    }
  }
}
