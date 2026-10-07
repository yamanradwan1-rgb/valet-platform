export const runtimeGuestBrowserFunctions = [
  "public.guest_browser_enroll(text,text)",
  "public.guest_browser_exchange(text,text,text)",
  "public.guest_browser_resolve(text,boolean)",
  "public.guest_browser_end(text)",
  "public.guest_browser_rating_submit(text,integer)",
];

export const privateGuestBrowserFunctions = [
  "public.guest_browser_bridge_legacy_generation()",
  "public.guest_browser_hash_secret(text)",
  "public.guest_browser_invalidate_on_generation_change()",
];

const guestBrowserTables = [
  "public.guest_browser_enrollments",
  "public.guest_browser_sessions",
];

export async function provisionGuestBrowserPrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  for (const table of guestBrowserTables) {
    await client.query(`REVOKE ALL ON TABLE ${table} FROM PUBLIC`);
    await executeFormatted(client, "REVOKE ALL ON TABLE %s FROM %I", [
      table,
      runtimeRole,
    ]);
  }
  for (const functionName of [
    ...runtimeGuestBrowserFunctions,
    ...privateGuestBrowserFunctions,
  ]) {
    await client.query(`REVOKE ALL ON FUNCTION ${functionName} FROM PUBLIC`);
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      functionName,
      runtimeRole,
    ]);
  }
  for (const functionName of runtimeGuestBrowserFunctions) {
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
            function.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AS search_path_safe,
            NOT EXISTS (
              SELECT 1 FROM aclexplode(COALESCE(function.proacl,acldefault('f',function.proowner))) privilege
              WHERE privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
            ) AS public_denied
       FROM pg_proc function
       INNER JOIN pg_roles owner ON owner.oid=function.proowner
      WHERE function.oid=to_regprocedure($2)`,
    [runtimeRole, functionName],
  );
  return result.rows[0];
}

export async function verifyGuestBrowserPrivileges(client, runtimeRole) {
  for (const table of guestBrowserTables) {
    const result = await client.query(
      `SELECT has_table_privilege($1,$2,'SELECT') AS select_allowed,
              has_table_privilege($1,$2,'INSERT') AS insert_allowed,
              has_table_privilege($1,$2,'UPDATE') AS update_allowed,
              has_table_privilege($1,$2,'DELETE') AS delete_allowed,
              has_table_privilege($1,$2,'TRUNCATE') AS truncate_allowed`,
      [runtimeRole, table],
    );
    const row = result.rows[0];
    if (
      row?.select_allowed !== false ||
      row.insert_allowed !== false ||
      row.update_allowed !== false ||
      row.delete_allowed !== false ||
      row.truncate_allowed !== false
    ) {
      throw new Error("Runtime Guest Browser Session table privileges are unsafe.");
    }
  }
  for (const functionName of runtimeGuestBrowserFunctions) {
    const security = await functionSecurity(client, runtimeRole, functionName);
    if (
      security?.runtime_allowed !== true ||
      security.security_definer !== true ||
      security.owner_safe !== true ||
      security.search_path_safe !== true ||
      security.public_denied !== true
    ) {
      throw new Error("Runtime Guest Browser Session function privileges are unsafe.");
    }
  }
  for (const functionName of privateGuestBrowserFunctions) {
    const security = await functionSecurity(client, runtimeRole, functionName);
    if (security?.runtime_allowed !== false || security?.public_denied !== true) {
      throw new Error("Runtime Guest Browser Session helper privileges are unsafe.");
    }
  }
}
