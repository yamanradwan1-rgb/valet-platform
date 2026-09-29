export const runtimePhysicalResourceFunctions = [
  "public.management_physical_resource_create_key_slot(uuid,uuid,uuid,uuid,text,text)",
  "public.management_physical_resource_create_parking_spot(uuid,uuid,uuid,uuid,text,uuid,text,text)",
];

export const privatePhysicalResourceFunctions = [
  "public.management_physical_resource_authorize_actor(uuid,uuid,uuid)",
  "public.management_physical_resource_find_replay(uuid,uuid,text,text)",
  "public.management_physical_resource_append_audit(uuid,uuid,uuid,text,text,uuid,text,text,uuid)",
  "public.management_physical_resource_guard_audit_event()",
];

const physicalResourceTables = ["key_slots", "parking_spots"];

export async function provisionPhysicalResourcePrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  for (const functionName of [
    ...runtimePhysicalResourceFunctions,
    ...privatePhysicalResourceFunctions,
  ]) {
    await client.query(`REVOKE ALL ON FUNCTION ${functionName} FROM PUBLIC`);
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      functionName,
      runtimeRole,
    ]);
  }
  for (const functionName of runtimePhysicalResourceFunctions) {
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

export async function verifyPhysicalResourcePrivileges(client, runtimeRole) {
  for (const table of physicalResourceTables) {
    const result = await client.query(
      `SELECT has_table_privilege($1,$2,'SELECT') AS can_select,
              has_table_privilege($1,$2,'INSERT') AS can_insert,
              has_table_privilege($1,$2,'UPDATE') AS can_update,
              has_table_privilege($1,$2,'DELETE') AS can_delete,
              has_table_privilege($1,$2,'TRUNCATE') AS can_truncate,
              has_any_column_privilege($1,$2,'INSERT') AS can_insert_any_column`,
      [runtimeRole, `public.${table}`],
    );
    const row = result.rows[0];
    if (
      row?.can_select !== true ||
      row.can_insert !== false ||
      row.can_update !== false ||
      row.can_delete !== false ||
      row.can_truncate !== false ||
      row.can_insert_any_column !== false
    ) {
      throw new Error("Runtime physical-resource table privileges are unsafe.");
    }
  }

  for (const functionName of runtimePhysicalResourceFunctions) {
    const row = await functionSecurity(client, runtimeRole, functionName);
    if (
      row?.runtime_allowed !== true ||
      row.security_definer !== true ||
      row.owner_safe !== true ||
      row.search_path_safe !== true ||
      row.public_denied !== true ||
      row.runtime_grant_option_denied !== true
    ) {
      throw new Error("Runtime physical-resource command privileges are unsafe.");
    }
  }
  for (const functionName of privatePhysicalResourceFunctions) {
    const row = await functionSecurity(client, runtimeRole, functionName);
    if (row?.runtime_allowed !== false || row?.public_denied !== true) {
      throw new Error("Runtime physical-resource helper privileges are unsafe.");
    }
  }
}
