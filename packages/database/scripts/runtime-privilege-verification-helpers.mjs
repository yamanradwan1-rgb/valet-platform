export const auditTablePrivileges = [
  ["public.audit_events", "SELECT", true],
  ["public.audit_events", "INSERT", true],
  ["public.audit_events", "UPDATE", false],
  ["public.audit_events", "DELETE", false],
  ["public.audit_events", "TRUNCATE", false],
  ["public.account_security_audit_events", "SELECT", false],
  ["public.account_security_audit_events", "INSERT", true],
  ["public.account_security_audit_events", "UPDATE", false],
  ["public.account_security_audit_events", "DELETE", false],
  ["public.account_security_audit_events", "TRUNCATE", false],
  ["public.account_security_audit_events", "REFERENCES", false],
  ["public.account_security_audit_events", "TRIGGER", false],
];

export async function tablePrivilegeMatches(
  client,
  runtimeRole,
  policy,
  verifyRefundInsert,
) {
  const [table, privilege, expected] = policy;
  const result = await client.query(
    `SELECT has_table_privilege($1, $2, $3) AS allowed`,
    [runtimeRole, table, privilege],
  );
  return (
    result.rows[0]?.allowed === expected &&
    (table !== "public.refunds" ||
      privilege !== "INSERT" ||
      (await verifyRefundInsert(client, runtimeRole)))
  );
}

export async function columnPrivilegeMatches(client, runtimeRole, policy) {
  const [table, column, expected] = policy;
  const result = await client.query(
    `SELECT has_column_privilege($1, $2, $3, 'UPDATE') AS allowed`,
    [runtimeRole, table, column],
  );
  return result.rows[0]?.allowed === expected;
}

export async function anyColumnPrivilegeMatches(client, runtimeRole, policy) {
  const [table, privilege, expected] = policy;
  const result = await client.query(
    `SELECT has_any_column_privilege($1, $2, $3) AS allowed`,
    [runtimeRole, table, privilege],
  );
  return result.rows[0]?.allowed === expected;
}

export async function verifyDeniedFunctionPrivilege(
  client,
  runtimeRole,
  functionName,
) {
  const result = await client.query(
    `SELECT has_function_privilege($1, $2, 'EXECUTE') AS runtime_allowed,
            owner.rolname <> $1 AS owner_safe,
            NOT EXISTS (
              SELECT 1 FROM aclexplode(
                COALESCE(function.proacl, acldefault('f', function.proowner))
              ) AS privilege
              WHERE privilege.grantee = 0
                AND privilege.privilege_type = 'EXECUTE'
            ) AS public_denied
     FROM pg_proc AS function
     INNER JOIN pg_roles AS owner ON owner.oid = function.proowner
     WHERE function.oid = to_regprocedure($2)`,
    [runtimeRole, functionName],
  );
  const row = result.rows[0];
  if (
    row?.runtime_allowed !== false ||
    row.owner_safe !== true ||
    row.public_denied !== true
  ) {
    throw new Error("Runtime function privileges are unsafe.");
  }
}
