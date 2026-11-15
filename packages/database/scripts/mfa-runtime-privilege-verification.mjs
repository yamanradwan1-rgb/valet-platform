import {
  mfaFactorInsertColumns,
  mfaFactorUpdateColumns,
  mfaRefreshUpdateColumns,
  mfaRecoveryInsertColumns,
  mfaSessionInsertColumns,
  mfaSessionUpdateColumns,
} from "./mfa-runtime-privileges.mjs";

async function assertTablePrivileges(client, runtimeRole, table, expected) {
  const result = await client.query(
    `SELECT pg_catalog.has_table_privilege($1, $2, 'SELECT') AS can_select,
            pg_catalog.has_table_privilege($1, $2, 'INSERT') AS can_insert,
            pg_catalog.has_table_privilege($1, $2, 'UPDATE') AS can_update,
            pg_catalog.has_table_privilege($1, $2, 'DELETE') AS can_delete,
            pg_catalog.has_table_privilege($1, $2, 'TRUNCATE') AS can_truncate,
            pg_catalog.has_table_privilege($1, $2, 'REFERENCES') AS can_reference,
            pg_catalog.has_table_privilege($1, $2, 'TRIGGER') AS can_trigger`,
    [runtimeRole, `public.${table}`],
  );
  const row = result.rows[0];
  if (
    row?.can_select !== expected.select ||
    row.can_insert !== expected.insert ||
    row.can_update !== false ||
    row.can_delete !== false ||
    row.can_truncate !== false ||
    row.can_reference !== false ||
    row.can_trigger !== false
  ) {
    throw new Error(`Runtime ${table} table privileges are unsafe.`);
  }
}

async function assertColumnPrivileges(
  client,
  runtimeRole,
  table,
  privilege,
  allowedColumns,
) {
  const columns = await client.query(
    `SELECT column_name,
            pg_catalog.has_column_privilege(
              $1, pg_catalog.format('public.%I', $2::text), column_name, $3::text
            ) AS allowed
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $2::text
     ORDER BY ordinal_position`,
    [runtimeRole, table, privilege],
  );
  const allowed = new Set(allowedColumns);
  if (
    columns.rows.length === 0 ||
    columns.rows.some((row) => row.allowed !== allowed.has(row.column_name))
  ) {
    throw new Error(
      `Runtime ${table} ${privilege} column privileges are unsafe.`,
    );
  }
}

async function assertPublicDenied(client, table) {
  const result = await client.query(
    `SELECT NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_class AS relation
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
       ) AS privilege
       WHERE relation.oid =
         pg_catalog.format('public.%I', $1::text)::pg_catalog.regclass
         AND privilege.grantee = 0
         AND privilege.privilege_type IN
           ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
     ) AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_attribute AS attribute
       CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
       WHERE attribute.attrelid =
         pg_catalog.format('public.%I', $1::text)::pg_catalog.regclass
         AND attribute.attnum > 0 AND NOT attribute.attisdropped
         AND privilege.grantee = 0
         AND privilege.privilege_type IN ('SELECT','INSERT','UPDATE','REFERENCES')
     ) AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_default_acl AS defaults
       CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) AS privilege
       WHERE defaults.defaclobjtype = 'r'
         AND defaults.defaclnamespace IN (
           0, (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = 'public')
         )
         AND pg_catalog.has_schema_privilege(
           defaults.defaclrole, 'public', 'CREATE'
         )
         AND privilege.grantee = 0
         AND privilege.privilege_type IN
           ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
     ) AS denied`,
    [table],
  );
  if (result.rows[0]?.denied !== true) {
    throw new Error(`PUBLIC ${table} privileges are unsafe.`);
  }
}

export async function verifyMfaPrivileges(
  client, runtimeRole, protectedEnabled = false, staffAuthProtected = false,
) {
  await assertTablePrivileges(client, runtimeRole, "staff_auth_sessions", {
    insert: false,
    select: true,
  });
  await assertTablePrivileges(
    client,
    runtimeRole,
    "staff_refresh_credentials",
    {
      insert: false,
      select: true,
    },
  );
  for (const table of ["staff_auth_sessions", "staff_refresh_credentials"]) {
    await assertPublicDenied(client, table);
  }
  for (const table of ["user_mfa_totp_factors", "mfa_recovery_codes"]) {
    await assertTablePrivileges(client, runtimeRole, table, {
      insert: false,
      select: true,
    });
    await assertPublicDenied(client, table);
  }
  await assertColumnPrivileges(
    client,
    runtimeRole,
    "staff_auth_sessions",
    "INSERT",
    staffAuthProtected ? [] : mfaSessionInsertColumns,
  );
  await assertColumnPrivileges(
    client,
    runtimeRole,
    "staff_auth_sessions",
    "UPDATE",
    protectedEnabled || staffAuthProtected
      ? mfaSessionUpdateColumns.filter((column) =>
          ![
            ...(protectedEnabled
              ? ["mfa_authenticated_at", "mfa_factor_id",
                "last_admin_activity_at"]
              : []),
            ...(staffAuthProtected
              ? ["current_access_token_hash", "access_expires_at",
                "last_rotated_at"]
              : []),
          ].includes(column))
      : mfaSessionUpdateColumns,
  );
  await assertColumnPrivileges(
    client,
    runtimeRole,
    "staff_refresh_credentials",
    "UPDATE",
    staffAuthProtected ? [] : mfaRefreshUpdateColumns,
  );
  await assertColumnPrivileges(
    client,
    runtimeRole,
    "user_mfa_totp_factors",
    "INSERT",
    protectedEnabled ? [] : mfaFactorInsertColumns,
  );
  await assertColumnPrivileges(
    client,
    runtimeRole,
    "user_mfa_totp_factors",
    "UPDATE",
    protectedEnabled ? [] : mfaFactorUpdateColumns,
  );
  await assertColumnPrivileges(
    client,
    runtimeRole,
    "mfa_recovery_codes",
    "INSERT",
    protectedEnabled ? [] : mfaRecoveryInsertColumns,
  );
  await assertColumnPrivileges(
    client,
    runtimeRole,
    "mfa_recovery_codes",
    "UPDATE",
    protectedEnabled ? [] : ["consumed_at"],
  );
  for (const table of [
    "staff_auth_sessions",
    "staff_refresh_credentials",
    "user_mfa_totp_factors",
    "mfa_recovery_codes",
  ]) {
    await assertColumnPrivileges(client, runtimeRole, table, "REFERENCES", []);
  }
  for (const fn of [
    "public.mfa_totp_factor_guard()",
    "public.mfa_recovery_code_guard()",
  ]) {
    const result = await client.query(
      `SELECT pg_catalog.has_function_privilege($1, $2, 'EXECUTE') AS runtime_allowed,
              NOT EXISTS (
                SELECT 1 FROM pg_catalog.aclexplode(
                  COALESCE(
                    function.proacl,
                    pg_catalog.acldefault('f', function.proowner)
                  )
                ) AS privilege
                WHERE privilege.grantee = 0
                  AND privilege.privilege_type = 'EXECUTE'
              ) AS public_denied
       FROM pg_catalog.pg_proc AS function
       WHERE function.oid = pg_catalog.to_regprocedure($2)`,
      [runtimeRole, fn],
    );
    if (
      result.rows[0]?.runtime_allowed !== false ||
      result.rows[0]?.public_denied !== true
    ) {
      throw new Error("Runtime MFA guard function privileges are unsafe.");
    }
  }
}
