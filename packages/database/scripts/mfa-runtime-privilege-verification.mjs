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
    `SELECT has_table_privilege($1, $2, 'SELECT') AS can_select,
            has_table_privilege($1, $2, 'INSERT') AS can_insert,
            has_table_privilege($1, $2, 'UPDATE') AS can_update,
            has_table_privilege($1, $2, 'DELETE') AS can_delete,
            has_table_privilege($1, $2, 'TRUNCATE') AS can_truncate,
            has_table_privilege($1, $2, 'REFERENCES') AS can_reference,
            has_table_privilege($1, $2, 'TRIGGER') AS can_trigger`,
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
            has_column_privilege(
              $1, format('public.%I', $2::text), column_name, $3::text
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
       SELECT 1 FROM pg_class AS relation
       CROSS JOIN LATERAL aclexplode(
         COALESCE(relation.relacl, acldefault('r', relation.relowner))
       ) AS privilege
       WHERE relation.oid = format('public.%I', $1::text)::regclass
         AND privilege.grantee = 0
         AND privilege.privilege_type IN
           ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
     ) AND NOT EXISTS (
       SELECT 1 FROM pg_attribute AS attribute
       CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege
       WHERE attribute.attrelid = format('public.%I', $1::text)::regclass
         AND attribute.attnum > 0 AND NOT attribute.attisdropped
         AND privilege.grantee = 0
         AND privilege.privilege_type IN ('SELECT','INSERT','UPDATE','REFERENCES')
     ) AS denied`,
    [table],
  );
  if (result.rows[0]?.denied !== true) {
    throw new Error(`PUBLIC ${table} privileges are unsafe.`);
  }
}

export async function verifyMfaPrivileges(client, runtimeRole) {
  await assertTablePrivileges(client, runtimeRole, "staff_auth_sessions", {
    insert: false,
    select: true,
  });
  await assertTablePrivileges(
    client,
    runtimeRole,
    "staff_refresh_credentials",
    {
      insert: true,
      select: true,
    },
  );
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
    mfaSessionInsertColumns,
  );
  await assertColumnPrivileges(
    client,
    runtimeRole,
    "staff_auth_sessions",
    "UPDATE",
    mfaSessionUpdateColumns,
  );
  await assertColumnPrivileges(
    client,
    runtimeRole,
    "staff_refresh_credentials",
    "UPDATE",
    mfaRefreshUpdateColumns,
  );
  await assertColumnPrivileges(
    client,
    runtimeRole,
    "user_mfa_totp_factors",
    "INSERT",
    mfaFactorInsertColumns,
  );
  await assertColumnPrivileges(
    client,
    runtimeRole,
    "user_mfa_totp_factors",
    "UPDATE",
    mfaFactorUpdateColumns,
  );
  await assertColumnPrivileges(
    client,
    runtimeRole,
    "mfa_recovery_codes",
    "INSERT",
    mfaRecoveryInsertColumns,
  );
  await assertColumnPrivileges(
    client,
    runtimeRole,
    "mfa_recovery_codes",
    "UPDATE",
    ["consumed_at"],
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
      `SELECT has_function_privilege($1, $2, 'EXECUTE') AS runtime_allowed,
              NOT EXISTS (
                SELECT 1 FROM aclexplode(
                  COALESCE(function.proacl, acldefault('f', function.proowner))
                ) AS privilege
                WHERE privilege.grantee = 0
                  AND privilege.privilege_type = 'EXECUTE'
              ) AS public_denied
       FROM pg_proc AS function WHERE function.oid = to_regprocedure($2)`,
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
